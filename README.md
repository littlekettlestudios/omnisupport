# Clippet

A small 3D companion that lives on your macOS desktop. Point it at something on screen
and it looks it up for you. See [PLAN.md](PLAN.md) for the full plan and
[docs/companion-protocol.md](docs/companion-protocol.md) for the renderer contract.

## Run (M0)

```bash
npm install
node node_modules/electron/install.js   # once, if node_modules/electron/dist is empty
npm run build && npx electron .
```

`npm run dev` runs with hot reload. `CLIPPET_DEBUG=1 npx electron .` logs hover/click
events and fires the capture flow once, three seconds after launch.

What M0 does: a transparent, frameless, always-on-top window covering the work area,
click-through everywhere except on the character; a menu-bar tray with Look at
something, Show/Hide, Do not disturb and Quit; the global shortcut `⌘⌥Space`, which for
now sends the character walking to a random point and looking at it. Drag the character
to move it; the spot is remembered.

The character is a procedural placeholder until `assets/placeholder.glb` (or the rigged
`assets/clippet.glb`) exists. The renderer in `src/renderer/companion/` is Codex's
workstream; see [docs/codex-brief.md](docs/codex-brief.md).

## Permissions

Screen capture (M1) needs the Screen Recording permission for the app bundle. In
development that is granted to "Electron" once; a packaged build needs a signed bundle.
