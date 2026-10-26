import { app, safeStorage } from 'electron';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface Settings {
  /** What the helper is called; the user picks it in Setup or by telling it in chat. */
  name: string;
  home: { x: number; y: number } | null;
  /** Character height in pixels. */
  scale: number;
  /** Electron accelerator for "look at something". Must not collide with macOS defaults. */
  shortcut: string;
  /** Anthropic API key for the 'api' backend. ANTHROPIC_API_KEY in the environment takes precedence. Encrypted with the macOS Keychain on disk. */
  apiKey: string | null;
  webSearch: boolean;
  /** 'claude-code' spawns the local Claude Code CLI (subscription login); 'api' uses the Anthropic API with apiKey. */
  backend: 'claude-code' | 'api';
  /** Model alias or id for the Claude Code backend. */
  claudeModel: string;
  /** Path to the claude binary; found via the login shell when null. */
  claudePath: string | null;
  /** file:// URL of a user-chosen GLB; null = the bundled assets/omni3.glb. */
  modelUrl: string | null;
  /** Draw the character from the bundled pixel sprite sheets (assets/sprites/omni3) instead of the 3D model. */
  sprites: boolean;
  /** Let the helper keep notes about the user across conversations (memory.json). */
  memory: boolean;
  /** The first-run Setup window has been shown. */
  welcomed: boolean;
  /** Keep a Dock icon (click it to open the window). Off makes it a menu-bar-only app again. */
  dock: boolean;
}

// ⌘⌥Space is macOS's "Show Finder search window"; ⌥Space is taken by Alfred/Raycast users.
export const DEFAULT_SHORTCUT = 'Control+Alt+Space';
/** Tried in order when the configured shortcut cannot be registered. */
export const SHORTCUT_FALLBACKS = [DEFAULT_SHORTCUT, 'Control+Alt+C', 'Control+Shift+Space', 'Control+Alt+Shift+Space'];
const RETIRED_DEFAULTS = new Set(['CommandOrControl+Alt+Space']);
export const DEFAULT_SCALE = 150;
/** Old default sizes saved to disk by earlier builds, not sizes the user picked. */
const RETIRED_SCALES = new Set([180]);
export const DEFAULT_NAME = 'Omni';
/** Old default names saved to disk by earlier builds, not names the user picked. */
const RETIRED_NAMES = new Set(['Clippet']);

const DEFAULTS: Settings = {
  name: DEFAULT_NAME, home: null, scale: DEFAULT_SCALE, shortcut: DEFAULT_SHORTCUT, apiKey: null, webSearch: true,
  backend: 'claude-code', claudeModel: 'sonnet', claudePath: null, modelUrl: null, sprites: false,
  memory: true, welcomed: false, dock: true,
};

/** On disk the API key is stored as apiKeyEnc (Keychain-encrypted) when encryption is available. */
type Stored = Partial<Settings> & { apiKeyEnc?: string };

export function settingsFile(): string {
  return join(app.getPath('userData'), 'settings.json');
}

export function loadSettings(): Settings {
  let stored: Stored;
  try {
    stored = JSON.parse(readFileSync(settingsFile(), 'utf8'));
  } catch {
    return { ...DEFAULTS };
  }
  const { apiKeyEnc, ...rest } = stored;
  const s: Settings = { ...DEFAULTS, ...rest };
  if (apiKeyEnc) {
    try { s.apiKey = safeStorage.decryptString(Buffer.from(apiKeyEnc, 'base64')); } catch { s.apiKey = null; }
  }
  let migrate = false;
  if (RETIRED_DEFAULTS.has(s.shortcut)) { s.shortcut = DEFAULT_SHORTCUT; migrate = true; }
  if (RETIRED_SCALES.has(s.scale)) { s.scale = DEFAULT_SCALE; migrate = true; }
  if (RETIRED_NAMES.has(s.name)) { s.name = DEFAULT_NAME; migrate = true; }
  if (rest.apiKey && safeStorage.isEncryptionAvailable()) migrate = true; // move a plain-text key into the Keychain
  if (migrate) saveSettings(s);
  return s;
}

/**
 * Whether to show the Dock icon at launch. Read straight from disk because it runs before
 * the app is ready, when the Keychain cannot decrypt the API key yet.
 */
export function dockAtLaunch(): boolean {
  try {
    return (JSON.parse(readFileSync(settingsFile(), 'utf8')) as Stored).dock !== false;
  } catch {
    return DEFAULTS.dock;
  }
}

export function saveSettings(s: Settings): void {
  mkdirSync(app.getPath('userData'), { recursive: true });
  const out: Stored = { ...s };
  if (s.apiKey && safeStorage.isEncryptionAvailable()) {
    out.apiKeyEnc = safeStorage.encryptString(s.apiKey).toString('base64');
    out.apiKey = null;
  }
  writeFileSync(settingsFile(), JSON.stringify(out, null, 2), { mode: 0o600 });
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
