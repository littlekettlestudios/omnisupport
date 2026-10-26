// 2D companion renderer: plays the LKF pixel sprite sheets (assets/sprites/<name>/atlas.json)
// instead of the 3D model. Same protocol as index.ts (hover → click-through, drag, moveTo,
// states, reactions); the character turns to one of eight facings from the way it travels
// or looks, and each frame is held for its own time from the atlas.
import type { Command, CompanionConfig, CompanionState, ReactionClip } from '@shared/protocol';

type Pt = [number, number];
interface Clip {
  sheet: string; frames: number; frame_w: number; frame_h: number; loop: boolean;
  durations_ms: number[]; emote: string | null; origin: Pt;
  rows: Record<string, number>; anchors: Record<string, Pt[]>; root: Record<string, Pt[]>;
  ground_speed_px_s?: number;
}
interface Atlas {
  pixels_per_metre: number; facings: string[]; clips: Record<string, Clip>;
  emotes: { sheet: string; frame_size: number; anchor_gap: number; emotes: Record<string, { row: number; frames: number; fps: number }> };
}
interface Sheet { image: ImageBitmap; alpha: Uint8Array; width: number }

/** Clip per state, first one present wins. */
const STATE_CLIP: Record<CompanionState, string[]> = {
  idle: ['idle'], attentive: ['idle'], thinking: ['thinking', 'idle'], searching: ['thinking', 'idle'],
  talking: ['idle'], sleeping: ['idle'],
};
/** The sheets have one cheerful and one sad one-shot; every reaction maps onto those. */
const REACTION_CLIP: Record<ReactionClip, string[]> = {
  wave: ['success'], point: ['success'], happy: ['success'], excited: ['success'], nod: ['success'], sorry: ['failure'],
};
const HOLD_END_MS: Record<string, number> = { success: 300, failure: 900 }; // rest on the last frame before going back
// Screen direction (atan2 with y down) in 45° steps from +x, to the facing that looks that way.
const SECTORS = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
const MAX_TRAVEL_S = 1.2;      // the bubble opens right away, so the walk can't take long
const RUN_FROM_PX = 220;       // longer trips run instead of walk
const MAX_RATE = 2.4;          // play the cycle at most this much faster to keep up; beyond it the feet slide

async function loadSheet(url: string): Promise<Sheet> {
  // Through fetch, so the bitmap isn't tainted and its alpha can be read for hit-testing.
  const image = await createImageBitmap(await (await fetch(url)).blob());
  const off = new OffscreenCanvas(image.width, image.height);
  const c = off.getContext('2d')!;
  c.drawImage(image, 0, 0);
  const rgba = c.getImageData(0, 0, image.width, image.height).data;
  const alpha = new Uint8Array(image.width * image.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
  return { image, alpha, width: image.width };
}

export async function start(config: CompanionConfig): Promise<void> {
  const atlas: Atlas = await (await fetch(config.spritesUrl!)).json();
  const at = (file: string): string => new URL(file, config.spritesUrl!).href;
  const sheets: Record<string, Sheet> = {};
  await Promise.all(Object.entries(atlas.clips).map(async ([name, c]) => { sheets[name] = await loadSheet(at(c.sheet)); }));
  const emoteSheet = await loadSheet(at(atlas.emotes.sheet));

  const bridge = window.clippet;
  const canvas = document.getElementById('stage') as HTMLCanvasElement;
  const { width, height, dpr } = config.canvas;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  // Whole sprite pixels per metre-scaled pixel, so the art stays crisp.
  const zoomFor = (scale: number): number => Math.max(1, Math.round(scale / atlas.pixels_per_metre));
  let zoom = zoomFor(config.scale);
  const rm = config.reducedMotion;
  const has = (name: string): boolean => name in atlas.clips;
  const pick = (names: string[]): string => names.find(has) ?? Object.keys(atlas.clips)[0];

  // ---- playback ------------------------------------------------------------
  let state: CompanionState = 'idle';
  let visible = true;
  let facing = 'S';
  const pos = { x: config.home.x, y: config.home.y };   // feet, canvas px
  let move: { fx: number; fy: number; tx: number; ty: number; t: number; dur: number } | null = null;
  let look: { x: number; y: number } | null = null;
  let play = { clip: pick(STATE_CLIP.idle), i: 0, t: 0, rate: 1, once: false, held: 0 };
  let emoteClock = 0;

  function setLoop(name: string, rate = 1): void {
    if (play.clip === name && !play.once) { play.rate = rate; return; }
    play = { clip: name, i: 0, t: 0, rate, once: false, held: 0 };
  }
  function stateLoop(): void {
    if (move) return;
    setLoop(pick(STATE_CLIP[state]), state === 'sleeping' ? 0.5 : 1);
  }
  function playOnce(name: string): void { play = { clip: name, i: 0, t: 0, rate: 1, once: true, held: 0 }; }

  const facingTo = (dx: number, dy: number): string => {
    const k = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
    return SECTORS[((k % 8) + 8) % 8];
  };
  function faceLook(): void {
    if (!look) { facing = 'S'; return; }
    const dx = look.x - pos.x, dy = look.y - (pos.y - config.scale * 0.6);   // from about chest height
    if (Math.hypot(dx, dy) > 30) facing = facingTo(dx, dy);
  }

  function apply(cmd: Command): void {
    switch (cmd.type) {
      case 'setState': state = cmd.state; if (!play.once) stateLoop(); break;
      case 'moveTo': {
        const dx = cmd.x - pos.x, dy = cmd.y - pos.y, dist = Math.hypot(dx, dy);
        if (!cmd.walk || rm || dist < 2) {
          pos.x = cmd.x; pos.y = cmd.y; move = null; faceLook();
          bridge.send({ type: 'arrived', x: cmd.x, y: cmd.y });
          break;
        }
        const gait = dist > RUN_FROM_PX && has('run') ? 'run' : pick(['walk', 'run', 'idle']);
        const ground = (atlas.clips[gait].ground_speed_px_s ?? 30) * zoom;
        const speed = Math.max(ground, dist / MAX_TRAVEL_S);
        move = { fx: pos.x, fy: pos.y, tx: cmd.x, ty: cmd.y, t: 0, dur: dist / speed };
        facing = facingTo(dx, dy);
        play = { clip: gait, i: 0, t: 0, rate: Math.min(MAX_RATE, speed / ground), once: false, held: 0 };
        break;
      }
      case 'lookAt':
        look = cmd.x == null || cmd.y == null ? null : { x: cmd.x, y: cmd.y };
        if (!move) faceLook();
        break;
      case 'react': if (!move) playOnce(pick(REACTION_CLIP[cmd.clip])); break;
      case 'setVisible': visible = cmd.visible; break;
      case 'setScale': zoom = zoomFor(cmd.scale); break;
      case 'reload': location.reload(); break;   // new window size or a switch back to 3D
    }
  }
  bridge.onCommand(apply);

  function advance(dt: number): void {
    emoteClock += dt;
    if (move) {
      move.t += dt / 1000;
      const k = Math.min(1, move.t / move.dur);
      pos.x = move.fx + (move.tx - move.fx) * k;
      pos.y = move.fy + (move.ty - move.fy) * k;
      if (k >= 1) {
        const { tx, ty } = move;
        move = null;
        faceLook();
        stateLoop();
        bridge.send({ type: 'arrived', x: tx, y: ty });
      }
    }
    const c = atlas.clips[play.clip];
    if (rm && !play.once && !move) { play.i = 0; return; }   // reduced motion: loops hold still
    play.t += dt * play.rate;
    for (;;) {
      const last = play.i === c.frames - 1;
      if (play.once && last) {
        play.held += dt;
        if (play.held >= (HOLD_END_MS[play.clip] ?? 300)) { play.once = false; stateLoop(); }
        return;
      }
      if (play.t < c.durations_ms[play.i]) return;
      play.t -= c.durations_ms[play.i];
      play.i = last ? 0 : play.i + 1;
    }
  }

  // ---- drawing ---------------------------------------------------------------
  let drawn = '';
  let placed: { x0: number; y0: number; c: Clip; sheet: Sheet; row: number; i: number } | null = null;

  function draw(): void {
    const c = atlas.clips[play.clip];
    const row = c.rows[facing] ?? 0;
    const em = c.emote ? atlas.emotes.emotes[c.emote] : null;
    const ef = em ? Math.floor((emoteClock / 1000) * em.fps) % em.frames : 0;
    const x0 = Math.round(pos.x - c.origin[0] * zoom), y0 = Math.round(pos.y - c.origin[1] * zoom);
    const key = `${visible}|${play.clip}|${play.i}|${row}|${x0},${y0}|${zoom}|${ef}|${state === 'sleeping'}`;
    if (key === drawn) return;
    drawn = key;
    placed = { x0, y0, c, sheet: sheets[play.clip], row, i: play.i };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (!visible) return;
    const r = c.root[facing]?.[play.i] ?? c.origin;
    ctx.fillStyle = 'rgba(20, 16, 30, 0.22)';
    ctx.beginPath();
    ctx.ellipse(x0 + r[0] * zoom, y0 + r[1] * zoom, 13 * zoom, 3.5 * zoom, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = state === 'sleeping' ? 0.75 : 1;
    ctx.drawImage(sheets[play.clip].image, play.i * c.frame_w, row * c.frame_h, c.frame_w, c.frame_h,
      x0, y0, c.frame_w * zoom, c.frame_h * zoom);
    if (em && !move) {
      const S = atlas.emotes.frame_size, a = c.anchors[facing][play.i];
      ctx.drawImage(emoteSheet.image, ef * S, em.row * S, S, S,
        Math.round(x0 + (a[0] - S / 2) * zoom), Math.round(y0 + (a[1] - atlas.emotes.anchor_gap - S) * zoom), S * zoom, S * zoom);
    }
    ctx.globalAlpha = 1;
  }

  // ---- pointer: hover (click-through), click, drag --------------------------
  let over = false;
  let leaveTimer: number | null = null;
  let pointerDown = false;
  let drag: { sx: number; sy: number; ox: number; oy: number; moved: boolean } | null = null;

  /** Opaque sprite pixel under (x, y), give or take one sprite pixel. */
  function hitAt(x: number, y: number): boolean {
    if (!visible || !placed) return false;
    const { x0, y0, c, sheet, row, i } = placed;
    const u = Math.floor((x - x0) / zoom), v = Math.floor((y - y0) / zoom);
    for (let dv = -1; dv <= 1; dv++) for (let du = -1; du <= 1; du++) {
      const uu = u + du, vv = v + dv;
      if (uu < 0 || vv < 0 || uu >= c.frame_w || vv >= c.frame_h) continue;
      if (sheet.alpha[(row * c.frame_h + vv) * sheet.width + i * c.frame_w + uu] > 127) return true;
    }
    return false;
  }

  function setOver(v: boolean): void {
    // Never go click-through while the button is down (see index.ts).
    if (!v && (pointerDown || drag)) return;
    if (v === over) return;
    over = v;
    bridge.send({ type: 'hover', over });
    canvas.style.cursor = over ? 'grab' : 'default';
  }
  function scheduleLeave(): void {
    if (leaveTimer) return;
    leaveTimer = window.setTimeout(() => { leaveTimer = null; setOver(false); }, 120);
  }
  function hoverAt(x: number, y: number): void {
    if (hitAt(x, y)) { if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; } setOver(true); }
    else if (over) scheduleLeave();
  }

  window.addEventListener('pointermove', (e) => {
    if (drag) {
      const x = e.clientX + drag.ox, y = e.clientY + drag.oy;
      if (Math.hypot(x - drag.sx, y - drag.sy) > 4) drag.moved = true;
      pos.x = x; pos.y = y; move = null;
      return;
    }
    hoverAt(e.clientX, e.clientY);
  });
  bridge.onCommand((cmd) => { if (cmd.type === 'cursor' && !drag) hoverAt(cmd.x, cmd.y); });
  window.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !hitAt(e.clientX, e.clientY)) return;
    pointerDown = true;
    if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; }
    drag = { sx: pos.x, sy: pos.y, ox: pos.x - e.clientX, oy: pos.y - e.clientY, moved: false };
    canvas.style.cursor = 'grabbing';
  });
  function endPress(e: PointerEvent): void {
    pointerDown = false;
    if (!drag) return;
    if (drag.moved) bridge.send({ type: 'dragEnd', x: pos.x, y: pos.y });
    else bridge.send({ type: 'click' });
    drag = null;
    canvas.style.cursor = over ? 'grab' : 'default';
    if (!hitAt(e.clientX, e.clientY)) scheduleLeave();
  }
  window.addEventListener('pointerup', endPress);
  window.addEventListener('pointercancel', endPress);
  window.addEventListener('pointerleave', () => { if (over) scheduleLeave(); });
  window.addEventListener('blur', () => { if (!pointerDown) scheduleLeave(); });

  // ---- loop ------------------------------------------------------------------
  let last = performance.now();
  function tick(now: number): void {
    advance(Math.min(100, now - last));
    last = now;
    draw();
    // Frames are held 50-300 ms, so ~25 fps is plenty when nothing travels or is grabbed.
    if (move || drag) requestAnimationFrame(tick);
    else setTimeout(() => requestAnimationFrame(tick), 40);
  }

  bridge.send({ type: 'ready', hasRig: true, clips: Object.keys(atlas.clips) });
  requestAnimationFrame(tick);
}
