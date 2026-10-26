# Clippet

A small 3D companion that lives on your macOS desktop. Point it at something on screen
and it looks it up for you. See [PLAN.md](PLAN.md) for the full plan and
[docs/companion-protocol.md](docs/companion-protocol.md) for the renderer contract.

## Run

```bash
npm install
node node_modules/electron/install.js   # once, if node_modules/electron/dist is empty
npm run build && npx electron .
```

`npm run dev` runs with hot reload.

## Backends

The lookup can run two ways, chosen by `"backend"` in
`~/Library/Application Support/Clippet/settings.json`:

- `"claude-code"` (default): spawns your locally installed Claude Code CLI in headless mode
  (`claude -p`), so it runs on the login the CLI already has, normally a Claude
  subscription. Sign in once by running `claude` in a terminal. Clippet never reads or
  stores credentials; it strips `ANTHROPIC_API_KEY` from the child so the subscription is
  used. Model via `"claudeModel"` (`sonnet` by default, `opus` for deeper answers; both
  count against the subscription limits at different rates). `"claudePath"` overrides
  binary discovery. Anthropic's terms allow you to sign in to your own Claude Code with
  your own subscription; distributing Clippet to other people so it routes through their
  subscriptions needs Anthropic's approval, so treat this backend as personal use.
- `"api"`: calls the Anthropic API directly with `claude-opus-5-5`, web search and web fetch
  server tools and server-side refusal fallbacks. Needs `ANTHROPIC_API_KEY` in the
  environment or `"apiKey"` in settings.json (Keychain storage is planned for M4). Pay per
  call.
`CLIPPET_DEBUG=1` logs hover, click and drag events; `CLIPPET_DEBUG=flow` also opens the
region picker once, 2.5 s after launch.

## What works (M1)

- Transparent, frameless, always-on-top window covering the work area, click-through
  everywhere except on the character. Drag the character to move it; the spot is remembered.
- Menu-bar tray: Look at something, Show/Hide, Do not disturb, Pixel sprites (2D) (plays
  the omni3 pixel sheets in `assets/sprites/omni3` instead of the 3D model), Use your own model (GLB),
  Sign-in check, Quit. Global shortcut `⌃⌥Space` (⌘⌥Space is macOS's Finder search; change
  it with `"shortcut"` in settings.json using Electron accelerator names, e.g.
  `"Control+Alt+C"`; if the chosen one is taken, Clippet falls back to a free one and logs it).
- First-run onboarding: when the Claude Code backend is selected and the CLI is missing or
  signed out, the character waves and a card explains how to sign in, with an Open Terminal
  button (starts `claude` in Terminal for /login) and Check again. The same card appears if
  a lookup fails for the same reason.
- The lookup loop: shortcut → drag a rectangle on the dimmed screen → the region is captured
  with the native `screencapture` (only that region, nothing saved to disk) → the character
  walks to the region and looks at it → a speech bubble shows the thumbnail and asks for an
  optional note → Claude (through Claude Code or the API, see Backends; web search on,
  answers streamed) replies in the bubble with sources. Esc or × closes it.
- The character is a procedural placeholder until `assets/placeholder.glb` or the rigged
  `assets/clippet.glb` exists. The renderer in `src/renderer/companion/` is Codex's
  workstream; see [docs/codex-brief.md](docs/codex-brief.md) and the paste-ready
  [docs/codex-prompt.md](docs/codex-prompt.md).

## Permissions

Screen capture (M1) needs the Screen Recording permission for the app bundle. In
development that is granted to "Electron" once; a packaged build needs a signed bundle.
