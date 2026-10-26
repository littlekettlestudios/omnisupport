import { app } from 'electron';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface Settings {
  home: { x: number; y: number } | null;
  scale: number;
  /** Electron accelerator for "look at something". Must not collide with macOS defaults. */
  shortcut: string;
  /** Anthropic API key for the 'api' backend. ANTHROPIC_API_KEY in the environment takes precedence. Keychain storage is M4. */
  apiKey: string | null;
  webSearch: boolean;
  /** 'claude-code' spawns the local Claude Code CLI (subscription login); 'api' uses the Anthropic API with apiKey. */
  backend: 'claude-code' | 'api';
  /** Model alias or id for the Claude Code backend. */
  claudeModel: string;
  /** Path to the claude binary; found via the login shell when null. */
  claudePath: string | null;
  /** file:// URL of a user-chosen GLB; null = bundled assets/clippet.glb, else assets/placeholder.glb. */
  modelUrl: string | null;
  /** Draw the character from the bundled pixel sprite sheets (assets/sprites/omni3) instead of the 3D model. */
  sprites: boolean;
}

// ⌘⌥Space is macOS's "Show Finder search window"; ⌥Space is taken by Alfred/Raycast users.
export const DEFAULT_SHORTCUT = 'Control+Alt+Space';
/** Tried in order when the configured shortcut cannot be registered. */
export const SHORTCUT_FALLBACKS = [DEFAULT_SHORTCUT, 'Control+Alt+C', 'Control+Shift+Space', 'Control+Alt+Shift+Space'];
const RETIRED_DEFAULTS = new Set(['CommandOrControl+Alt+Space']);

const DEFAULTS: Settings = {
  home: null, scale: 180, shortcut: DEFAULT_SHORTCUT, apiKey: null, webSearch: true,
  backend: 'claude-code', claudeModel: 'sonnet', claudePath: null, modelUrl: null, sprites: false,
};

export function settingsFile(): string {
  return join(app.getPath('userData'), 'settings.json');
}

export function loadSettings(): Settings {
  let s: Settings;
  try {
    s = { ...DEFAULTS, ...JSON.parse(readFileSync(settingsFile(), 'utf8')) };
  } catch {
    return { ...DEFAULTS };
  }
  if (RETIRED_DEFAULTS.has(s.shortcut)) {
    // An old default saved to disk by an earlier build, not a choice the user made.
    s.shortcut = DEFAULT_SHORTCUT;
    saveSettings(s);
  }
  return s;
}

export function saveSettings(s: Settings): void {
  mkdirSync(app.getPath('userData'), { recursive: true });
  writeFileSync(settingsFile(), JSON.stringify(s, null, 2));
}

let active = DEFAULT_SHORTCUT;
/** The shortcut that is actually registered (may differ from settings if that one was taken). */
export function activeShortcut(): string { return active; }
export function setActiveShortcut(accel: string): void { active = accel; }

/** Electron accelerator → macOS glyphs, e.g. Control+Alt+Space → ⌃⌥Space. */
export function shortcutLabel(accel: string = active): string {
  return accel
    .replace(/CommandOrControl|CmdOrCtrl|Command|Cmd/g, '⌘')
    .replace(/Control|Ctrl/g, '⌃')
    .replace(/Alt|Option/g, '⌥')
    .replace(/Shift/g, '⇧')
    .replace(/\+/g, '');
}
