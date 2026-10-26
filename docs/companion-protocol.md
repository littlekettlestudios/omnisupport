# Companion protocol

The contract between the Electron main process (owned by Claude) and the companion
renderer (owned by Codex). Everything crosses the preload bridge as plain JSON. Neither
side imports the other's code. If you need to change this file, change it first and tell
the other side.

The renderer gets one object, `window.clippet`, from the preload script:

```ts
interface ClippetBridge {
  // main → renderer
  onCommand(handler: (cmd: Command) => void): () => void;   // returns unsubscribe
  // renderer → main
  send(event: RendererEvent): void;
  // read once at startup
  getConfig(): Promise<CompanionConfig>;
}
```

## Coordinates

All positions are **canvas pixels** in the companion window, origin top-left, y down.
The window covers the display's work area, so canvas pixels equal screen pixels offset by
the work-area origin. Main does that conversion. The renderer never sees screen
coordinates.

## Config (read once)

```ts
interface CompanionConfig {
  modelUrl: string;        // file:// URL of the GLB to load
  faceUrls: Partial<Record<'idle' | 'happy' | 'thinking' | 'sorry', string>>;
                           // face textures for the model's "FaceScreen" mesh (see below)
  canvas: { width: number; height: number; dpr: number };
  home: { x: number; y: number };      // where to stand when idle (feet position)
  scale: number;           // character height in canvas px (default 180)
  reducedMotion: boolean;  // honour OS "reduce motion"
}
```

## Commands (main → renderer)

```ts
type Command =
  | { type: 'setState'; state: CompanionState }
  | { type: 'moveTo'; x: number; y: number; walk: boolean }   // feet position
  | { type: 'lookAt'; x: number; y: number }                  // point on canvas, or null to clear
  | { type: 'lookAt'; x: null; y: null }
  | { type: 'react'; clip: ReactionClip }                     // one-shot, returns to current state
  | { type: 'setVisible'; visible: boolean }
  | { type: 'setScale'; scale: number }
  | { type: 'reload'; modelUrl: string };

type CompanionState =
  | 'idle'        // default loop
  | 'attentive'   // user opened the picker; alert, looking around
  | 'thinking'    // waiting on the model
  | 'searching'   // model is calling web search; looking-around loop
  | 'talking'     // answer is streaming into the bubble
  | 'sleeping';   // user set do-not-disturb

type ReactionClip = 'wave' | 'point' | 'happy' | 'sorry' | 'excited' | 'nod';
```

Rules:

- `setState` is a loop. It stays until the next `setState`. Transitions crossfade (~0.25 s).
- `react` plays once over the current loop and comes back to it. A second `react` while one
  is playing replaces it.
- `moveTo` with `walk: true` plays the walk loop while travelling, then resumes the current
  state. With `walk: false` it is an instant teleport (used on startup and display change).
- `lookAt` turns the head and upper body toward the point with clamping; it persists until
  cleared with `x: null`. If the point is behind the character, turn the whole body first.
- When the rig has no clip for a state or reaction, fall back to a procedural motion, not
  to nothing. The placeholder GLB has no rig at all, so every state has a procedural form.

## Events (renderer → main)

```ts
type RendererEvent =
  | { type: 'ready'; hasRig: boolean; clips: string[] }
  | { type: 'hover'; over: boolean }      // pointer entered/left the character body
  | { type: 'click' }                     // single click on the body
  | { type: 'dragEnd'; x: number; y: number }  // user dragged the character somewhere
  | { type: 'arrived'; x: number; y: number }  // moveTo finished
  | { type: 'error'; message: string };
```

`hover` is the important one. Main calls `setIgnoreMouseEvents(!over, {forward: true})`
on it, so the window is click-through everywhere except on the character. Hit-test against
an inflated capsule around the body, debounce leave by ~80 ms, and send `hover` only on
change. If this stops firing, the user cannot click or drag the character.

`dragEnd` makes the dropped point the new `home`. Main persists it.

## Clip names in the GLB

`assets/clippet.glb` animations are named exactly:

| name | used for |
|---|---|
| `idle` | state idle |
| `attentive` | state attentive (fallback: idle + faster head sway) |
| `thinking` | state thinking |
| `searching` | state searching (fallback: thinking) |
| `talking` | state talking (fallback: idle + small nod cycle) |
| `sleeping` | state sleeping (fallback: idle at half speed, head down) |
| `walk` | moveTo travel |
| `run` | not used by the renderer yet (LKF pixel sprite sheets) |
| `wave`, `point`, `happy`, `sorry`, `excited`, `nod` | reactions |

Bone names follow Mixamo (`mixamorig:Head`, `mixamorig:Neck`, `mixamorig:Spine1`), which
is what `lookAt` should drive. Scale: the model is 1 m tall at origin, feet at y=0, facing
+Z; the renderer scales it to `config.scale` pixels.

## Face screen

A model may contain a mesh named `FaceScreen` (a thin patch over the face, skinned to
the head bone, material with alpha blending). The renderer swaps its texture by mood,
derived from state and reactions, never commanded directly:

| mood | when |
|---|---|
| `happy` | reactions wave, point, happy, excited, nod |
| `sorry` | reaction sorry |
| `thinking` | states thinking, searching |
| `idle` | everything else; dimmed while sleeping |

Textures are loaded from `config.faceUrls`; a mood with no texture keeps the previous
one. Models without `FaceScreen` ignore all of this.

## Timing expectations

| Transition | Target |
|---|---|
| picker opened → `attentive` | immediate |
| capture done → `moveTo` region edge + `lookAt` region centre | walk ≤ 1.2 s regardless of distance (scale speed) |
| first token → `talking` | immediate |
| answer end → `react` happy/sorry, then `idle`, keep `lookAt` until bubble closes | — |
