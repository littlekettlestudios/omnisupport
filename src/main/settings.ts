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
}

const DEFAULTS: Settings = { home: null, scale: 180, shortcut: 'CommandOrControl+Alt+Space', apiKey: null, webSearch: true };

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
