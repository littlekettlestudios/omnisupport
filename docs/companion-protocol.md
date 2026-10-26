# Companion protocol

The contract between the Electron main process (`src/main/`) and the companion renderer
(`src/renderer/companion/`). Everything crosses the preload bridge as plain JSON. Neither
side imports the other's code, so a new renderer only has to speak this protocol. Change
this file together with `src/shared/protocol.ts`.

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
  spritesUrl: string | null; // file:// URL of a sprite atlas.json; when set, draw the pixel sheets in 2D instead
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
  | { type: 'reload'; modelUrl: string }
  | { type: 'cursor'; x: number; y: number };                 // polled pointer position, see hover

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
an inflated capsule around the body, debounce leave by ~120 ms, and send `hover` only on
change. If this stops firing, the user cannot click or drag the character.

Do not rely on forwarded `pointermove` alone: macOS can stop forwarding moves to a
click-through window partway through a session. Main polls the cursor (~20 Hz, only on
change) and sends it as `cursor` in canvas pixels, possibly outside the canvas when the
pointer is on another display. Hit-test those exactly like a `pointermove`, and treat
anything while hidden (`setVisible false`) as a miss.

`dragEnd` makes the dropped point the new `home`. Main persists it.

## Clip names in the GLB

The character GLB (bundled: `assets/omni3.glb`) names its animations exactly:

| name | used for |
|---|---|
| `idle` | state idle |
| `attentive` | state attentive (fallback: idle + faster head sway) |
| `thinking` | state thinking |
| `searching` | state searching (fallback: thinking) |
| `talking` | state talking (fallback: idle + small nod cycle) |
| `sleeping` | state sleeping (fallback: idle at half speed, head down) |
| `walk` | moveTo travel |
| `run` | not used by the 3D renderer yet (sprite sheets) |
| `wave`, `point`, `happy`, `sorry`, `excited`, `nod` | reactions |
| `jump`, `land`, `climb`, `success`, `failure` | not used by the 3D renderer yet (sprite sheets). `jump` and `climb` carry root motion on the Hips (up 0.28 m; up 0.40 m and forward 0.30 m) |

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

## Sprite mode (2D)

With `config.spritesUrl` set (Settings → Look → **2D sprites**, settings `"sprites": true`),
`entry.ts` loads `sprites.ts` instead of the 3D renderer; it is the default look. It plays a
sprite pack: by default the painted Data Monster in `assets/sprites/data-monster/`, or the
pack chosen with **Choose sprite pack…** (settings `"spritePack"`). The pixel sheets in
`assets/sprites/omni3/` (rendered from `omni3.glb`) are the fallback and can be chosen too. A pack is a folder with `atlas.json`
and the sheets it names. It plays under the same commands and events:

| protocol | sheet |
|---|---|
| idle, attentive, talking | `idle` (sleeping: half speed, dimmed) |
| thinking, searching | `thinking` with the `think` emote |
| moveTo with walk | `walk`, or `run` past 220 px; speeds up to 2.4x to arrive within 1.2 s |
| react wave, point, happy, excited, nod | `success` with the `!` emote |
| react sorry | `failure` with the rain cloud |

The facing (one of 8) follows the travel direction, then the `lookAt` target; with no
target it faces the viewer (S). A clip without that facing uses the nearest it has: SW → W,
then the front (S), then the side it last faced, so a pack with only S, W and E works.
Pixel art (the default) is drawn at a whole-number zoom, the one closest to `config.scale` /
the atlas's `pixels_per_metre`; a pack with `"pixel_art": false` scales smoothly to exactly
that. Emotes (`emotes`, `anchors`) are optional; painted packs usually draw them into the
frames. Hover hit-tests the opaque pixels of the current frame. `reload` reloads the page, which is also how main switches
between 2D and 3D. `jump`, `land` and `climb` are in the atlas but no command plays them yet.

### Making a pack from a sprite sheet

`scripts/make_sprite_pack.py` turns a grid sheet (one pose per cell, transparent
background) into a pack. Describe which cells make each clip in a layout file, as in
`scripts/sprite-layout.example.json` (an 8 × 5 sheet: idle, walk left, walk right, thinking,
then success and failure sharing the last row), then:

```bash
python3 -m pip install pillow
python3 scripts/make_sprite_pack.py my-character/layout.json my-character/pack
```

Shapes that spill over their cell (a jump, a sparkle) are kept with the cell their centre
falls in, `"stabilize": true` holds walk cycles in place, and each facing row is moved onto
the same ground line. The clips the app uses are `idle`, `walk`, `thinking`, `success` and
`failure` (plus `run` if present); a missing one falls back to `idle`. Then pick the `pack`
folder in Settings → **Choose sprite pack…**; it is copied into the data folder.

## Timing expectations

| Transition | Target |
|---|---|
| picker opened → `attentive` | immediate |
| capture done → `moveTo` region edge + `lookAt` region centre | walk ≤ 1.2 s regardless of distance (scale speed) |
| first token → `talking` | immediate |
| answer end → `react` happy/sorry, then `idle`, keep `lookAt` until bubble closes | — |
