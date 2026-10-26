import Anthropic from '@anthropic-ai/sdk';
import type { AgentEvent } from '@shared/bubble';
import { userText } from './prompt';
import type { Turn } from './prompt';

const MODEL = 'claude-opus-5-5';

export interface ApiOptions {
  apiKey?: string;
  webSearch?: boolean;
  signal?: AbortSignal;
}

function toMessages(turns: Turn[]): Anthropic.Beta.BetaMessageParam[] {
  return turns.map((t): Anthropic.Beta.BetaMessageParam => {
    if (t.role === 'assistant') return { role: 'assistant', content: t.text || '(no answer)' };
    const content: Anthropic.Beta.BetaContentBlockParam[] = [];
    if (t.image) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: t.image.toString('base64') } });
    content.push({ type: 'text', text: userText(t) });
    return { role: 'user', content };
  });
}

/**
 * One reply through the Anthropic API. Streams status, delta and source events and
 * resolves with the full reply text (tags included), or null after an error event.
 */
export async function replyViaApi(turns: Turn[], system: string, onEvent: (e: AgentEvent) => void, opts: ApiOptions = {}): Promise<string | null> {
  const noKey = 'No Anthropic API key found. Add one in Settings, or set ANTHROPIC_API_KEY in the environment Omni Support is launched from.';
  let client: Anthropic;
  try {
    client = new Anthropic(opts.apiKey ? { apiKey: opts.apiKey } : {});
  } catch {
    onEvent({ type: 'error', message: noKey, actions: [{ id: 'open-setup', label: 'Open Settings', primary: true }] });
    return null;
  }

  const messages = toMessages(turns);
  const tools: Anthropic.Beta.BetaToolUnion[] = opts.webSearch ?? true
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
          system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
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
        onEvent({ type: 'error', message: "Sorry, I can't help with that one." });
        return null;
      }
      break;
    }
    return text;
  } catch (err) {
    if (opts.signal?.aborted) return null;
    const setup = [{ id: 'open-setup' as const, label: 'Open Settings', primary: true }];
    if (err instanceof Anthropic.AuthenticationError) onEvent({ type: 'error', message: `The Anthropic API key was rejected. ${noKey}`, actions: setup });
    else if (err instanceof Anthropic.RateLimitError) onEvent({ type: 'error', message: 'Rate limited. Try again in a moment.' });
    else if (err instanceof Anthropic.APIConnectionError) onEvent({ type: 'error', message: 'Could not reach the API. Check your connection.' });
    else if (err instanceof Anthropic.APIError) onEvent({ type: 'error', message: `API error: ${err.message}` });
    else onEvent({ type: 'error', message: `Something went wrong: ${(err as Error).message}` });
    return null;
  }
}
