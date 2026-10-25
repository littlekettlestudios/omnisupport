# Clippet

A small 3D companion that lives on your macOS desktop. Point it at something on screen
and it looks it up for you. See [PLAN.md](PLAN.md) for the full plan and
[docs/companion-protocol.md](docs/companion-protocol.md) for the renderer contract.

## Run

```bash
npm install
node node_modules/electron/install.js   # once, if node_modules/electron/dist is empty
npm run build && ANTHROPIC_API_KEY=sk-ant-... npx electron .
```

The key can also go in `~/Library/Application Support/Clippet/settings.json` as `"apiKey"`
(Keychain storage is planned for M4). `npm run dev` runs with hot reload.
`CLIPPET_DEBUG=1` logs hover, click and drag events; `CLIPPET_DEBUG=flow` also opens the
region picker once, 2.5 s after launch.

## What works (M1)

- Transparent, frameless, always-on-top window covering the work area, click-through
  everywhere except on the character. Drag the character to move it; the spot is remembered.
- Menu-bar tray: Look at something, Show/Hide, Do not disturb, Quit. Global shortcut `⌘⌥Space`.
- The lookup loop: shortcut → drag a rectangle on the dimmed screen → the region is captured
  with the native `screencapture` (only that region, nothing saved to disk) → the character
  walks to the region and looks at it → a speech bubble shows the thumbnail and asks for an
  optional note → Claude (`claude-opus-5-5`, web search and web fetch enabled, answers
  streamed) replies in the bubble with sources. Esc or × closes it.
- The character is a procedural placeholder until `assets/placeholder.glb` or the rigged
  `assets/clippet.glb` exists. The renderer in `src/renderer/companion/` is Codex's
  workstream; see [docs/codex-brief.md](docs/codex-brief.md) and the paste-ready
  [docs/codex-prompt.md](docs/codex-prompt.md).

## Permissions

Screen capture (M1) needs the Screen Recording permission for the app bundle. In
development that is granted to "Electron" once; a packaged build needs a signed bundle.
