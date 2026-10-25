import { app } from 'electron';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface Settings {
  home: { x: number; y: number } | null;
  scale: number;
  shortcut: string;
}

const DEFAULTS: Settings = { home: null, scale: 180, shortcut: 'CommandOrControl+Alt+Space' };

function file(): string {
  return join(app.getPath('userData'), 'settings.json');
}

export function loadSettings(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(readFileSync(file(), 'utf8')) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings): void {
  mkdirSync(app.getPath('userData'), { recursive: true });
  writeFileSync(file(), JSON.stringify(s, null, 2));
}
