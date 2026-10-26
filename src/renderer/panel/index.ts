import type { ChatEvent, PanelBridge, PanelSettings, PanelState, PanelTab, SetupCheck, TurnView } from '@shared/panel';
import { escapeHtml, renderMarkdown } from '@shared/markdown';
declare global { interface Window { panel: PanelBridge } }

const panel = window.panel;
const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
let state: PanelState;

// ---- tabs ------------------------------------------------------------------
function setTab(tab: PanelTab): void {
  for (const b of document.querySelectorAll<HTMLButtonElement>('nav button')) b.classList.toggle('on', b.dataset['tab'] === tab);
  for (const s of document.querySelectorAll('section')) s.classList.toggle('on', s.id === tab);
  if (tab === 'chat') $('input').focus();
}
for (const b of document.querySelectorAll<HTMLButtonElement>('nav button')) b.addEventListener('click', () => setTab(b.dataset['tab'] as PanelTab));
panel.onTab(setTab);
setTab((new URLSearchParams(location.search).get('tab') as PanelTab) || 'chat');

// Links open in the browser; data-href links are fixed URLs.
document.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest('a');
  if (!a) return;
  const url = a.dataset['href'] || a.getAttribute('href');
  if (url && /^https?:\/\//.test(url)) { e.preventDefault(); panel.openUrl(url); }
});

// ---- chat ------------------------------------------------------------------
const log = $('log');
const input = $<HTMLTextAreaElement>('input');
const sendBtn = $<HTMLButtonElement>('send');
let busy = false;
let conversationId: string | null = null;
/** The assistant message being streamed. */
let live: { el: HTMLElement; text: string; sources: HTMLElement | null; seen: Set<string> } | null = null;
let statusEl: HTMLElement | null = null;

const STATUS: Record<string, string> = { thinking: 'Thinking…', searching: 'Searching the web…', reading: 'Reading a page…' };

function scrollDown(): void { log.scrollTop = log.scrollHeight; }

function emptyState(): void {
  const name = state?.settings.name ?? 'Omni';
  log.innerHTML = `<div class="empty"><h2>Chat with ${escapeHtml(name)}</h2><p>Ask anything, or press <code>${escapeHtml(state?.shortcutLabel ?? '')}</code> to point at something on screen. Replies to answers in the speech bubble show up here too.</p></div>`;
}

function addSources(msg: HTMLElement, list: { url: string; title: string }[]): HTMLElement | null {
  if (!list.length) return null;
  const box = document.createElement('div');
  box.className = 'src';
  for (const s of list) {
    const a = document.createElement('a');
    a.href = s.url; a.textContent = s.title || s.url; a.title = s.url;
    box.appendChild(a);
  }
  msg.appendChild(box);
  return box;
}

function addTurn(t: TurnView): HTMLElement {
  log.querySelector('.empty')?.remove();
  const el = document.createElement('div');
  el.className = `msg ${t.role}${t.error ? ' error' : ''}`;
  if (t.image) { const img = document.createElement('img'); img.src = t.image; el.appendChild(img); }
  const body = document.createElement('div');
  if (t.role === 'user') body.textContent = t.text || (t.image ? '(no note, just look)' : '');
  else if (t.error) body.textContent = t.text;
  else body.innerHTML = renderMarkdown(t.text);
  el.appendChild(body);
  if (t.sources) addSources(el, t.sources);
  log.appendChild(el);
  scrollDown();
  return el;
}

function setStatus(text: string | null): void {
  if (!text) { statusEl?.remove(); statusEl = null; return; }
  if (!statusEl) { statusEl = document.createElement('div'); statusEl.className = 'status'; log.appendChild(statusEl); }
  statusEl.textContent = text;
  log.appendChild(statusEl); // keep it last
  scrollDown();
}

function setBusy(v: boolean): void {
  busy = v;
  sendBtn.textContent = v ? 'Stop' : 'Send';
  sendBtn.classList.toggle('primary', !v);
}

function showConversation(): void {
  live = null; statusEl = null;
  const conv = state.conversation;
  conversationId = conv?.id ?? null;
  log.innerHTML = '';
  if (!conv || !conv.turns.length) emptyState();
  else for (const t of conv.turns) addTurn(t);
  setBusy(!!conv?.busy);
  if (conv?.busy) setStatus(STATUS['thinking']);
}

function liveMessage(): NonNullable<typeof live> {
  if (!live) {
    const el = addTurn({ role: 'assistant', text: '' });
    live = { el, text: '', sources: null, seen: new Set() };
  }
  return live;
}

panel.onChat((ev: ChatEvent) => {
  if (ev.type === 'new') { conversationId = ev.conversationId; live = null; statusEl = null; log.innerHTML = ''; emptyState(); setBusy(false); return; }
  if (ev.conversationId !== conversationId) { conversationId = ev.conversationId; log.innerHTML = ''; live = null; statusEl = null; }
  switch (ev.type) {
    case 'turn':
      addTurn(ev.turn);
      live = null;
      setBusy(true);
      setStatus(STATUS['thinking']);
      break;
    case 'status':
      setStatus(STATUS[ev.status] ?? null);
      break;
    case 'delta': {
      setStatus(null);
      const m = liveMessage();
      m.text += ev.text;
      (m.el.lastElementChild as HTMLElement).innerHTML = renderMarkdown(m.text);
      scrollDown();
      break;
    }
    case 'source': {
      const m = liveMessage();
      if (m.seen.has(ev.url)) break;
      m.seen.add(ev.url);
      if (!m.sources) m.sources = addSources(m.el, [ev]);
      else m.sources.appendChild(Object.assign(document.createElement('a'), { href: ev.url, textContent: ev.title || ev.url, title: ev.url }));
      break;
    }
    case 'done': {
      setStatus(null);
      const m = liveMessage();
      m.el.firstElementChild!.innerHTML = renderMarkdown(ev.text);
      const notes = [ev.renamed ? `New name saved: ${ev.renamed}` : null, ...(ev.remembered ?? []).map((f) => `Remembered: ${f}`)].filter(Boolean);
      if (notes.length) m.el.appendChild(Object.assign(document.createElement('div'), { className: 'memo', textContent: notes.join('\n') }));
      live = null;
      setBusy(false);
      break;
    }
    case 'error':
      setStatus(null);
      if (live && !live.text) live.el.remove();
      live = null;
      addTurn({ role: 'assistant', text: ev.message, error: true });
      setBusy(false);
      break;
  }
});

function send(): void {
  if (busy) { panel.stop(); setBusy(false); setStatus(null); return; }
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  autosize();
  panel.send(text);
}
function autosize(): void { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 140)}px`; }
sendBtn.addEventListener('click', send);
input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
input.addEventListener('input', autosize);
$('new-chat').addEventListener('click', () => panel.newChat());

// ---- memory ----------------------------------------------------------------
function renderFacts(): void {
  const box = $('facts');
  box.innerHTML = '';
  if (!state.memories.length) {
    box.innerHTML = '<div class="fact"><span class="muted">Nothing yet. Tell your helper about yourself in chat, or add a note below.</span></div>';
    return;
  }
  for (const f of [...state.memories].reverse()) {
    const row = document.createElement('div');
    row.className = 'fact';
    const span = document.createElement('span');
    span.textContent = f.text;
    span.title = `Saved ${new Date(f.at).toLocaleString()}`;
    const del = document.createElement('button');
    del.textContent = '×'; del.title = 'Forget this';
    del.addEventListener('click', async () => apply(await panel.removeMemory(f.id)));
    row.append(span, del);
    box.appendChild(row);
  }
}
$('memory-on').addEventListener('change', (e) => void save({ memory: (e.target as HTMLInputElement).checked }));
const factInput = $<HTMLInputElement>('fact-input');
const addFact = async (): Promise<void> => {
  if (!factInput.value.trim()) return;
  apply(await panel.addMemory(factInput.value));
  factInput.value = '';
};
$('fact-add').addEventListener('click', () => void addFact());
factInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') void addFact(); });
$('fact-clear').addEventListener('click', async () => {
  if (confirm('Forget everything your helper remembers about you?')) apply(await panel.clearMemories());
});
$('open-data').addEventListener('click', () => panel.openDataFolder());
$('open-data-2').addEventListener('click', () => panel.openDataFolder());

// ---- settings --------------------------------------------------------------
async function save(patch: Partial<PanelSettings>): Promise<void> { apply(await panel.saveSettings(patch)); }

const nameInput = $<HTMLInputElement>('name');
nameInput.addEventListener('change', () => { if (nameInput.value.trim()) void save({ name: nameInput.value.trim() }); });
const scale = $<HTMLInputElement>('scale');
scale.addEventListener('input', () => { $('scale-label').textContent = `${scale.value} px tall`; });
scale.addEventListener('change', () => void save({ scale: Number(scale.value) }));
$('sprites').addEventListener('change', (e) => void save({ sprites: (e.target as HTMLInputElement).checked }));
$('model-choose').addEventListener('click', async () => apply(await panel.chooseModel()));
$('model-reset').addEventListener('click', async () => apply(await panel.resetModel()));
for (const r of document.querySelectorAll<HTMLInputElement>('input[name=backend]')) {
  r.addEventListener('change', () => { if (r.checked) void save({ backend: r.value as PanelSettings['backend'] }); });
}
$('claude-model').addEventListener('change', (e) => void save({ claudeModel: (e.target as HTMLSelectElement).value }));
$('web-search').addEventListener('change', (e) => void save({ webSearch: (e.target as HTMLInputElement).checked }));
const keyInput = $<HTMLInputElement>('api-key');
$('key-save').addEventListener('click', async () => { if (keyInput.value.trim()) { apply(await panel.setApiKey(keyInput.value)); keyInput.value = ''; } });
$('key-remove').addEventListener('click', async () => apply(await panel.setApiKey(null)));
const shortcut = $<HTMLInputElement>('shortcut');
$('shortcut-save').addEventListener('click', () => { if (shortcut.value.trim()) void save({ shortcut: shortcut.value.trim() }); });

// ---- setup -----------------------------------------------------------------
const PILL: Record<SetupCheck, [string, string]> = {
  ok: ['ok', 'Ready'], missing: ['bad', 'Missing'], 'signed-out': ['warn', 'Not signed in'], denied: ['bad', 'Not allowed'],
  unknown: ['warn', 'Not checked yet'], 'not-needed': ['off', 'Not needed'],
};

interface Step { title: string; check: SetupCheck; body: string; actions?: [string, () => void][] }

function renderSetup(): void {
  const s = state.setup;
  const usingApi = state.settings.backend === 'api';
  const steps: Step[] = [
    usingApi
      ? {
          title: 'Anthropic API key', check: s.apiKey,
          body: 'You picked the Anthropic API. Create a key at console.anthropic.com and paste it in Settings → API key. It is stored encrypted in your Keychain.',
          actions: [['Open Settings', () => setTab('settings')], ['Get a key', () => panel.openUrl('https://console.anthropic.com/settings/keys')]],
        }
      : {
          title: 'Claude Code, signed in', check: s.claudeCode,
          body: s.claudeCode === 'missing'
            ? 'Answers run through the Claude Code CLI on your Claude subscription. Install it with <code>npm install -g @anthropic-ai/claude-code</code>, then sign in.'
            : 'Answers run through the Claude Code CLI on your Claude subscription. Open a terminal, run <code>claude</code>, and sign in with <code>/login</code>.',
          actions: [['Open Terminal', () => panel.openTerminal()], ['Check again', () => void refresh()]],
        },
    {
      title: 'Screen Recording permission', check: s.screen,
      body: 'macOS asks the first time you point at something. If you said no, turn it on for Omni Support (or “Electron” when running from source) in System Settings → Privacy & Security → Screen Recording, then restart the app.',
      actions: [['Open System Settings', () => panel.openScreenSettings()]],
    },
    {
      title: 'Try it', check: 'not-needed',
      body: `Press <code>${escapeHtml(state.shortcutLabel)}</code> and drag over anything on screen, or click the helper to chat. Reply to any answer to keep the conversation going.`,
    },
  ];
  const box = $('steps');
  box.innerHTML = '';
  steps.forEach((st, i) => {
    const el = document.createElement('div');
    el.className = 'step';
    const [cls, label] = PILL[st.check];
    el.innerHTML = `<div class="n">${i + 1}</div><div class="body"><div class="row" style="padding:0;border:0"><strong class="label">${escapeHtml(st.title)}</strong>${i < 2 ? `<span class="pill ${cls}">${label}</span>` : ''}</div><div class="muted">${st.body}</div><div class="acts"></div></div>`;
    const acts = el.querySelector('.acts')!;
    for (const [text, fn] of st.actions ?? []) {
      const b = document.createElement('button');
      b.className = 'btn'; b.textContent = text;
      b.addEventListener('click', fn);
      acts.appendChild(b);
    }
    box.appendChild(el);
  });
}
$('recheck').addEventListener('click', () => void refresh());
const welcomeName = $<HTMLInputElement>('welcome-name');
const saveWelcome = async (): Promise<void> => {
  if (!welcomeName.value.trim()) return;
  await save({ name: welcomeName.value.trim() });
  $('welcome').hidden = true;
};
$('welcome-save').addEventListener('click', () => void saveWelcome());
welcomeName.addEventListener('keydown', (e) => { if (e.key === 'Enter') void saveWelcome(); });
if (new URLSearchParams(location.search).get('welcome') === '1') $('welcome').hidden = false;

// ---- state -----------------------------------------------------------------
function apply(s: PanelState): void {
  const first = !state;
  state = s;
  const st = s.settings;
  $('who').textContent = st.name;
  document.title = st.name;
  if (document.activeElement !== nameInput) nameInput.value = st.name;
  if (document.activeElement !== welcomeName && !welcomeName.value) welcomeName.value = st.name;
  scale.value = String(st.scale);
  $('scale-label').textContent = `${st.scale} px tall`;
  $<HTMLInputElement>('sprites').checked = st.sprites;
  $('model-label').textContent = s.customModel ? 'Using your own GLB.' : 'Using the bundled omni3 robot.';
  $<HTMLButtonElement>('model-reset').disabled = !s.customModel;
  for (const r of document.querySelectorAll<HTMLInputElement>('input[name=backend]')) r.checked = r.value === st.backend;
  $('row-model').style.display = st.backend === 'claude-code' ? '' : 'none';
  $('row-key').style.display = st.backend === 'api' ? '' : 'none';
  $<HTMLSelectElement>('claude-model').value = st.claudeModel;
  $('key-label').textContent = s.apiKeyFromEnv ? 'Using ANTHROPIC_API_KEY from the environment.' : s.hasApiKey ? 'A key is saved in your Keychain.' : 'No key saved.';
  $<HTMLButtonElement>('key-remove').disabled = !s.hasApiKey;
  $<HTMLInputElement>('web-search').checked = st.webSearch;
  if (document.activeElement !== shortcut) shortcut.value = st.shortcut;
  $('shortcut-label').textContent = `Active: ${s.shortcutLabel}. Use Electron accelerator names, e.g. Control+Alt+C.`;
  $<HTMLInputElement>('memory-on').checked = st.memory;
  $('version').textContent = s.version;
  renderFacts();
  renderSetup();
  if (first || s.conversation?.id !== conversationId) showConversation();
}

/** getState re-runs the setup checks (Claude Code sign-in, Screen Recording). */
async function refresh(): Promise<void> {
  apply(await panel.getState());
}
panel.onState(apply);
void refresh();
