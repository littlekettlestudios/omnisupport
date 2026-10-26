import { spawn, execFile } from 'node:child_process';
import { mkdtemp, realpath, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentEvent } from '@shared/bubble';
import { SIGN_IN_ACTIONS } from './onboarding';
import { userText } from './prompt';
import type { Turn } from './prompt';

/**
 * Lookup through the locally installed Claude Code CLI in headless mode (`claude -p`).
 * Runs on whatever login the CLI has (a Claude subscription, by default). The app never
 * reads or stores credentials; it only spawns the user's own CLI. Screenshots are
 * written to a private temp dir for the Read tool and deleted afterwards; Read may open
 * nothing outside that dir. Each reply is a fresh, unsaved CLI session that ignores the
 * user's own Claude Code settings; earlier turns of the conversation go into the prompt.
 */

export interface ClaudeCodeOptions {
  model?: string;
  claudePath?: string;
  webSearch?: boolean;
  signal?: AbortSignal;
}

let resolved: string | null = null;

/** Find the `claude` binary even when Electron was launched from Finder with a bare PATH. */
export async function findClaude(hint?: string): Promise<string | null> {
  if (hint) return hint;
  if (resolved) return resolved;
  const viaShell = await new Promise<string | null>((res) => {
    execFile('/bin/zsh', ['-lc', 'command -v claude'], { timeout: 8000 }, (err, out) => res(err ? null : out.trim() || null));
  });
  if (viaShell) resolved = viaShell;
  return resolved;
}

function* walk(o: unknown): Generator<Record<string, unknown>> {
  if (Array.isArray(o)) { for (const v of o) yield* walk(v); }
  else if (o && typeof o === 'object') { yield o as Record<string, unknown>; for (const v of Object.values(o)) yield* walk(v); }
}

/** Pull {url,title} pairs out of any tool result, whatever shape the CLI gives them. */
function extractSources(o: unknown): { url: string; title: string }[] {
  const out: { url: string; title: string }[] = [];
  for (const node of walk(o)) {
    if (typeof node['url'] === 'string' && /^https?:\/\//.test(node['url'])) {
      out.push({ url: node['url'], title: typeof node['title'] === 'string' ? node['title'] : node['url'] });
    }
    if (typeof node['text'] === 'string' && node['text'].includes('"url"')) {
      // WebSearch tool results are text that embeds a JSON list of links.
      const m = /\[\s*\{[\s\S]*?\}\s*\]/.exec(node['text']);
      if (m) { try { out.push(...extractSources(JSON.parse(m[0]))); } catch { /* not JSON */ } }
    }
  }
  return out;
}

/** Build the -p prompt: the new message, with earlier turns replayed as a transcript. */
async function buildPrompt(turns: Turn[], dir: string): Promise<string> {
  const shots = new Map<Turn, string>();
  for (const [i, t] of turns.entries()) {
    if (!t.image) continue;
    const path = join(dir, `region-${i + 1}.png`);
    await writeFile(path, t.image, { mode: 0o600 });
    shots.set(t, path);
  }
  const last = turns[turns.length - 1];
  const lastShot = shots.get(last);
  const ask = lastShot
    ? `Read the screenshot at ${lastShot} with the Read tool, then help the user with what it shows.\n${userText(last)}`
    : userText(last);
  if (turns.length === 1) return ask;
  const history = turns.slice(0, -1).map((t) => {
    if (t.role === 'assistant') return `You: ${t.text}`;
    const shot = shots.get(t);
    return `User: ${shot ? `[screen region saved at ${shot}; Read it if you need it] ` : ''}${t.text.trim() || '(no note)'}`;
  });
  return `Conversation so far:\n\n${history.join('\n\n')}\n\nThe user's new message:\n${ask}`;
}

/**
 * One reply through the local Claude Code CLI. Streams status, delta and source events and
 * resolves with the full reply text (tags included), or null after an error event.
 */
export async function replyViaClaudeCode(turns: Turn[], system: string, onEvent: (e: AgentEvent) => void, opts: ClaudeCodeOptions = {}): Promise<string | null> {
  const bin = await findClaude(opts.claudePath);
  if (!bin) {
    onEvent({ type: 'error', message: 'Claude Code CLI not found. Install it (npm install -g @anthropic-ai/claude-code), or set its path in Settings.', actions: [{ id: 'open-setup', label: 'Open Setup', primary: true }] });
    return null;
  }
  const dir = await mkdtemp(join(tmpdir(), 'clippet-'));
  const tools = opts.webSearch === false ? ['Read'] : ['Read', 'WebSearch', 'WebFetch'];
  // Pre-approve Read for the screenshot dir only; with dontAsk every other path is denied, so
  // text in a captured region cannot get the model to open other files on the Mac. Rules
  // match the resolved path (macOS temp dirs sit behind the /var -> /private/var symlink),
  // and `//` marks an absolute path.
  const readRule = `Read(/${await realpath(dir)}/**)`;
  const allowed = tools.map((t) => (t === 'Read' ? readRule : t));
  const prompt = await buildPrompt(turns, dir);

  const args = [
    '-p', prompt,
    '--model', opts.model ?? 'sonnet',
    '--tools', tools.join(','),
    '--allowedTools', allowed.join(','),
    '--disallowedTools', 'mcp__*',
    '--permission-mode', 'dontAsk',
    // Project settings only (the empty temp dir has none): the user's own allow rules, hooks
    // and plugins would otherwise apply here and could widen the Read rule above.
    '--setting-sources', 'project',
    '--system-prompt', system,
    '--no-session-persistence',
    '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
  ];
  const env: NodeJS.ProcessEnv = { ...process.env, CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1', CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' };
  // The CLI prefers an API key when one is set; strip it so the subscription login is used.
  delete env['ANTHROPIC_API_KEY'];
  delete env['ANTHROPIC_AUTH_TOKEN'];

  onEvent({ type: 'status', status: 'thinking' });
  let text = '';
  let talking = false;
  let finished = false;
  let reply: string | null = null;
  const seen = new Set<string>();

  const handleLine = (line: string): void => {
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(line); } catch { return; }
    const type = msg['type'];
    if (type === 'stream_event') {
      const ev = msg['event'] as Record<string, unknown>;
      if (ev?.['type'] === 'content_block_delta') {
        const delta = ev['delta'] as Record<string, unknown>;
        if (delta?.['type'] === 'text_delta' && typeof delta['text'] === 'string') {
          if (!talking) { talking = true; onEvent({ type: 'status', status: 'talking' }); }
          text += delta['text'];
          onEvent({ type: 'delta', text: delta['text'] });
        }
      } else if (ev?.['type'] === 'content_block_start') {
        const block = ev['content_block'] as Record<string, unknown>;
        if (block?.['type'] === 'tool_use' || block?.['type'] === 'server_tool_use') {
          const name = String(block['name'] ?? '');
          if (/search/i.test(name)) onEvent({ type: 'status', status: 'searching' });
          else if (/fetch/i.test(name)) onEvent({ type: 'status', status: 'reading' });
          talking = false; // text after a tool call is a new block
        }
      }
    } else if (type === 'user') {
      // One search returns ~10 links; surface the top few, the answer text cites the rest.
      let n = 0;
      for (const s of extractSources(msg['tool_use_result'] ?? msg['message'])) {
        if (seen.has(s.url) || n >= 3) continue;
        seen.add(s.url); n++;
        onEvent({ type: 'source', url: s.url, title: s.title });
      }
    } else if (type === 'rate_limit_event') {
      console.warn('[claude-code] rate limit event', JSON.stringify(msg).slice(0, 300));
    } else if (type === 'result') {
      finished = true;
      const result = typeof msg['result'] === 'string' ? msg['result'] : text;
      if (msg['is_error']) {
        const signIn = /OAuth|authenticate|login/i.test(result);
        onEvent({ type: 'error', message: friendly(result), actions: signIn ? SIGN_IN_ACTIONS : undefined });
        return;
      }
      const final = result || text;
      for (const mm of final.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g)) {
        if (!seen.has(mm[2])) { seen.add(mm[2]); onEvent({ type: 'source', url: mm[2], title: mm[1] }); }
      }
      reply = final;
    }
  };

  await new Promise<void>((resolve) => {
    const child = spawn(bin, args, { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      buf += chunk.toString('utf8');
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) { handleLine(buf.slice(0, nl)); buf = buf.slice(nl + 1); }
    });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
    const onAbort = (): void => { child.kill('SIGTERM'); };
    opts.signal?.addEventListener('abort', onAbort, { once: true });
    child.on('error', (err) => {
      onEvent({ type: 'error', message: `Could not start Claude Code: ${err.message}` });
      resolve();
    });
    child.on('close', (code) => {
      opts.signal?.removeEventListener('abort', onAbort);
      if (buf.trim()) handleLine(buf);
      if (!finished && !opts.signal?.aborted) {
        onEvent({ type: 'error', message: `Claude Code exited (${code ?? 'killed'}). ${stderr.trim().split('\n').pop() ?? ''}`.trim() });
      }
      resolve();
    });
  }).finally(() => rm(dir, { recursive: true, force: true }));
  return reply;
}

function friendly(cliMessage: string): string {
  if (/OAuth|authenticate|login/i.test(cliMessage)) return `Claude Code is not signed in. Open a terminal, run \`claude\`, and sign in with /login. (${cliMessage})`;
  if (/limit/i.test(cliMessage)) return `Claude Code usage limit reached. (${cliMessage})`;
  return cliMessage;
}
