# Privacy

Omni Support is built so the helper only ever sees what you show it.

## What is captured

- **Only the rectangle you drag**, and only when you press the shortcut and finish the
  drag. There is no background screen watching, no clipboard reading, no keylogging.
- The capture uses macOS's `screencapture` into a temporary file that is read into memory
  and deleted right away. The bubble shows you the thumbnail of exactly what is sent.

## What is sent, and to whom

When you ask something, these go to Anthropic:

- the captured region (if any), your note or message;
- the earlier messages of the current conversation, so follow-ups have context;
- your saved memory notes and the helper's name (in the system prompt), unless memory is off.

With the **Claude Code** backend they go through your locally installed `claude` CLI under
your own login; each request runs as a fresh, unsaved CLI session (`--no-session-persistence`)
in a private temp folder that is deleted afterwards. It can read only the screenshots in
that folder (any other file read is denied, so text in a captured region can't make it open
your files), and it ignores your `CLAUDE.md` files, Claude Code's own memory, and your Claude
Code settings, hooks and plugins. With the **API** backend they go straight to the
Anthropic API with your key.

With **web search** on, Claude may search the web and fetch pages to answer. Turn it off in
Settings to keep answers to what Claude already knows.

Anthropic's handling of that data is covered by your Claude or API terms. This app sends
nothing anywhere else: no analytics, no telemetry, no update checks.

## What is stored on your Mac

In `~/Library/Application Support/Omni Support/`:

| File | Contents |
|---|---|
| `settings.json` | Your settings. An API key, if you saved one, is stored encrypted with the macOS Keychain (`apiKeyEnc`). |
| `memory.json` | Your memory notes, in plain text. |
| `models/` | Copies of GLB files you picked in Settings. |

Conversations are kept in memory only while the app runs; they are not written to disk.
Screenshots are never kept.

## Memory

The helper adds a note when you tell it something worth keeping (your name, role,
preferences, setup, ongoing projects) and shows `Remembered: …` under the answer. It is
instructed never to store passwords, keys, financial or health details, or anything you ask
it to forget, and to ignore account details its runtime may add. Notes are capped at 60;
the oldest drop off first.

You control it in the **Memory** tab: switch it off (nothing new is saved and nothing is
sent), delete single notes, or **Forget everything**.

## Deleting your data

Quit the app and delete `~/Library/Application Support/Omni Support/`. That removes your
settings, memory, models and the encrypted API key. The key that encrypted it lives in
Keychain Access as **Omni Support Safe Storage**; delete that entry too if you want nothing
left behind.
