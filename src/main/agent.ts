import Anthropic from '@anthropic-ai/sdk';
import type { AgentEvent, Mood } from '@shared/bubble';

const MODEL = 'claude-opus-5-5';

export const SYSTEM = `You are Clippet, a small, cheerful desktop companion. The user has selected a region of their screen and may have added a note. Help them with whatever that region shows: an error, a confusing setting, a product, a word, a message, a piece of code.

How to answer:
- First line: one sentence that says what this is or what is wrong. No preamble, do not describe the screenshot back.
- Then, only if there is something to do: up to 5 numbered steps, each one short.
- Under 150 words total. Plain words. No headings.
- Use web_search when the region shows an error message, a product or version, a price, a date, or anything that may have changed recently. Prefer official docs and primary sources. Skip searching for things you already know well.
- Never ask the user to paste passwords or keys.
- On the very last line, alone, write [mood: happy] if you solved it, [mood: neutral] if you explained it, or [mood: sorry] if you could not help.`;

export const MOOD_RE = /\s*\[mood:\s*(happy|neutral|sorry)\]\s*$/i;

export interface LookupInput {
  imagePng: Buffer;
  note: string;
  context?: string;
}

export interface LookupOptions {
  apiKey?: string;
  webSearch?: boolean;
  signal?: AbortSignal;
  /** Shown in the no-key error so the user knows where to put one. */
  settingsPath?: string;
}

/** One lookup: streams AgentEvents, resolves when done. Errors are delivered as events, not thrown. */
export async function lookup(input: LookupInput, onEvent: (e: AgentEvent) => void, opts: LookupOptions = {}): Promise<void> {
  const noKey = `No Anthropic API key found. Set ANTHROPIC_API_KEY in the environment Clippet is launched from, or add "apiKey" to ${opts.settingsPath ?? 'settings.json'}.`;
  let client: Anthropic;
  try {
    client = new Anthropic(opts.apiKey ? { apiKey: opts.apiKey } : {});
  } catch {
    onEvent({ type: 'error', message: noKey });
    return;
  }
  const webSearch = opts.webSearch ?? true;

  const userText = [
    input.context ? `Context: ${input.context}` : null,
    input.note.trim() ? `Note from the user: ${input.note.trim()}` : 'The user did not add a note. Work out what they most likely need from the region.',
  ].filter(Boolean).join('\n');

  const messages: Anthropic.Beta.BetaMessageParam[] = [{
    role: 'user',
    content: [
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: input.imagePng.toString('base64') } },
      { type: 'text', text: userText },
    ],
  }];

  const tools: Anthropic.Beta.BetaToolUnion[] = webSearch
    ? [
        { type: 'web_search_20260209', name: 'web_search', max_uses: 5 },
        { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 3 },
      ]
    : [];

  let text = '';
  let talking = false;
  onEvent({ type: 'status', status: 'thinking' });

  try {
    for (let continuation = 0; continuation < 4; continuation++) {
      const stream = client.beta.messages.stream(
        {
          model: MODEL,
          max_tokens: 8000,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
          tools,
          messages,
        },
        { signal: opts.signal },
      );

      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          const block = event.content_block;
          if (block.type === 'server_tool_use') {
            onEvent({ type: 'status', status: block.name === 'web_fetch' ? 'reading' : 'searching' });
          } else if (block.type === 'web_search_tool_result') {
            if (Array.isArray(block.content)) {
              for (const r of block.content) {
                if (r.type === 'web_search_result') onEvent({ type: 'source', url: r.url, title: r.title });
              }
            }
          } else if (block.type === 'text' && !talking) {
            talking = true;
            onEvent({ type: 'status', status: 'talking' });
          }
        } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          text += event.delta.text;
          onEvent({ type: 'delta', text: event.delta.text });
        }
      }

      const message = await stream.finalMessage();
      if (message.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: message.content });
        continue;
      }
      if (message.stop_reason === 'refusal') {
        onEvent({ type: 'error', message: "Clippet can't help with that one." });
        return;
      }
      break;
    }
    const m = MOOD_RE.exec(text);
    const mood: Mood = (m?.[1]?.toLowerCase() as Mood) ?? 'neutral';
    onEvent({ type: 'done', mood, text: text.replace(MOOD_RE, '').trim() });
  } catch (err) {
    if (opts.signal?.aborted) return;
    if (err instanceof Anthropic.AuthenticationError) onEvent({ type: 'error', message: `The Anthropic API key was rejected. ${noKey}` });
    else if (err instanceof Anthropic.RateLimitError) onEvent({ type: 'error', message: 'Rate limited. Try again in a moment.' });
    else if (err instanceof Anthropic.APIConnectionError) onEvent({ type: 'error', message: 'Could not reach the API. Check your connection.' });
    else if (err instanceof Anthropic.APIError) onEvent({ type: 'error', message: `API error: ${err.message}` });
    else onEvent({ type: 'error', message: `Something went wrong: ${(err as Error).message}` });
  }
}

/** Strip the trailing mood tag from streamed text for display. */
export function stripMood(s: string): string {
  return s.replace(/\s*\[mood:[^\]]*\]?\s*$/i, '');
}
