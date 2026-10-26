import { nativeImage } from 'electron';
import { randomUUID } from 'node:crypto';
import type { AgentEvent } from '@shared/bubble';
import type { ChatEvent, ConversationView, TurnView } from '@shared/panel';
import { parseReply } from '@shared/tags';
import type { CompanionWindow } from './companionWindow';
import { replyViaApi } from './agent';
import { replyViaClaudeCode } from './claudeCode';
import { addMemory, listMemories } from './memory';
import { systemPrompt } from './prompt';
import type { Turn } from './prompt';
import { loadSettings, saveSettings } from './settings';

/** A conversation left alone this long is not continued by a click on the character. */
const STALE_MS = 15 * 60 * 1000;

interface Conversation {
  id: string;
  turns: Turn[];
  views: TurnView[];
  busy: boolean;
  lastActivity: number;
}

/**
 * The one live conversation, shared by the bubble and the panel's Chat tab. Owns the
 * backend calls, the companion's reactions while answering, and the [remember]/[name]
 * tags that update memory and settings.
 */
export class Chat {
  private conv: Conversation | null = null;
  private abort: AbortController | null = null;
  private listeners = new Set<(e: ChatEvent) => void>();
  /** Called when a reply changed memory or the helper's name. */
  onStateChanged: (() => void) | null = null;

  constructor(private companion: CompanionWindow) {}

  on(fn: (e: ChatEvent) => void): void { this.listeners.add(fn); }

  private emit(e: ChatEvent): void { for (const fn of this.listeners) fn(e); }

  get current(): ConversationView | null {
    return this.conv && { id: this.conv.id, turns: this.conv.views, busy: this.conv.busy };
  }

  get currentId(): string | null { return this.conv?.id ?? null; }

  /** Drop the current conversation and start an empty one. */
  newConversation(): string {
    this.stop();
    this.conv = { id: randomUUID(), turns: [], views: [], busy: false, lastActivity: Date.now() };
    this.emit({ conversationId: this.conv.id, type: 'new' });
    return this.conv.id;
  }

  /** The current conversation if it is recent, else a new one. */
  resume(): string {
    if (this.conv && (this.conv.busy || Date.now() - this.conv.lastActivity < STALE_MS)) return this.conv.id;
    return this.newConversation();
  }

  stop(): void {
    this.abort?.abort();
    this.abort = null;
  }

  /** Send a user message (optionally with the screen region it is about) and stream the reply. */
  async send(text: string, image?: Buffer): Promise<void> {
    if (!this.conv) this.newConversation();
    const conv = this.conv!;
    this.stop();
    const abort = new AbortController();
    this.abort = abort;

    const turn: Turn = { role: 'user', text, image };
    conv.turns.push(turn);
    const userView: TurnView = { role: 'user', text, image: image && nativeImage.createFromBuffer(image).resize({ width: 320 }).toDataURL() };
    conv.views.push(userView);
    conv.busy = true;
    conv.lastActivity = Date.now();
    this.emit({ conversationId: conv.id, type: 'turn', turn: userView });

    const settings = loadSettings();
    const reply: TurnView = { role: 'assistant', text: '', sources: [] };
    let talking = false;
    const onEvent = (ev: AgentEvent): void => {
      if (abort.signal.aborted) return;
      if (ev.type === 'source') reply.sources!.push({ url: ev.url, title: ev.title });
      if (ev.type === 'error') { reply.text = ev.message; reply.error = true; }
      this.emit({ conversationId: conv.id, ...ev });
      if (ev.type === 'status') {
        if (ev.status === 'searching' || ev.status === 'reading') this.companion.send({ type: 'setState', state: 'searching' });
        else if (ev.status === 'thinking') this.companion.send({ type: 'setState', state: 'thinking' });
      }
      if (ev.type === 'delta' && !talking) { talking = true; this.companion.send({ type: 'setState', state: 'talking' }); }
      if (ev.type === 'error') {
        this.companion.send({ type: 'react', clip: 'sorry' });
        this.companion.send({ type: 'setState', state: 'idle' });
      }
    };

    this.companion.send({ type: 'setState', state: 'thinking' });
    const system = systemPrompt({ name: settings.name, memories: settings.memory ? listMemories() : null });
    const turns = [...conv.turns];
    const raw = settings.backend === 'api'
      ? await replyViaApi(turns, system, onEvent, { apiKey: process.env['ANTHROPIC_API_KEY'] || settings.apiKey || undefined, webSearch: settings.webSearch, signal: abort.signal })
      : await replyViaClaudeCode(turns, system, onEvent, { model: settings.claudeModel, claudePath: settings.claudePath ?? undefined, webSearch: settings.webSearch, signal: abort.signal });

    if (this.abort === abort) this.abort = null;
    conv.busy = false;
    conv.lastActivity = Date.now();

    if (raw === null) {
      // Failed or stopped: keep the error on screen but leave the turn out of the history.
      conv.turns.splice(conv.turns.indexOf(turn), 1);
      if (reply.error) conv.views.push(reply);
      if (abort.signal.aborted) this.companion.send({ type: 'setState', state: 'idle' });
      return;
    }

    const parsed = parseReply(raw);
    const remembered = settings.memory ? parsed.remember.filter((f) => addMemory(f)) : [];
    let renamed: string | undefined;
    if (parsed.name && parsed.name !== settings.name) {
      renamed = parsed.name.slice(0, 40);
      saveSettings({ ...loadSettings(), name: renamed });
    }
    conv.turns.push({ role: 'assistant', text: parsed.text });
    reply.text = parsed.text;
    conv.views.push(reply);
    this.emit({ conversationId: conv.id, type: 'done', mood: parsed.mood, text: parsed.text, remembered, renamed });
    this.companion.send({ type: 'react', clip: parsed.mood === 'happy' ? 'happy' : parsed.mood === 'sorry' ? 'sorry' : 'nod' });
    this.companion.send({ type: 'setState', state: 'idle' });
    if (remembered.length || renamed) this.onStateChanged?.();
  }
}
