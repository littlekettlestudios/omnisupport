# Setup

How to build Omni Support from source, install it on your Mac, connect it to Claude, and
keep it up to date, plus what every setting does and how to fix the usual problems.

## 1. What you need

| | Needed for | How to check / get it |
|---|---|---|
| A Mac with macOS 13 or newer | everything | Apple menu → About This Mac. Windows and Linux are not supported yet. |
| Xcode Command Line Tools | `git` | `xcode-select --install` (skip if `git --version` works) |
| Node.js 22 or newer, with npm | building the app | `node -v`. Install from [nodejs.org](https://nodejs.org) or `brew install node`. Tested with Node 24. |
| **One** answer backend: | answering | |
| · Claude Code CLI, signed in | the default backend | `npm install -g @anthropic-ai/claude-code`, then `claude` and `/login`. Uses your Claude plan; no API billing. |
| · An Anthropic API key | the API backend | [console.anthropic.com](https://console.anthropic.com/settings/keys). Billed per request (a lookup with web search costs a few cents on Opus). |
| Python 3 with Pillow | only for remaking the icon or a sprite pack | `python3 -m pip install pillow` |
| Blender 4.2+ | only for making your own 3D character | See [pipeline/README.md](../pipeline/README.md). |

Screen Recording permission is asked for on first use (step 4). Chat works without it.

## 2. Build and install the app

```bash
git clone https://github.com/littlekettlestudios/omnisupport.git
cd omnisupport
npm install
npm run dist
```

`npm run dist` builds **Omni Support.app** into `release/mac-arm64/` (`release/mac/` on
Intel Macs). It takes a minute; the first run downloads Electron. npm may print
`allow-scripts` warnings about `electron-winstaller`; that package is for Windows builds and
the warning is safe to ignore.

Install it in Applications. Drag it there in Finder, or:

```bash
ditto "release/mac-arm64/Omni Support.app" "/Applications/Omni Support.app"
```

Open it from Applications or Spotlight. To keep it in the Dock, right-click its Dock icon →
**Options → Keep in Dock**.

The app is ad-hoc signed (not with an Apple Developer ID and not notarized), so it is meant
for the Mac that built it. On another Mac, macOS refuses to open it until you right-click it
→ **Open** → **Open**.

## 3. Connect an answer backend

### Claude Code (default)

1. Install the CLI: `npm install -g @anthropic-ai/claude-code`.
2. Run `claude` in Terminal and sign in with `/login`. At work, sign in with your company's
   Claude account rather than a personal one (see [privacy.md](privacy.md#using-it-at-work)).
3. Check it: `claude auth status` should say you're logged in.

The app finds `claude` through your login shell and runs it in a locked-down mode: it can
read only the screenshot you point at, it ignores your own Claude Code settings, hooks and
plugins, and nothing is saved to your Claude Code history. The app never sees your
credentials.

### Anthropic API

In the app, open **Settings → Answers**, set *Answer with* to **Anthropic API** and paste
your key. It's encrypted with your macOS Keychain before it's written to disk.
`ANTHROPIC_API_KEY` in the environment the app was launched from takes precedence.

## 4. First launch

The helper appears in the bottom-right corner of your screen, waves, and the **Setup**
window opens:

1. **Name your helper.** It's called Omni until you change it. Rename it any time in
   Settings, or by telling it in chat ("I'll call you Pip").
2. **Answer backend.** Claude Code shows Ready once you're signed in (**Open Terminal** runs
   `claude` for you; **Check again** re-checks). For the API, it shows Ready once a key is
   saved.
3. **Screen Recording.** macOS asks the first time you point at something. If you said no,
   click **Open System Settings** and turn on **Omni Support** under *Privacy & Security →
   Screen Recording*, then quit and reopen the app.

You can reopen this checklist any time: menu-bar icon → **Setup…**.

## 5. Using it

| To | Do |
|---|---|
| Ask about something on screen | Press `⌃⌥Space`, drag over it, type a note or just press Enter |
| Follow up on an answer | Type in the **Reply…** box under the answer |
| Ask without a screenshot | Click the helper or the Dock icon, or menu bar → **Chat with …** |
| See the whole conversation | Click **Open chat window** in the bubble |
| Start over | **New chat** in the chat window (pointing at a new region always starts one) |
| Move the helper | Drag it; it remembers the spot |
| Quiet it | Menu bar → **Do not disturb**, or **Hide** |
| Open Settings | Menu bar → **Settings…**, the Dock icon's menu, or ⌘, while the app is in front |
| Quit | Menu bar → **Quit**, or ⌘Q while the app is in front |

Links in answers open in your browser. Esc closes the bubble and stops an answer that is
still coming in.

## 6. Your character

The default helper is the **Data Monster**, a 2D sprite character bundled in
`assets/sprites/data-monster/`. Change it in **Settings → Helper**:

- **Look → 3D model** shows the bundled omni3 robot, or your own `.glb` from **Choose GLB…**.
  Rigged models should use the clip and bone names in
  [companion-protocol.md](companion-protocol.md); a static model gets procedural motion.
- **Look → 2D sprites** with **Choose sprite pack…** loads any pack folder (one with an
  `atlas.json`). The pixel-art robot ships in the repo at `assets/sprites/omni3/`; choose
  that folder to use it. The pack is copied into the app's data folder, so you can move or
  delete the original.
- **Use default** goes back to the Data Monster or the omni3 robot.
- **Size** sets the character's height in pixels.

To make a pack from your own sprite sheet (a grid of poses on a transparent background),
describe its cells in a layout file and run `scripts/make_sprite_pack.py`; see
[Making a pack from a sprite sheet](companion-protocol.md#making-a-pack-from-a-sprite-sheet).
The Data Monster's own sheet and layout are in `assets/sprites/data-monster/source/`.

## 7. Settings

| Setting | What it does |
|---|---|
| Name | What the helper calls itself. |
| Size | Height in pixels (default 150). |
| Look | **3D model** or **2D sprites** (default). |
| 3D model | **Choose GLB…**, or **Use default** for the omni3 robot. |
| 2D sprites | **Choose sprite pack…**, or **Use default** for the Data Monster. |
| Show in Dock | Keep a Dock icon that opens the chat window. Off makes it a menu-bar-only app. |
| Answer with | Claude Code (your Claude plan) or Anthropic API (your key). |
| Claude Code model | Sonnet (default), Opus (deeper, uses more of your limits) or Haiku (fastest). |
| API key | Saved encrypted with the Keychain; **Remove** deletes it. |
| Web search | Lets answers look things up and read pages. Off means answers come only from what Claude already knows. |
| Shortcut | An [Electron accelerator](https://www.electronjs.org/docs/latest/api/accelerator), e.g. `Control+Alt+C`. If it's taken, the app falls back to a free one and shows which. |
| Memory (Memory tab) | Turn long-term notes on or off, add, delete or clear them. |

Everything is stored in the data folder, `~/Library/Application Support/Omni Support/`:
`settings.json`, `memory.json`, and `models/` and `sprites/` for characters you picked.
Settings and Memory each have a link that opens it. One advanced key exists only in
`settings.json`: `claudePath`, the full path to the `claude` binary if it isn't found
automatically.

## 8. Updating

```bash
cd omnisupport
git pull
npm install
npm run dist
```

Quit the running app, then replace it:

```bash
rm -rf "/Applications/Omni Support.app"
ditto "release/mac-arm64/Omni Support.app" "/Applications/Omni Support.app"
```

Your settings, memory and characters are kept. Each build gets a new ad-hoc signature, so
macOS may ask for Screen Recording again; if captures come back empty, see
Troubleshooting.

## 9. Running from source (development)

```bash
npm run dev                    # hot reload
npm run build && npx electron .
```

Run from source, the app shows up as **Electron** in Screen Recording. To test without
touching your own settings, give it a scratch data folder:
`npx electron . --user-data-dir=/tmp/omni-test`. If `npx electron .` says Electron failed to
install, run `node node_modules/electron/install.js` once and try again.

## 10. Troubleshooting

**"Claude Code CLI not found."** The app looks for `claude` through your login shell
(`zsh -lc 'command -v claude'`). If it lives somewhere unusual, set `"claudePath"` in
`settings.json` to its full path and reopen the app.

**"Claude Code is not signed in."** Run `claude` in Terminal and `/login`. Setup's **Check
again** confirms it (`claude auth status`).

**"Usage limit reached."** Your Claude plan's limit is used up. Wait for it to reset, pick
a lighter model, or switch to the API backend.

**Empty or black captures / "No capture produced."** Screen Recording is off for the app,
or macOS still holds the permission for an older build. Open *System Settings → Privacy &
Security → Screen Recording*, remove **Omni Support** with the − button, add it again from
Applications (or turn it on when asked), then quit and reopen the app.

**"Omni Support is damaged" or "can't be opened."** The app was copied from another Mac.
Right-click it → **Open**, or build it on this Mac.

**The shortcut does nothing.** Another app owns it. The active shortcut is shown in the
menu-bar menu and in Settings; pick another one there.

**A sprite pack won't load.** Choose the folder that contains `atlas.json`, not the folder
above it or a single image. If a pack fails to load, the app shows the 3D robot instead.

**Can't click through the helper's area.** The window is click-through everywhere except on
the helper itself. If clicks are blocked, quit and reopen, and please open an issue with
the output of `CLIPPET_DEBUG=1 npx electron .` from the repo.

**The helper is missing.** It may be hidden (menu bar → **Show**) or off-screen after a
display change: quit, delete `"home"` from `settings.json`, and reopen.

## 11. Uninstalling

1. Quit the app and drag **Omni Support** from Applications to the Trash.
2. Delete `~/Library/Application Support/Omni Support/` (settings, memory, characters and the
   encrypted API key).
3. Optionally, in Keychain Access, delete **Omni Support Safe Storage**, and remove the app
   from *Privacy & Security → Screen Recording*.
