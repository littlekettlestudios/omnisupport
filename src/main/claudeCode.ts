import { spawn, execFile } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentEvent, Mood } from '@shared/bubble';
import { SYSTEM, MOOD_RE } from './agent';
import type { LookupInput } from './agent';

/**
 * Lookup through the locally installed Claude Code CLI in headless mode (`claude -p`).
 * Runs on whatever login the CLI has (a Claude subscription, by default). Clippet never
 * reads or stores credentials; it only spawns the user's own CLI. The screenshot is
 * written to a private temp dir for the Read tool and deleted afterwards.
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

export async function lookupViaClaudeCode(input: LookupInput, onEvent: (e: AgentEvent) => void, opts: ClaudeCodeOptions = {}): Promise<void> {
  const bin = await findClaude(opts.claudePath);
  if (!bin) {
    onEvent({ type: 'error', message: 'Claude Code CLI not found. Install it (npm i -g @anthropic-ai/claude-code) or set "claudePath" in settings.json.' });
    return;
  }
  const dir = await mkdtemp(join(tmpdir(), 'clippet-'));
  const shot = join(dir, 'shot.png');
  await writeFile(shot, input.imagePng, { mode: 0o600 });

  const tools = opts.webSearch === false ? 'Read' : 'Read,WebSearch,WebFetch';
  const prompt = [
    `Read the screenshot at ${shot} with the Read tool, then help the user with what it shows.`,
    input.context ? `Context: ${input.context}` : null,
    input.note.trim() ? `Note from the user: ${input.note.trim()}` : 'The user did not add a note. Work out what they most likely need from the region.',
  ].filter(Boolean).join('\n');

  const args = [
    '-p', prompt,
    '--model', opts.model ?? 'sonnet',
    '--tools', tools,
    '--allowedTools', tools,
    '--disallowedTools', 'mcp__*',
    '--permission-mode', 'dontAsk',
    '--system-prompt', SYSTEM,
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
    } else if (type === 'user' || (type === 'assistant' && !talking)) {
      for (const s of extractSources(msg['message'])) {
        if (seen.has(s.url)) continue;
        seen.add(s.url);
        onEvent({ type: 'source', url: s.url, title: s.title });
      }
    } else if (type === 'result') {
      finished = true;
      const result = typeof msg['result'] === 'string' ? msg['result'] : text;
      if (msg['is_error']) {
        onEvent({ type: 'error', message: friendly(result) });
        return;
      }
      const final = result || text;
      const m = MOOD_RE.exec(final);
      const mood: Mood = (m?.[1]?.toLowerCase() as Mood) ?? 'neutral';
      onEvent({ type: 'done', mood, text: final.replace(MOOD_RE, '').trim() });
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
}

function friendly(cliMessage: string): string {
  if (/OAuth|authenticate|login/i.test(cliMessage)) return `Claude Code is not signed in. Open a terminal, run \`claude\`, and sign in with /login. (${cliMessage})`;
  if (/limit/i.test(cliMessage)) return `Claude Code usage limit reached. (${cliMessage})`;
  return cliMessage;
}
