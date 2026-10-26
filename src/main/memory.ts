import { app } from 'electron';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { MemoryFact } from '@shared/panel';

/**
 * Long-term notes about the user, kept in memory.json next to settings.json. The helper
 * adds them with [remember: ...] tags in its replies; the user can add, delete or clear
 * them in the Memory tab. They are sent with every request so nothing has to be repeated.
 */

const MAX_FACTS = 60;
const MAX_LEN = 240;

export function memoryFile(): string {
  return join(app.getPath('userData'), 'memory.json');
}

export function listMemories(): MemoryFact[] {
  try {
    const j = JSON.parse(readFileSync(memoryFile(), 'utf8'));
    return Array.isArray(j.facts) ? j.facts : [];
  } catch {
    return [];
  }
}

function write(facts: MemoryFact[]): void {
  mkdirSync(app.getPath('userData'), { recursive: true });
  writeFileSync(memoryFile(), JSON.stringify({ facts }, null, 2), { mode: 0o600 });
}

/** Add a fact unless an identical one is already stored; the oldest facts drop off past MAX_FACTS. */
export function addMemory(text: string): MemoryFact | null {
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, MAX_LEN);
  if (!clean) return null;
  const facts = listMemories();
  if (facts.some((f) => f.text.toLowerCase() === clean.toLowerCase())) return null;
  const fact: MemoryFact = { id: randomUUID(), text: clean, at: new Date().toISOString() };
  write([...facts, fact].slice(-MAX_FACTS));
  return fact;
}

export function removeMemory(id: string): void {
  write(listMemories().filter((f) => f.id !== id));
}

export function clearMemories(): void {
  write([]);
}
