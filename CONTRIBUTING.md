# Contributing to Clippet

## Commit messages

Clippet follows [Conventional Commits 1.0](https://www.conventionalcommits.org/en/v1.0.0/).
A `commit-msg` hook in `.githooks/` rejects headers that don't match. Enable it once per clone:

```bash
git config core.hooksPath .githooks
git config commit.template .gitmessage
```

### Format

```
<type>(<scope>)!: <summary>

<body: what changed and why, wrapped at 72>

<footer: BREAKING CHANGE: ..., Refs: #12, Co-Authored-By: ...>
```

- **Header** at most 72 characters, imperative mood, lowercase summary, no trailing full stop.
- **Scope** is optional but encouraged; use one of the scopes below.
- **`!`** after the type/scope marks a breaking change; explain it in a `BREAKING CHANGE:` footer.

### Types

| Type       | Use for                                                         |
|------------|-----------------------------------------------------------------|
| `feat`     | A new capability (tray item, lookup step, companion reaction)   |
| `fix`      | A bug fix                                                       |
| `perf`     | A change that makes something faster or lighter                 |
| `refactor` | Restructuring with no behaviour change                          |
| `test`     | Adding or fixing tests only                                     |
| `docs`     | README, `PLAN.md`, `docs/`, comments                            |
| `build`    | Packaging, `package.json`, lockfile, electron-vite config       |
| `ci`       | CI workflows                                                    |
| `chore`    | Housekeeping that fits nowhere else (`.gitignore`, repo config) |
| `style`    | Formatting only                                                 |
| `revert`   | Reverting an earlier commit                                     |

### Scopes

| Scope        | Area                                                         |
|--------------|--------------------------------------------------------------|
| `main`       | Electron main process in general (`src/main/index.ts`)       |
| `companion`  | Character renderer (`src/renderer/companion/`)               |
| `bubble`     | Speech bubble window                                         |
| `picker`     | Region picker overlay                                        |
| `preload`    | Preload bridges                                              |
| `shared`     | Types and protocol shared across processes (`src/shared/`)   |
| `agent`      | Lookup flow and the Claude agent loop                        |
| `backend`    | Claude Code CLI and API backends                             |
| `capture`    | Screen capture                                               |
| `tray`       | Menu-bar tray and global shortcut                            |
| `onboarding` | First-run and sign-in card                                   |
| `settings`   | `settings.json` handling                                     |
| `rig`        | Rigging and clips (`pipeline/autorig.py`)                    |
| `sprites`    | 2D pixel sheets in `assets/sprites/`                         |
| `face`       | Face-screen expressions                                      |
| `pipeline`   | Blender asset scripts in `pipeline/`                         |
| `assets`     | Committed models and images in `assets/`                     |
| `config`     | `tsconfig.json`, `electron.vite.config.ts`                   |
| `deps`       | Dependency bumps                                             |

### Examples

```
feat(companion): wave when the lookup finishes
fix(capture): keep the region inside the active display
build(deps)!: bump Electron to 45

BREAKING CHANGE: node_modules must be reinstalled.
```

## Branches and pull requests

- `main` is always releasable. Work on short-lived branches named `<type>/<short-slug>`,
  e.g. `feat/keychain-api-key` or `fix/bubble-overflow`.
- PR titles use the same Conventional Commit format; squash-merge so the PR title becomes the
  commit on `main`.
- Run `npm run typecheck` and `npm run build` before opening a PR.
