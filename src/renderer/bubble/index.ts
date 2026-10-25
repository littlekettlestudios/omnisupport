import type { AgentEvent, BubbleAction, BubbleBridge } from '@shared/bubble';
declare global { interface Window { bubble: BubbleBridge } }

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const thumb = $<HTMLImageElement>('thumb');
const note = $<HTMLTextAreaElement>('note');
const hint = $('hint'), status = $('status'), answer = $('answer'), sources = $('sources'), error = $('error');
const message = $('message'), actions = $('actions');
const titleEl = document.querySelector('header .title') as HTMLElement;

let text = '';
let sent = false;
const seen = new Set<string>();

const STATUS: Record<string, string> = { thinking: 'Looking…', searching: 'Searching the web…', reading: 'Reading a page…', talking: '' };

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

/** Minimal markdown: numbered lists, **bold**, `code`, [links](url), paragraphs. */
function render(md: string): string {
  const lines = md.replace(/\s*\[mood:[^\]]*\]?\s*$/i, '').split('\n');
  let html = '', inList = false;
  const inline = (s: string): string =>
    escapeHtml(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
  for (const raw of lines) {
    const line = raw.trim();
    const m = /^(\d+)[.)]\s+(.*)$/.exec(line);
    if (m) { if (!inList) { html += '<ol>'; inList = true; } html += `<li>${inline(m[2])}</li>`; continue; }
    if (inList) { html += '</ol>'; inList = false; }
    if (line) html += `<p>${inline(line.replace(/^[-*]\s+/, '• '))}</p>`;
  }
  if (inList) html += '</ol>';
  return html;
}

function fit(): void {
  requestAnimationFrame(() => window.bubble.resize(document.body.scrollHeight));
}

function showActions(list: BubbleAction[] | undefined): void {
  actions.innerHTML = '';
  if (!list?.length) { actions.style.display = 'none'; return; }
  for (const a of list) {
    const b = document.createElement('button');
    b.textContent = a.label;
    if (a.primary) b.classList.add('primary');
    b.addEventListener('click', () => window.bubble.action(a.id));
    actions.appendChild(b);
  }
  actions.style.display = 'flex';
}

function reset(): void {
  text = ''; sent = false; seen.clear();
  note.value = ''; note.disabled = false;
  for (const el of [status, answer, sources, error, message, actions]) { el.style.display = 'none'; el.textContent = ''; }
}

window.bubble.onShow((p) => {
  reset();
  if (p.kind === 'lookup') {
    thumb.style.display = 'block'; thumb.src = p.thumbnail;
    note.style.display = 'block'; hint.style.display = 'block';
    titleEl.textContent = "What's up with this?";
    note.focus();
  } else {
    thumb.style.display = 'none'; note.style.display = 'none'; hint.style.display = 'none';
    titleEl.textContent = p.title;
    message.textContent = p.message; message.style.display = 'block';
    showActions(p.actions);
  }
  fit();
});

window.bubble.onAgent((ev: AgentEvent) => {
  switch (ev.type) {
    case 'status':
      status.textContent = STATUS[ev.status];
      status.style.display = ev.status === 'talking' ? 'none' : 'block';
      break;
    case 'delta':
      text += ev.text;
      answer.style.display = 'block';
      answer.innerHTML = render(text);
      break;
    case 'source': {
      if (seen.has(ev.url)) break;
      seen.add(ev.url);
      sources.style.display = 'block';
      const a = document.createElement('a');
      a.href = ev.url; a.textContent = ev.title || ev.url; a.title = ev.url;
      sources.appendChild(a);
      break;
    }
    case 'done':
      status.style.display = 'none';
      answer.style.display = 'block';
      answer.innerHTML = render(ev.text);
      titleEl.textContent = ev.mood === 'sorry' ? 'Hmm, sorry' : ev.mood === 'happy' ? 'Got it!' : 'Here is what I found';
      break;
    case 'error':
      status.style.display = 'none';
      error.style.display = 'block';
      error.textContent = ev.message;
      titleEl.textContent = 'Oops';
      showActions(ev.actions);
      break;
  }
  fit();
});

// Every link in the bubble opens in the default browser.
document.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest('a');
  if (a?.href) { e.preventDefault(); window.bubble.openUrl(a.href); }
});

function submit(): void {
  if (sent) return;
  sent = true;
  note.disabled = true;
  if (!note.value.trim()) note.style.display = 'none';
  hint.style.display = 'none';
  titleEl.textContent = 'Clippet';
  window.bubble.submit(note.value);
  fit();
}

note.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.bubble.close(); });
$('close').addEventListener('click', () => window.bubble.close());
new ResizeObserver(fit).observe(document.getElementById('card')!);
