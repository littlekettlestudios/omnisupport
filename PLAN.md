# Clippet — desktop companion plan

A small 3D character that lives on the macOS desktop. You point it at something on
your screen, it looks at that region, reads it, searches the web, and answers in a
speech bubble. Working name **Clippet**, repo folder `omnisupport`.

Three workstreams, three owners:

| Workstream | Owner | Lives in |
|---|---|---|
| Shell, screen capture, agent loop, bubble UI, packaging | Claude (this repo) | `src/main/`, `src/renderer/bubble/` |
| Character rendering and animation | Codex | `src/renderer/companion/` (brief: `docs/codex-brief.md`) |
| Character asset: art → LKF → rig → GLB with clips | You + LKF + Blender + Mixamo | `assets/`, `pipeline/` |

The contract that lets all three run in parallel is `docs/companion-protocol.md`.

---

## 1. What it does (v1 scope)

1. Clippet sits in a corner, idle-animating, click-through except on its own body.
2. Press a global shortcut (default `⌃⌥Space`). You drag a rectangle on screen.
3. Clippet moves to the edge of that rectangle, looks at it, and shows a bubble:
   "What's up with this?" with an optional text field (Enter to skip and auto-analyze).
4. The region screenshot plus your note go to Claude with web search enabled.
5. The bubble streams the answer: a one-line summary, numbered steps, and source links.
   Clippet plays a thinking clip while waiting and a happy or sorry clip on finish.
6. Click a source to open it. Click away or press Esc to dismiss. Drag Clippet to move it.

Out of scope for v1: voice, controlling your apps, watching the screen continuously,
reading the clipboard, multiple characters.

## 2. Stack

- **Electron 3x + TypeScript + Vite** (electron-vite). You already ship LKF as an Electron
  app, so the packaging path is known. Electron also has the exact APIs this needs:
  transparent frameless always-on-top windows, `setIgnoreMouseEvents(true, {forward: true})`
  for click-through, `globalShortcut`, `Tray`, `desktopCapturer`.
- **Three.js** in the companion window: `GLTFLoader`, `AnimationMixer`, transparent canvas.
- **Two lookup backends** in the main process. Default: the local Claude Code CLI in
  headless mode (`claude -p` with Read, WebSearch and WebFetch, stream-json output), which
  runs on the Claude subscription login and costs no API credit. Alternative:
  `@anthropic-ai/sdk` with `claude-opus-5-5`, streaming, and the `web_search_20260209` /
  `web_fetch_20260209` server tools. No separate search provider either way.
- **Blender 4.2** (already on your PATH for LKF) for decimation and GLB re-export.
- No Python in this repo. LKF stays where it is; this repo only consumes its GLB.

## 3. Architecture

```
┌──────────────── Electron main (Node) ────────────────┐
│ tray + global shortcut                               │
│ capture.ts   : region select → PNG buffer (in memory)│
│ agent.ts     : Claude call, streams AnswerEvents     │
│ windows.ts   : companion window, bubble window       │
│ ipc.ts       : companion-protocol over contextBridge │
└───────┬──────────────────────────────┬───────────────┘
        │ protocol (JSON over IPC)     │
┌───────▼───────────┐          ┌───────▼───────────────┐
│ companion window  │          │ bubble window          │
│ transparent,      │          │ transparent, anchored  │
│ always on top,    │          │ to companion; input +  │
│ click-through     │          │ streamed answer card   │
│ Three.js + GLB    │          │ (plain HTML/CSS)       │
│  ← Codex owns     │          │  ← Claude owns         │
└───────────────────┘          └───────────────────────┘
```

**Two windows, not one.** The character window is pure WebGL and stays click-through.
The bubble is ordinary DOM in its own window, so text selection, links, and the input
field work without fighting the click-through logic.

**Click-through.** The companion window starts with `setIgnoreMouseEvents(true, {forward: true})`.
The renderer raycasts the pointer against the character mesh on `mousemove` and tells main
to toggle ignore on/off when the pointer enters or leaves the body. This is the standard
Electron pattern for desktop pets and it is the one piece Codex and Claude both touch, so
it is spelled out in the protocol.

**Moving to a target.** The window is the character's full travel area: a single
transparent window sized to the display's work area. The character moves inside it in
canvas space, which is simpler and smoother than moving the OS window. Screen coordinates
from capture are converted to canvas coordinates by main before they are sent.

**Capture.** `screencapture -i -x -t png <tmpfile>` gives the native macOS crosshair region
picker for free, including the dimmed screen and window-snap behaviour. Main reads the file
into memory and deletes it immediately. Also record the rectangle with `-R` parsing of the
resulting image bounds, or run a short overlay instead if we need the rect before capture.
If the native picker's lack of a rect report is a problem, fall back to our own full-screen
overlay window that reports the rect and then calls `desktopCapturer`. Both need the
Screen Recording permission, which macOS grants per app bundle (see risks).

**Agent loop.** One streamed Messages call per lookup:

- system: who Clippet is, answer shape, "search when the screenshot shows an error,
  product, or anything time-sensitive; otherwise answer directly".
- user: `[image: region PNG]` + the user note + a short context line (frontmost app name
  and window title from `active-win`, which is cheap and helps search a lot).
- tools: `web_search_20260209` (`max_uses: 5`) and `web_fetch_20260209`.
- output: structured JSON via `output_config.format` so the bubble can render
  `{summary, steps[], sources[], mood}` without parsing prose. `mood` drives the
  companion clip (`happy`, `neutral`, `sorry`).
- Stream text deltas to the bubble so the user sees progress; map `web_search` tool-use
  events to a "searching…" state so Clippet plays the looking-around clip.

Expected cost per lookup with a ~1000×600 region: roughly 1–2k image tokens plus search
results, a few cents on Opus 5.5. Cache the system prompt.

**Privacy.** Only the user-selected region is captured, never the full screen, and nothing
is written to disk after the capture file is read. The bubble has a "show what was sent"
thumbnail. A settings toggle disables web search for people who want local-only answers.

## 4. Asset pipeline (your part + LKF)

LKF gives a clean, normalised, textured but **unrigged** GLB at ~300k triangles. Rigging is
LKF roadmap items 5 and 6 and is not built, so the rig comes from Mixamo for v1.

**4a. Source art brief for the Clippet character** (what LKF needs to succeed, from its
README and roadmap item 0):

- Full body, front-facing, A-pose with arms clearly away from the body, legs slightly apart.
- Hands visible and open, no props held against the body (a prop fused to the chest cannot
  be animated separately).
- Big head, simple silhouette, no hair-thin or glowing parts.
- Soft 3D-render shading on a transparent background, 1024² or larger.
- Optional: a turnaround sheet (front, left, back) for `--turnaround front,left,back`.
  It fixed hands and the back view on Aria, and a companion is seen from the side a lot.

**4b. Pipeline steps**

```
clippet.png ──LKF──► output/clippet/blender/character.glb   (1 m, Y-up, ~300k tris)
   │ pipeline/decimate.py (Blender headless): decimate to ~15k tris, keep UVs/textures,
   │ export FBX
   ▼
clippet_lowpoly.fbx ──Mixamo auto-rigger (web)──► clippet_rigged.fbx
   │ download "with skin" once, then clips "without skin":
   │ Idle, Happy Idle, Waving, Pointing, Thinking, Excited, Sad Idle, Walking
   ▼
pipeline/assemble.py (Blender headless): import rigged FBX + clips, rename actions to
   the protocol clip names, push to NLA, export assets/clippet.glb with animations
```

Mixamo's auto-rigger handles chibi proportions if the markers (chin, wrists, elbows, knees,
groin) are placed carefully, but the result may have popping at the short elbows. If it is
bad, the fallback is Blender's Rigify metarig scaled to the mesh plus automatic weights,
and the same Mixamo clips retargeted with Rokoko or Auto-Rig Pro. Decide after one try.

**4c. Fallback that unblocks Codex today.** Codex builds against `assets/placeholder.glb`,
a static mesh (the current Aria or sprout farmer output works), with procedural motion:
bob, squash-and-stretch on state change, whole-body lean toward the look target. When the
rigged GLB lands, the same state machine switches to clips. The protocol is the same.

Known limit: LKF outputs have no morph targets and no separate eyes, so blinking and
eye-tracking are not possible without hand edits in Blender. Head-turn via the neck bone
is enough for the "looking at your screen" effect.

## 5. Milestones

| # | Goal | Done when |
|---|---|---|
| M0 | Scaffold | Transparent always-on-top window shows a spinning cube over the desktop, tray icon, shortcut logs "capture". Click-through works. |
| M1 | Lookup loop | Shortcut → region picker → bubble asks → streamed answer with sources. Placeholder sprite for the character. |
| M2 | Static character | LKF GLB loads in the companion window with procedural idle; moves to the capture region. |
| M3 | Rigged character | `assets/clippet.glb` with clips; states map to clips; head looks at target. |
| M4 | Ship to your Dock | Settings (shortcut, corner, search on/off, API key via Keychain), signed build with screen-capture entitlement, launch at login. |

M0 and M1 are Claude's. M2 and M3 depend on your asset work and Codex's renderer and can
run alongside M1. The repo should be initialised with git before M0 so Codex can work on a
branch.

## 6. Repo layout

```
omnisupport/
  PLAN.md
  docs/companion-protocol.md     shared contract (read this first)
  docs/codex-brief.md            what Codex builds
  src/main/                      Electron main: windows, capture, agent, tray, ipc
  src/preload/                   contextBridge exposing the protocol
  src/renderer/companion/        Three.js character (Codex)
  src/renderer/bubble/           speech bubble + input + answer card (Claude)
  assets/                        placeholder.glb, clippet.glb
  pipeline/                      Blender scripts: decimate.py, assemble.py
```

## 7. Risks and decisions already made

- **Screen Recording permission.** In dev, macOS asks for it for "Electron" and remembers
  it; a packaged app must be signed with a stable bundle ID or the prompt repeats on every
  build. Plan a self-signed cert early so M1 testing is not painful.
- **Click-through flicker.** Toggling ignore-mouse on raycast hit is well trodden but can
  flicker at the mesh edge. Hit-test against a slightly inflated bounding capsule, not the
  exact mesh.
- **GPU and transparency.** Transparent Electron windows on macOS disable some compositor
  optimisations. Cap the companion canvas at 60 fps and idle to 10 fps when no state change.
- **Mixamo on chibi** (above). Try once, then decide; do not sink days into it.
- **LKF turnaround.** ~15 min per generation plus a 4 min BiRefNet matte if the source
  lacks alpha. Export source art with transparency and sweep 2–3 seeds overnight.
- **Model choice.** `claude-opus-5-5` for the answer. If latency matters more than depth,
  `output_config.effort: "low"` first, not a smaller model.
- **No continuous screen watching.** The companion only sees what you select. Keep it that
  way; it is the whole trust story of the product.

## 8. Next actions

1. You: draw or generate the Clippet source art per 4a, run LKF with 2–3 seeds, pick one.
2. Claude: `git init`, scaffold electron-vite + Three.js, land M0, then M1.
3. Codex: read `docs/companion-protocol.md` and `docs/codex-brief.md`, build the
   companion renderer against the placeholder GLB on a branch.
4. Everyone meets at M2: real GLB in the real shell.
