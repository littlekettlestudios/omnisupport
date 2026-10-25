// M0 placeholder companion. Codex replaces this file with the real renderer; the
// protocol handling (hover → click-through, drag, moveTo, states) is the part to keep.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Command, CompanionState, ReactionClip } from '@shared/protocol';

const bridge = window.clippet;
const canvas = document.getElementById('stage') as HTMLCanvasElement;

const config = await bridge.getConfig();
const { width, height, dpr } = config.canvas;

const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true });
renderer.setPixelRatio(dpr);
renderer.setSize(width, height, true);
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// Orthographic camera in canvas pixels: world (x, y) = (px - w/2, h/2 - py).
const camera = new THREE.OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, -2000, 2000);
camera.position.set(0, 0, 1000);
camera.lookAt(0, 0, 0);
const toWorld = (px: number, py: number): THREE.Vector2 => new THREE.Vector2(px - width / 2, height / 2 - py);
const toCanvas = (wx: number, wy: number): { x: number; y: number } => ({ x: wx + width / 2, y: height / 2 - wy });

const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(300, 600, 800);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
scene.add(sun);

// Character root: origin at the feet.
const root = new THREE.Group();
scene.add(root);
let scale = config.scale;

// Shadow catcher under the feet.
const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.ShadowMaterial({ opacity: 0.25 }));
shadowPlane.rotation.x = -Math.PI / 2;
shadowPlane.receiveShadow = true;
root.add(shadowPlane);

// Body holder in 1 m units, scaled to `scale` px.
const body = new THREE.Group();
root.add(body);
let hitVolume: THREE.Mesh;

function buildPlaceholder(): void {
  body.clear();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffb347, roughness: 0.6 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.3, 8, 16), mat);
  torso.position.y = 0.4;
  torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 24, 16), mat);
  head.position.y = 0.85;
  head.castShadow = true;
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), eyeMat);
    eye.position.set(sx * 0.1, 0.04, 0.26);
    head.add(eye);
  }
  head.name = 'head';
  body.add(torso, head);
  hitVolume = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.7, 4, 8), new THREE.MeshBasicMaterial({ visible: false }));
  hitVolume.position.y = 0.55;
  body.add(hitVolume);
}

async function loadModel(url: string): Promise<{ hasRig: boolean; clips: string[] }> {
  try {
    const gltf = await new GLTFLoader().loadAsync(url);
    body.clear();
    gltf.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    body.add(gltf.scene);
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3());
    hitVolume = new THREE.Mesh(
      new THREE.CapsuleGeometry(Math.max(size.x, size.z) * 0.6, Math.max(0, size.y - size.x), 4, 8),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    hitVolume.position.y = size.y / 2;
    body.add(hitVolume);
    let hasRig = false;
    gltf.scene.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) hasRig = true; });
    return { hasRig, clips: gltf.animations.map((a) => a.name) };
  } catch (err) {
    console.warn('[companion] no model at', url, '- using placeholder', err);
    buildPlaceholder();
    return { hasRig: false, clips: [] };
  }
}

// ---- state ---------------------------------------------------------------
let state: CompanionState = 'idle';
let reaction: { clip: ReactionClip; t: number } | null = null;
let lookTarget: THREE.Vector2 | null = null;
const pos = toWorld(config.home.x, config.home.y);
let move: { from: THREE.Vector2; to: THREE.Vector2; t: number; dur: number } | null = null;
let visible = true;
let facing = 1; // +1 faces +x (right), -1 left

function apply(cmd: Command): void {
  switch (cmd.type) {
    case 'setState': state = cmd.state; break;
    case 'moveTo': {
      const to = toWorld(cmd.x, cmd.y);
      if (!cmd.walk) { pos.copy(to); move = null; bridge.send({ type: 'arrived', x: cmd.x, y: cmd.y }); break; }
      const dist = pos.distanceTo(to);
      move = { from: pos.clone(), to, t: 0, dur: Math.min(1.2, Math.max(0.25, dist / 1400)) };
      facing = to.x >= pos.x ? 1 : -1;
      break;
    }
    case 'lookAt': lookTarget = cmd.x == null || cmd.y == null ? null : toWorld(cmd.x, cmd.y); break;
    case 'react': reaction = { clip: cmd.clip, t: 0 }; break;
    case 'setVisible': visible = cmd.visible; root.visible = visible; break;
    case 'setScale': scale = cmd.scale; break;
    case 'reload': void loadModel(cmd.modelUrl); break;
  }
}
bridge.onCommand(apply);

// ---- pointer: hover (click-through), click, drag --------------------------
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let over = false;
let leaveTimer: number | null = null;
let drag: { start: THREE.Vector2; moved: boolean; offset: THREE.Vector2 } | null = null;

function hitTest(e: PointerEvent): boolean {
  ndc.set((e.clientX / width) * 2 - 1, -(e.clientY / height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return hitVolume ? raycaster.intersectObject(hitVolume, false).length > 0 : false;
}

function setOver(v: boolean): void {
  if (v === over) return;
  over = v;
  bridge.send({ type: 'hover', over });
  canvas.style.cursor = over ? 'grab' : 'default';
}

window.addEventListener('pointermove', (e) => {
  if (drag) {
    const p = toWorld(e.clientX, e.clientY).add(drag.offset);
    if (p.distanceTo(drag.start) > 4) drag.moved = true;
    pos.copy(p);
    move = null;
    return;
  }
  const hit = hitTest(e);
  if (hit) { if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; } setOver(true); }
  else if (over && !leaveTimer) leaveTimer = window.setTimeout(() => { leaveTimer = null; setOver(false); }, 80);
});
window.addEventListener('pointerdown', (e) => {
  if (!hitTest(e)) return;
  const p = toWorld(e.clientX, e.clientY);
  drag = { start: pos.clone(), moved: false, offset: pos.clone().sub(p) };
  canvas.style.cursor = 'grabbing';
});
window.addEventListener('pointerup', () => {
  if (!drag) return;
  if (drag.moved) { const c = toCanvas(pos.x, pos.y); bridge.send({ type: 'dragEnd', x: c.x, y: c.y }); }
  else bridge.send({ type: 'click' });
  drag = null;
  canvas.style.cursor = over ? 'grab' : 'default';
});
window.addEventListener('pointerleave', () => { if (leaveTimer) clearTimeout(leaveTimer); leaveTimer = null; setOver(false); });

// ---- procedural animation --------------------------------------------------
const clock = new THREE.Clock();
let idleFrames = 0;
const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

function animate(): void {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  const rm = config.reducedMotion;

  if (move) {
    move.t += dt;
    const k = easeInOut(Math.min(1, move.t / move.dur));
    pos.lerpVectors(move.from, move.to, k);
    if (move.t >= move.dur) { const c = toCanvas(move.to.x, move.to.y); move = null; bridge.send({ type: 'arrived', x: c.x, y: c.y }); }
  }
  root.position.set(pos.x, pos.y, 0);

  // Base pose per state.
  let bob = 0, sx = 1, sy = 1, tilt = 0, headYaw = 0, headPitch = 0;
  const walking = move !== null;
  if (!rm) {
    switch (state) {
      case 'idle': bob = Math.sin(t * 2) * 0.012; sy = 1 + Math.sin(t * 2) * 0.01; sx = 1 - Math.sin(t * 2) * 0.01; break;
      case 'attentive': bob = Math.abs(Math.sin(t * 6)) * 0.03; headYaw = Math.sin(t * 3) * 0.25; break;
      case 'thinking': tilt = 0.12; headPitch = -0.15; headYaw = Math.sin(t * 1.2) * 0.1; break;
      case 'searching': headYaw = Math.sin(t * 2.5) * 0.6; bob = Math.abs(Math.sin(t * 2.5)) * 0.02; break;
      case 'talking': headPitch = Math.sin(t * 7) * 0.05; bob = Math.sin(t * 3.5) * 0.01; break;
      case 'sleeping': headPitch = 0.45; bob = Math.sin(t * 0.8) * 0.01; sy = 0.97; break;
    }
    if (walking) { bob = Math.abs(Math.sin(t * 14)) * 0.06; tilt = Math.sin(t * 14) * 0.08; }
  }

  // One-shot reactions overlay the state and return.
  if (reaction) {
    reaction.t += dt;
    const r = reaction.t;
    const done = r > 0.9;
    const env = Math.sin(Math.min(1, r / 0.9) * Math.PI);
    switch (reaction.clip) {
      case 'wave': tilt += Math.sin(r * 25) * 0.15 * env; break;
      case 'point': tilt += -0.2 * env; headPitch += -0.1 * env; break;
      case 'happy': bob += Math.abs(Math.sin(r * 12)) * 0.12 * env; sy *= 1 + 0.08 * env; sx *= 1 - 0.05 * env; break;
      case 'excited': bob += Math.abs(Math.sin(r * 18)) * 0.2 * env; tilt += Math.sin(r * 18) * 0.1 * env; break;
      case 'sorry': headPitch += 0.5 * env; sy *= 1 - 0.08 * env; sx *= 1 + 0.05 * env; break;
      case 'nod': headPitch += Math.sin(r * 14) * 0.25 * env; break;
    }
    if (done) reaction = null;
  }

  // Look-at: turn head (and lean) toward the target.
  const head = body.getObjectByName('head');
  if (lookTarget) {
    const dx = lookTarget.x - pos.x, dy = lookTarget.y - (pos.y + scale * 0.85);
    const yaw = THREE.MathUtils.clamp(Math.atan2(dx, 600), -0.7, 0.7);
    const pitch = THREE.MathUtils.clamp(-Math.atan2(dy, 600), -0.5, 0.5);
    headYaw += yaw; headPitch += pitch; tilt += yaw * 0.15;
    if (Math.abs(dx) > 20) facing = dx > 0 ? 1 : -1;
  }
  if (head) { head.rotation.y += (headYaw - head.rotation.y) * 0.15; head.rotation.x += (headPitch - head.rotation.x) * 0.15; }

  body.scale.set(scale * sx, scale * sy, scale);
  body.position.y = bob * scale;
  body.rotation.z = tilt;
  body.rotation.y += ((facing > 0 ? 0.35 : -0.35) - body.rotation.y) * 0.1;
  shadowPlane.scale.setScalar(scale * (0.9 + bob * 2));

  renderer.render(scene, camera);

  // Idle at ~10 fps when nothing is happening and the pointer is away.
  const busy = move || reaction || over || drag || (state !== 'idle' && state !== 'sleeping');
  idleFrames = busy ? 0 : idleFrames + 1;
  if (!busy && idleFrames > 30) setTimeout(() => requestAnimationFrame(animate), 100);
  else requestAnimationFrame(animate);
}

const info = await loadModel(config.modelUrl);
bridge.send({ type: 'ready', ...info });
animate();
