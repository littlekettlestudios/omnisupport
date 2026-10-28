// Control tags the helper writes into a reply: [remember: ...], [name: ...], [mood: ...] at the
// end, and [point: x,y: label] after a step. Main parses them out of the text (points while it
// streams, the rest when it is finished); the windows hide them while text streams.
import type { Mood } from './bubble';

const MOOD_RE = /\[mood:\s*(happy|neutral|sorry)\s*\]/gi;
const REMEMBER_RE = /\[remember:\s*([^\]]+)\]/gi;
const NAME_RE = /\[name:\s*([^\]]+)\]/gi;
const POINT_RE = /\[point:\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*(?::\s*([^\]]*))?\]/gi;
const TAGS = ['mood', 'remember', 'name', 'point'];

/** A [point] tag: a spot on the conversation's latest screenshot, in its pixels. */
export interface PointTag { x: number; y: number; label: string }

/** Every complete [point] tag in the text so far, in order. */
export function pointTags(raw: string): PointTag[] {
  return [...raw.matchAll(POINT_RE)].map((m) => ({ x: Number(m[1]), y: Number(m[2]), label: (m[3] ?? '').trim().slice(0, 40) }));
}

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
  let out = s.replace(MOOD_RE, '').replace(REMEMBER_RE, '').replace(NAME_RE, '').replace(POINT_RE, '');
  const partial = /\[([a-z]*)(:[^\]]*)?$/i.exec(out);
  if (partial && (partial[1] === '' || TAGS.some((t) => t.startsWith(partial[1].toLowerCase())))) {
    out = out.slice(0, partial.index);
  }
  return out.replace(/[ \t]+\n/g, '\n').trim();
}
