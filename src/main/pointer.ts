import type { CompanionWindow } from './companionWindow';
import type { MarkerWindow } from './markerWindow';
import type { PointTarget } from './chat';
import { loadSettings } from './settings';

/** How long the character stays at each spot before walking to the next. */
const DWELL_MS = 1800;
/** Give up waiting for the walk to finish after this long and point anyway. */
const WALK_TIMEOUT_MS = 6000;
/** Room the bubble needs beside the character's head (its window width plus a gap). */
const BUBBLE_ROOM = 360;

export type BubbleSide = 'left' | 'right';

/**
 * Walks the character to each [point] target in turn: stand beside it, face it, play the
 * point reaction and ring the exact spot. Targets arrive while the answer streams, so they
 * queue up and are visited one after another.
 */
export class Pointer {
  private queue: PointTarget[] = [];
  private running = false;
  /** Bumped by clear(), so a visit in progress knows to stop. */
  private generation = 0;
  /** The character left its spot to point, so it should walk back afterwards. */
  private moved = false;
  /** Called after each walk with the character's head (screen point) and the side the bubble should take. */
  onMove: ((head: { x: number; y: number }, side: BubbleSide) => void) | null = null;

  constructor(private companion: CompanionWindow, private marker: MarkerWindow) {}

  point(target: PointTarget): void {
    this.queue.push(target);
    if (!this.running) void this.run();
  }

  /** Drop pending targets and the marker. With walkHome, a character that moved walks back home. */
  clear(walkHome: boolean): void {
    this.generation++;
    this.queue = [];
    this.marker.hide();
    if (walkHome && this.moved) {
      this.moved = false;
      const home = this.companion.home;
      this.companion.send({ type: 'moveTo', x: home.x, y: home.y, walk: true });
    }
  }

  private async run(): Promise<void> {
    this.running = true;
    try {
      while (this.queue.length) await this.visit(this.queue.shift()!);
    } finally {
      this.running = false;
    }
  }

  private async visit(target: PointTarget): Promise<void> {
    const gen = this.generation;
    this.marker.hide();
    const scale = loadSettings().scale;
    const area = this.companion.window?.getBounds();
    const look = this.companion.toCanvas(target);
    const reachable = !!area && target.x >= area.x && target.x <= area.x + area.width && target.y >= area.y && target.y <= area.y + area.height;

    let side: BubbleSide = 'left';
    if (reachable) {
      const spot = this.standBeside(target, area, scale);
      side = spot.side;
      const feet = this.companion.toCanvas(spot);
      const moving = Math.hypot(feet.x - this.companion.feet.x, feet.y - this.companion.feet.y) > 4;
      if (moving) {
        this.moved = true;
        const arrived = this.arrival();
        this.companion.send({ type: 'moveTo', x: feet.x, y: feet.y, walk: true });
        this.companion.send({ type: 'lookAt', x: look.x, y: look.y });
        await arrived;
        if (gen !== this.generation) return;
      }
    }
    // On another display the character cannot walk there, so it turns and points that way.
    this.companion.send({ type: 'lookAt', x: look.x, y: look.y });
    this.companion.send({ type: 'react', clip: 'point' });
    void this.marker.show(target, target.label);
    if (reachable) {
      const f = this.companion.feet;
      this.onMove?.(this.companion.toScreen({ x: f.x, y: f.y - scale * 0.9 }), side);
    }
    await this.wait(DWELL_MS, gen);
  }

  /**
   * Where to stand so the target is at about hand height, just beside the character, on the
   * side that leaves the bubble room to sit beyond the character rather than over the target.
   */
  private standBeside(t: { x: number; y: number }, area: Electron.Rectangle, scale: number): { x: number; y: number; side: BubbleSide } {
    const gap = scale * 0.45;
    const side: BubbleSide = t.x - gap - BUBBLE_ROOM >= area.x ? 'left' : 'right';
    let x = side === 'left' ? t.x - gap : t.x + gap;
    x = Math.min(Math.max(area.x + scale * 0.4, x), area.x + area.width - scale * 0.4);
    let y = t.y + scale * 0.55;
    y = Math.min(Math.max(area.y + scale, y), area.y + area.height - 10);
    return { x, y, side };
  }

  /** Resolves when the renderer reports the walk finished, or after a timeout. */
  private arrival(): Promise<void> {
    return new Promise((resolve) => {
      const done = (): void => { clearTimeout(timer); off(); resolve(); };
      const off = this.companion.onEvent((e) => { if (e.type === 'arrived') done(); });
      const timer = setTimeout(done, WALK_TIMEOUT_MS);
    });
  }

  /** Wait ms, or less if clear() is called meanwhile. */
  private async wait(ms: number, gen: number): Promise<void> {
    const end = Date.now() + ms;
    while (Date.now() < end && gen === this.generation) await new Promise((r) => setTimeout(r, 100));
  }
}
