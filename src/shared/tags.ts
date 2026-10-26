// Control tags the helper appends to a reply: [remember: ...], [name: ...], [mood: ...].
// Main parses them out of the finished text; the windows hide them while text streams.
import type { Mood } from './bubble';

const MOOD_RE = /\[mood:\s*(happy|neutral|sorry)\s*\]/gi;
const REMEMBER_RE = /\[remember:\s*([^\]]+)\]/gi;
const NAME_RE = /\[name:\s*([^\]]+)\]/gi;
const TAGS = ['mood', 'remember', 'name'];

export interface ParsedReply {
  text: string;
  mood: Mood;
  remember: string[];
  name: string | null;
}

export function parseReply(raw: string): ParsedReply {
  const mood = ([...raw.matchAll(MOOD_RE)].pop()?.[1]?.toLowerCase() as Mood | undefined) ?? 'neutral';
  const remember = [...raw.matchAll(REMEMBER_RE)].map((m) => m[1].trim()).filter(Boolean);
  const name = [...raw.matchAll(NAME_RE)].pop()?.[1]?.trim() || null;
  return { text: stripTags(raw), mood, remember, name };
}

/** Remove complete tags, and a tag still being streamed at the very end. */
export function stripTags(s: string): string {
  let out = s.replace(MOOD_RE, '').replace(REMEMBER_RE, '').replace(NAME_RE, '');
  const partial = /\[([a-z]*)(:[^\]]*)?$/i.exec(out);
  if (partial && (partial[1] === '' || TAGS.some((t) => t.startsWith(partial[1].toLowerCase())))) {
    out = out.slice(0, partial.index);
  }
  return out.replace(/[ \t]+\n/g, '\n').trim();
}
