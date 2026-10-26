# Architecture

Omni Support is an Electron menu-bar app with four kinds of window and one conversation.

```
┌────────────────────────── Electron main (src/main) ───────────────────────────┐
│ index.ts        tray, shortcut, settings side effects, first-run              │
│ lookupFlow.ts   pick region → capture → walk over → bubble; click → chat      │
│ chat.ts         the live conversation: backend call, companion reactions,     │
│                 [remember:] / [name:] tags → memory.json / settings.json      │
│ prompt.ts       system prompt from name + memory                              │
│ agent.ts        Anthropic API backend      claudeCode.ts  Claude Code backend │
│ memory.ts       memory.json                settings.ts    settings.json       │
└──────┬──────────────────┬──────────────────────┬─────────────────┬────────────┘
       │ protocol         │ bubble IPC           │ panel IPC       │ picker IPC
┌──────▼───────┐   ┌──────▼────────┐   ┌─────────▼────────┐  ┌─────▼──────┐
│ companion    │   │ bubble        │   │ panel            │  │ picker     │
│ transparent, │   │ speech bubble │   │ Chat · Memory ·  │  │ full-screen│
│ click-through│   │ note, answer, │   │ Settings · Setup │  │ overlay to │
│ Three.js GLB │   │ reply box     │   │ ordinary window  │  │ drag a rect│
│ or 2D sprites│   │               │   │                  │  │            │
└──────────────┘   └───────────────┘   └──────────────────┘  └────────────┘
```

## Windows

- **Companion** (`src/renderer/companion/`): a transparent, always-on-top window the size of
  the work area. The character moves inside it in canvas pixels. It is click-through
  everywhere except the character: the renderer hit-tests the pointer against a capsule
  around the model and tells main to toggle `setIgnoreMouseEvents`. Main also polls the
  cursor because macOS sometimes stops forwarding mouse moves to click-through windows.
  The contract is [companion-protocol.md](companion-protocol.md); `entry.ts` picks the 3D
  renderer (`index.ts`) or the pixel sprite renderer (`sprites.ts`).
- **Bubble** (`src/renderer/bubble/`): ordinary DOM in its own small window anchored next to
  the character's head, so text input, selection and links work without fighting the
  click-through logic. It shows a region thumbnail and note box, a chat box, or a card
  (sign-in, errors), streams answers, and offers a reply box after each answer.
- **Panel** (`src/renderer/panel/`): a normal window with Chat, Memory, Settings and Setup
  tabs. The app shows a Dock icon only while it is open.
- **Picker** (`src/renderer/picker/`): a full-screen overlay that reports the dragged
  rectangle; main then captures exactly that rectangle with `screencapture -R`.

## One conversation

`Chat` (`src/main/chat.ts`) owns the single live conversation. The bubble and the panel are
two views of it: both send messages into it, and every event it emits carries the
conversation id. The panel shows everything; the bubble only shows events for the
conversation it opened. Pointing at a new region starts a new conversation; clicking the
character continues the current one unless it has been idle for 15 minutes.

A user turn may carry the captured PNG. Failed or stopped replies are shown but left out of
the history, so the backends always see alternating turns.

## Backends

Both take the turns and the system prompt and stream `status`, `delta` and `source` events,
then resolve with the full reply text.

- **Claude Code** (`claudeCode.ts`, default): spawns `claude -p` with `--system-prompt`, only
  the `Read`, `WebSearch` and `WebFetch` tools, `--permission-mode dontAsk`,
  `--no-session-persistence` and `stream-json` output, in a private temp folder that holds
  the screenshots. Earlier turns are replayed in the prompt as a transcript, so nothing is
  saved in the user's Claude Code history. `ANTHROPIC_API_KEY` is removed from the child's
  environment so the subscription login is used.
- **Anthropic API** (`agent.ts`): the Messages API with `claude-opus-5-5`, streaming, the
  `web_search` and `web_fetch` server tools, server-side refusal fallbacks, and a cached
  system prompt. The conversation is sent as real multi-turn messages with images.

## Memory and naming

The system prompt (`prompt.ts`) tells the helper its name, lists the saved memory notes,
and asks it to end replies with control tags:

- `[remember: <fact>]` for something worth keeping (at most 3 per reply);
- `[name: <new name>]` when the user renames it;
- `[mood: happy|neutral|sorry]`, which picks the character's reaction clip.

`src/shared/tags.ts` hides the tags while text streams and parses them out of the finished
reply. `Chat` saves new facts with `memory.ts` (deduplicated, capped at 60) and new names
in `settings.json`, then refreshes the panel and tray. Tags work the same on both backends
because they are plain text, not tool calls.

## Settings and secrets

`settings.ts` reads and writes `settings.json` in the data folder. The API key is encrypted
with Electron `safeStorage` (Keychain-backed) and stored as `apiKeyEnc`. Old defaults saved
by earlier builds (size 180, name "Clippet", an old shortcut) are migrated on load, and a
data folder from the project's working name (`Clippet`) is copied over once.

## Character assets

`assets/omni3.glb` is the bundled character: 1 m tall, Mixamo bone names, and the protocol
clips plus `run`, `jump`, `land`, `climb`, `success` and `failure`. `assets/sprites/omni3/`
holds pixel sheets rendered from it in 8 directions, described by `atlas.json`. The Blender
scripts that made and rigged it are in `pipeline/`.
