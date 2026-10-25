# Codex brief: Clippet companion renderer

You are building the character half of a macOS desktop companion. Read
`docs/companion-protocol.md` first; it is the contract with the Electron shell, which is
being built separately. You own `src/renderer/companion/` and nothing else. Do not touch
`src/main/`, `src/preload/`, or `src/renderer/bubble/`.

## What to build

A Three.js scene in a transparent window that:

1. Loads the GLB from `config.modelUrl` (`GLTFLoader`, Draco optional) and stands the
   character at `config.home` at `config.scale` pixels tall. Orthographic camera, so the
   character's size does not change as it walks around the screen.
2. Implements every command and event in the protocol. The state machine is the core:
   loops crossfade, reactions overlay and return, `moveTo` walks, `lookAt` turns the head.
3. Works with **two kinds of model**:
   - `assets/placeholder.glb`: static mesh, no rig, no clips. Every state must have a
     procedural version: bob, squash-and-stretch on state change, lean toward the look
     target, hop on `excited`, droop on `sorry`, a side-to-side tilt loop on `searching`.
   - `assets/clippet.glb`: rigged with Mixamo bone names and the protocol's clip names (today a stand-in made by `pipeline/autorig.py`; later a Mixamo rig of the final art). Use
     `AnimationMixer`; drive `mixamorig:Head` / `Neck` / `Spine1` for `lookAt` with
     clamping and smoothing. Clips missing from the file fall back to the procedural
     versions, never to a frozen pose.
4. Reports `hover` from a raycast against an inflated capsule around the body, debounced,
   on change only. This is what makes the window click-through everywhere else. Treat it
   as the most important event in the file.
5. Supports drag-to-move on the body (press, move, release → `dragEnd`).
6. Idles to ~10 fps when nothing is animating and the pointer is away; 60 fps otherwise.
   Honour `config.reducedMotion` by removing bob and squash.

## Constraints

- Transparent canvas: `alpha: true`, `premultipliedAlpha: true`, clear color alpha 0. No
  full-screen quads, no post-processing that writes opaque pixels.
- Soft shadow catcher under the feet (a `ShadowMaterial` plane) so the character feels
  grounded on the desktop. Nothing else may be visible outside the body.
- Lighting: one hemisphere light plus one directional. The textures from LKF are
  base-colour with metallic-roughness; `MeshStandardMaterial` as loaded is fine.
- No framework. Plain TypeScript modules, one `createCompanion(bridge, canvas)` entry.
  Vite is the bundler; the shell's `electron-vite` config will point at
  `src/renderer/companion/index.html`.
- Model loading failures send `{type:'error'}` and show nothing rather than a broken mesh.

## Dev harness

Build a `dev.html` that fakes `window.clippet` with a tiny panel of buttons for every
command so you can test without Electron: state dropdown, moveTo on click, lookAt follows
the pointer, reaction buttons, placeholder/rigged toggle. Keep it in
`src/renderer/companion/dev/`.

## Done when

- Both GLBs load; every protocol state and reaction has a visible, distinct motion on each.
- `hover` fires correctly at the body edge, no flicker when the pointer skims it.
- Walking across a 1440 px display takes ≤ 1.2 s and ends exactly at the requested point.
- `lookAt` on the rigged model turns the head smoothly and never breaks the neck.
- Idle CPU/GPU is negligible when nothing is happening.
