import { app } from 'electron';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface Settings {
  home: { x: number; y: number } | null;
  scale: number;
  shortcut: string;
  /** Anthropic API key. ANTHROPIC_API_KEY in the environment takes precedence. Keychain storage is M4. */
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
}

const DEFAULTS: Settings = { home: null, scale: 180, shortcut: 'CommandOrControl+Alt+Space', apiKey: null, webSearch: true, backend: 'claude-code', claudeModel: 'sonnet', claudePath: null, modelUrl: null };

export function settingsFile(): string {
  return join(app.getPath('userData'), 'settings.json');
}

export function loadSettings(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(readFileSync(settingsFile(), 'utf8')) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings): void {
  mkdirSync(app.getPath('userData'), { recursive: true });
  writeFileSync(settingsFile(), JSON.stringify(s, null, 2));
}
