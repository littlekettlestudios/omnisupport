# Omni Support

A small helper that lives on your macOS desktop. Point it at anything on screen (an
error, a setting, a product, a paragraph) and it looks it up for you with Claude, then
answers in a speech bubble. Reply to keep the conversation going, or click the helper to
just chat. It remembers what you tell it, so you don't have to repeat yourself, and you can
give it any name you like (it's called **Omni** until you do).

The default helper is the **Data Monster**, a 2D sprite character; a 3D robot is bundled
too, and you can load your own sprite pack or GLB model.

Open source from [Little Kettle Studios](https://github.com/littlekettlestudios).

> **Status: early.** macOS only, built from source. No signed builds yet.

## What it does

- **Look at something.** Press `⌃⌥Space` and drag over part of the screen. The helper walks
  over, looks at the region, and asks what you need. Only that region is captured.
- **Glance.** Press `⌃⌥G` to have it look at the whole screen you're on, no dragging. Handy
  for "where is the setting for…" questions.
- **Point.** When an answer has steps, the helper walks over to each button, menu or field it
  mentions, points at it and rings the exact spot, one step after another.
- **Chat.** Reply to any answer in the bubble, click the helper to ask something, or open
  the chat window from the menu-bar icon. The bubble and the window share one conversation.
- **Memory.** Tell it your name, your setup, the tools you use. It keeps short notes
  (`Remembered: …` under an answer) and sends them with later questions. See, edit or wipe
  them in the Memory tab.
- **Name it.** Type a name in Setup or Settings, or just say "I'll call you Pip".
- **Settings window.** Name, size, 3D model or 2D sprites, your own GLB or sprite pack,
  Claude Code or Anthropic API, model, web search and shortcut, plus a Setup checklist.

## Requirements

| | Needed for | Notes |
|---|---|---|
| macOS 13 or newer | everything | Uses `screencapture`, menu-bar and Keychain APIs. Windows/Linux are not supported yet. |
| Node.js 22+ and npm | building and running | Tested with Node 24. |
| **One** of the two answer backends: | | |
| · [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI, signed in | default backend | Runs on your Claude subscription. `npm install -g @anthropic-ai/claude-code`, then run `claude` and `/login`. |
| · An [Anthropic API key](https://console.anthropic.com/settings/keys) | API backend | Pay per use. Paste it in Settings (stored in the Keychain) or set `ANTHROPIC_API_KEY`. |
| Screen Recording permission | looking at the screen | macOS asks the first time. Chat works without it. |
| Blender 4.2+ | only for making your own character | See [pipeline/README.md](pipeline/README.md). Not needed to run the app. |

## Quick start

1. **Sign in to Claude Code** (or have an API key ready):

   ```bash
   npm install -g @anthropic-ai/claude-code
   claude            # then /login
   ```

2. **Build and install the app:**

   ```bash
   git clone https://github.com/littlekettlestudios/omnisupport.git
   cd omnisupport
   npm install
   npm run dist
   ditto "release/mac-arm64/Omni Support.app" "/Applications/Omni Support.app"
   ```

   On an Intel Mac the app is in `release/mac/` instead.

3. **Open Omni Support** from Applications. The helper waves and the **Setup** window
   opens: name your helper, then follow the checklist (Claude Code sign-in or API key,
   Screen Recording). Right-click the Dock icon → **Options → Keep in Dock** to keep it.

4. **Use it:** press `⌃⌥Space` and drag over something on screen, press `⌃⌥G` to have it
   look at the whole screen, or click the helper to chat. Reply in the bubble to follow up;
   Esc closes it.

The full walkthrough (prerequisites, permissions, settings, updating, troubleshooting and
uninstalling) is in [docs/setup.md](docs/setup.md). Using it on a work Mac? Read
[Using it at work](docs/privacy.md#using-it-at-work) first.

## Caveats

- **Claude Code backend is for personal use.** It runs the `claude` CLI on *your own*
  login. Anthropic's terms let you use your own subscription this way, but shipping a
  product that routes other people's requests through their subscriptions needs
  Anthropic's approval. Use the API backend for anything you distribute.
- **The app is ad-hoc signed, not notarized.** It runs on the Mac that built it; macOS may
  ask for Screen Recording again after each rebuild, and other Macs need right-click →
  Open. (Running with `npx electron .` asks for "Electron" instead.)
- **What leaves your Mac:** the region you select (or the whole screen when you glance), your note, the conversation and your
  saved memory notes go to Anthropic (through Claude Code or the API) when you ask
  something, and web search may fetch pages. Nothing is sent in the background. See
  [docs/privacy.md](docs/privacy.md).
- **Memory is plain JSON on disk** (`memory.json` in the data folder). Don't tell it
  secrets; it is told not to save passwords, keys, financial or health details.
- **Answers can be wrong.** Check anything important against the linked sources.
- **The bundled characters are AI-generated.** The Data Monster sprite sheet was made with
  image-generation tools and sliced by `scripts/make_sprite_pack.py`; the omni3 robot came
  from image-to-3D tools and was rigged by `pipeline/autorig.py`, so its motion is
  "charming toy", not mocap.

## Docs

| | |
|---|---|
| [docs/setup.md](docs/setup.md) | Install, permissions, backends, settings, troubleshooting |
| [docs/privacy.md](docs/privacy.md) | What is captured, sent, and stored, and how to delete it |
| [docs/architecture.md](docs/architecture.md) | How the windows, chat, memory and backends fit together |
| [docs/companion-protocol.md](docs/companion-protocol.md) | Contract between the app and the character renderer |
| [docs/motion-research.md](docs/motion-research.md) | Reference behind the walk, run and reaction clips |
| [pipeline/README.md](pipeline/README.md) | Make and rig your own character in Blender |

## Development

```bash
npm run dev         # hot reload
npm run typecheck
npm run build
npm run dist        # package Omni Support.app into release/
```

The app icon is made from `resources/icon-art.jpg` by `scripts/make_icon.py` (needs Pillow).

`CLIPPET_DEBUG=1` logs hover, click and drag events; `CLIPPET_DEBUG=flow` opens the region
picker 2.5 s after launch; `CLIPPET_DEBUG=glance` glances at the screen 2.5 s after launch; `CLIPPET_DEBUG=pose` cycles the character's states and
reactions; `CLIPPET_DEBUG=panel` opens the chat window on launch. ("Clippet" was the
project's working name and survives in some code identifiers.)

To test without touching your own settings, give Electron a scratch data folder:
`npx electron . --user-data-dir=/tmp/omni-test`.

## Contributing

Commits follow Conventional Commits; see [CONTRIBUTING.md](CONTRIBUTING.md) for the types,
scopes and the `commit-msg` hook.

## License

[MIT](LICENSE) © Little Kettle Studios
