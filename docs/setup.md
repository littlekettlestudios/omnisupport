# Setup

Everything you need to get Omni Support running from source on a Mac, plus what each
setting does and how to fix the usual problems.

## 1. Prerequisites

- **macOS 13 or newer.** The app relies on macOS's `screencapture`, the menu bar and the
  Keychain. Windows and Linux are not supported yet.
- **Node.js 22 or newer** with npm (`node -v`). Tested with Node 24.
- **An answer backend**, one of:
  - **Claude Code** (default): the `claude` CLI, signed in to your Claude account. Uses your
    Claude subscription; no API billing.
  - **Anthropic API**: an API key from [console.anthropic.com](https://console.anthropic.com/settings/keys).
    Billed per request (a typical lookup with web search costs a few cents on Opus).
- **Git**, to clone the repo.

Blender is only needed if you want to build your own character (see
[pipeline/README.md](../pipeline/README.md)).

## 2. Install and run

```bash
git clone https://github.com/littlekettlestudios/omnisupport.git
cd omnisupport
npm install
npm run dist
```

`npm run dist` builds `release/mac-arm64/Omni Support.app` (`release/mac/` on Intel Macs).
Drag it to **Applications** and open it. To keep it in the Dock, right-click its Dock icon
→ **Options → Keep in Dock**. Clicking the Dock icon opens the chat window.

The build is ad-hoc signed, not signed with an Apple Developer ID, so it is only meant for
the Mac that built it. If you copy it to another Mac, macOS will refuse to open it until
you right-click it and choose **Open**.

To run straight from source instead (handy while developing):

```bash
npm run build && npx electron .
```

If `npx electron .` says Electron failed to install, its binary download was skipped; run
`node node_modules/electron/install.js` once and try again.

Look for the helper in the bottom-right corner of your screen, the icon in the Dock and the
icon in the menu bar. Quit from either menu. If you'd rather have no Dock icon, turn off
**Show in Dock** in Settings.

## 3. First launch

The helper waves and the **Setup** window opens:

1. **Name your helper.** It's called Omni until you change it. You can rename it any time in
   Settings, or by telling it in chat ("I'll call you Pip").
2. **Answer backend.**
   - *Claude Code:* install it with `npm install -g @anthropic-ai/claude-code`, then click
     **Open Terminal** (it runs `claude`) and sign in with `/login`. Click **Check again**
     until it says Ready. The app never sees your credentials; it only runs your own CLI.
   - *Anthropic API:* in **Settings → Answers**, switch *Answer with* to **Anthropic API**
     and paste your key. It's encrypted with your macOS Keychain before it's written to
     disk. `ANTHROPIC_API_KEY` in the environment you launch from takes precedence.
3. **Screen Recording.** macOS asks the first time you point at something. If you said no,
   click **Open System Settings**, turn on **Omni Support** (or **Electron** when run from
   source) under *Privacy & Security → Screen Recording*, then quit and relaunch. After
   you rebuild the app, macOS may ask again because the ad-hoc signature changed.

You can reopen this checklist from the menu bar: **Setup…**.

## 4. Using it

| To | Do |
|---|---|
| Ask about something on screen | Press `⌃⌥Space`, drag a rectangle, type a note or press Enter |
| Follow up on an answer | Type in the **Reply…** box under the answer |
| Ask without a screenshot | Click the helper or the Dock icon, or menu bar → **Chat with …** |
| See the whole conversation | Click **Open chat window** in the bubble |
| Start over | **New chat** in the chat window (a region you point at always starts a new one) |
| Move the helper | Drag it; it remembers the spot |
| Quiet it | Menu bar → **Do not disturb**, or **Hide** |

Links in answers open in your browser. Esc closes the bubble and stops an answer that is
still coming in.

## 5. Settings

Menu bar → **Settings…**, or ⌘, while the app is in front.

| Setting | What it does |
|---|---|
| Name | What the helper calls itself. |
| Size | Height in pixels (default 150). |
| Pixel sprites (2D) | Draw the helper from the bundled pixel sheets instead of the 3D model. |
| Show in Dock | Keep a Dock icon that opens the chat window. Off makes it a menu-bar-only app. |
| 3D model | Load your own `.glb`. Rigged models should use the clip and bone names in [companion-protocol.md](companion-protocol.md); a static model gets procedural motion. **Use default** goes back to the bundled robot. |
| Answer with | Claude Code (subscription) or Anthropic API (key). |
| Claude Code model | Sonnet (default), Opus (deeper, uses more of your limits) or Haiku (fastest). |
| API key | Saved in the Keychain; Remove deletes it. |
| Web search | Lets answers look things up. Off means answers come only from what Claude already knows. |
| Shortcut | An [Electron accelerator](https://www.electronjs.org/docs/latest/api/accelerator), e.g. `Control+Alt+C`. If it's taken, the app falls back to a free one and shows which. |
| Memory (Memory tab) | Turn long-term notes on or off, add, delete or clear them. |

Everything is stored in the data folder, `~/Library/Application Support/Omni Support/`:
`settings.json`, `memory.json`, and `models/` for GLBs you picked. Both Settings and
Memory have a link that opens it. A few advanced keys exist only in `settings.json`:
`claudePath` (path to the `claude` binary if it isn't found automatically).

## 6. Troubleshooting

**"Claude Code CLI not found."** The app looks for `claude` through your login shell
(`zsh -lc 'command -v claude'`). If you installed it somewhere unusual, set `"claudePath"`
in `settings.json` to the full path and restart.

**"Claude Code is not signed in."** Run `claude` in a terminal and `/login`. Setup's
**Check again** confirms it (`claude auth status`).

**"Usage limit reached."** Your Claude plan's limit is used up. Wait for it to reset, pick
a lighter model, or switch to the API backend.

**Empty or black captures / "No capture produced."** Screen Recording is off for the app.
Turn it on (see step 3) and relaunch; macOS only applies the change after a restart.

**The shortcut does nothing.** Another app owns it. The active shortcut is shown in the
menu-bar menu and in Settings; pick another one there.

**Can't click through the helper's area.** The window is click-through everywhere except on
the helper itself. If clicks are blocked, quit and relaunch and please open an issue with
the output of `CLIPPET_DEBUG=1 npx electron .`.

**The helper is missing.** It may be hidden (menu bar → Show) or off-screen after a
display change: delete `"home"` from `settings.json` and relaunch.

**Start completely fresh.** Quit, delete `~/Library/Application Support/Omni Support/`,
relaunch.
