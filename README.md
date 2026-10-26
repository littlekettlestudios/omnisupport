# Omni Support

A small 3D helper that lives on your macOS desktop. Point it at anything on screen (an
error, a setting, a product, a paragraph) and it looks it up for you with Claude, then
answers in a speech bubble. Reply to keep the conversation going, or click the helper to
just chat. It remembers what you tell it, so you don't have to repeat yourself, and you can
give it any name you like (it's called **Omni** until you do).

Open source from [Little Kettle Studios](https://github.com/littlekettlestudios).

> **Status: early.** macOS only, run from source. No signed builds yet.

## What it does

- **Look at something.** Press `⌃⌥Space` and drag over part of the screen. The helper walks
  over, looks at the region, and asks what you need. Only that region is captured.
- **Chat.** Reply to any answer in the bubble, click the helper to ask something, or open
  the chat window from the menu-bar icon. The bubble and the window share one conversation.
- **Memory.** Tell it your name, your setup, the tools you use. It keeps short notes
  (`Remembered: …` under an answer) and sends them with later questions. See, edit or wipe
  them in the Memory tab.
- **Name it.** Type a name in Setup or Settings, or just say "I'll call you Pip".
- **Settings window.** Name, size, 2D pixel or 3D look, your own GLB model, Claude Code or
  Anthropic API, model, web search and shortcut, plus a Setup checklist.

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

```bash
git clone https://github.com/littlekettlestudios/omnisupport.git
cd omnisupport
npm install
npm run build && npx electron .
```

On first launch the helper waves and the **Setup** window opens: name your helper, then
follow the checklist (Claude Code sign-in or API key, Screen Recording). After that:

1. Press `⌃⌥Space`, drag over something, add a note or just press Enter.
2. Reply in the bubble to follow up, or press Esc to close it.
3. Click the helper any time to chat. The menu-bar icon has Chat, Settings and Setup.

The full walkthrough, including permissions and troubleshooting, is in
[docs/setup.md](docs/setup.md).

## Caveats

- **Claude Code backend is for personal use.** It runs the `claude` CLI on *your own*
  login. Anthropic's terms let you use your own subscription this way, but shipping a
  product that routes other people's requests through their subscriptions needs
  Anthropic's approval. Use the API backend for anything you distribute.
- **Running from source asks for Screen Recording for "Electron"**, not "Omni Support",
  and macOS may ask again after Electron updates. A signed build fixes this (not done yet).
- **What leaves your Mac:** the region you select, your note, the conversation and your
  saved memory notes go to Anthropic (through Claude Code or the API) when you ask
  something, and web search may fetch pages. Nothing is sent in the background. See
  [docs/privacy.md](docs/privacy.md).
- **Memory is plain JSON on disk** (`memory.json` in the data folder). Don't tell it
  secrets; it is told not to save passwords, keys, financial or health details.
- **Answers can be wrong.** Check anything important against the linked sources.
- The bundled robot and sprite sheets were generated with image-to-3D tools and rigged by
  `pipeline/autorig.py`. Its motion is "charming toy", not mocap.

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
```

`CLIPPET_DEBUG=1` logs hover, click and drag events; `CLIPPET_DEBUG=flow` opens the region
picker 2.5 s after launch; `CLIPPET_DEBUG=pose` cycles the character's states and
reactions; `CLIPPET_DEBUG=panel` opens the chat window on launch. ("Clippet" was the
project's working name and survives in some code identifiers.)

To test without touching your own settings, give Electron a scratch data folder:
`npx electron . --user-data-dir=/tmp/omni-test`.

## Contributing

Commits follow Conventional Commits; see [CONTRIBUTING.md](CONTRIBUTING.md) for the types,
scopes and the `commit-msg` hook.

## License

[MIT](LICENSE) © Little Kettle Studios
