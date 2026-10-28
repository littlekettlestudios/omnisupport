import type { AgentEvent, BubbleAction, BubbleBridge } from '@shared/bubble';
import { renderMarkdown as render } from '@shared/markdown';
declare global { interface Window { bubble: BubbleBridge } }

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const thumb = $<HTMLImageElement>('thumb');
const note = $<HTMLTextAreaElement>('note');
const reply = $<HTMLTextAreaElement>('reply');
const hint = $('hint'), status = $('status'), answer = $('answer'), sources = $('sources'), error = $('error');
const message = $('message'), actions = $('actions'), you = $('you'), memo = $('memo'), footer = $('footer');
const titleEl = document.querySelector('header .title') as HTMLElement;

let text = '';
let sent = false;
let name = 'Omni';
const seen = new Set<string>();

const STATUS: Record<string, string> = { thinking: 'Looking…', searching: 'Searching the web…', reading: 'Reading a page…', talking: '' };

function fit(): void {
  requestAnimationFrame(() => window.bubble.resize(document.body.scrollHeight));
}

const show = (el: HTMLElement, on: boolean, display = 'block'): void => { el.style.display = on ? display : 'none'; };

function showActions(list: BubbleAction[] | undefined): void {
  actions.innerHTML = '';
  if (!list?.length) { show(actions, false); return; }
  for (const a of list) {
    const b = document.createElement('button');
    b.textContent = a.label;
    if (a.primary) b.classList.add('primary');
    b.addEventListener('click', () => window.bubble.action(a.id));
    actions.appendChild(b);
  }
  show(actions, true, 'flex');
}

/** Clear the answer area for the next reply. */
function clearAnswer(): void {
  text = ''; seen.clear();
  for (const el of [status, answer, sources, error, memo, actions]) { show(el, false); el.textContent = ''; }
  show(reply, false); show(footer, false);
}

function reset(): void {
  clearAnswer();
  sent = false;
  note.value = ''; note.disabled = false; reply.value = '';
  for (const el of [message, you]) { show(el, false); el.textContent = ''; }
}

/** After an answer (or an error in a conversation), offer a reply box. */
function offerReply(): void {
  show(reply, true); show(footer, true, 'flex');
  reply.disabled = false;
  reply.focus();
}

window.bubble.onShow((p) => {
  reset();
  if (p.kind === 'card') {
    show(thumb, false); show(note, false); show(hint, false);
    titleEl.textContent = p.title;
    message.textContent = p.message; show(message, true);
    showActions(p.actions);
  } else {
    name = p.name;
    show(note, true); show(hint, true);
    if (p.kind === 'lookup') {
      thumb.src = p.thumbnail; show(thumb, true);
      titleEl.textContent = p.screen ? 'What can I help with?' : "What's up with this?";
      note.placeholder = 'Add a note, or press Enter to just look';
      hint.textContent = `${p.screen ? 'This screen is sent' : 'Only this region is sent'}. Enter to send · Esc to close`;
    } else {
      show(thumb, false);
      titleEl.textContent = `Hi, I'm ${name}`;
      note.placeholder = 'Ask me anything';
      hint.textContent = 'Enter to send · Esc to close';
    }
    note.focus();
  }
  fit();
});

window.bubble.onAgent((ev: AgentEvent) => {
  switch (ev.type) {
    case 'status':
      status.textContent = STATUS[ev.status];
      show(status, ev.status !== 'talking');
      break;
    case 'delta':
      text += ev.text;
      show(answer, true);
      answer.innerHTML = render(text);
      break;
    case 'source': {
      if (seen.has(ev.url)) break;
      seen.add(ev.url);
      show(sources, true);
      const a = document.createElement('a');
      a.href = ev.url; a.textContent = ev.title || ev.url; a.title = ev.url;
      sources.appendChild(a);
      break;
    }
    case 'done': {
      show(status, false);
      show(answer, true);
      answer.innerHTML = render(ev.text);
      if (ev.renamed) name = ev.renamed;
      titleEl.textContent = ev.mood === 'sorry' ? 'Hmm, sorry' : ev.mood === 'happy' ? 'Got it!' : name;
      const notes = [
        ev.renamed ? `New name saved: ${ev.renamed}` : null,
        ...(ev.remembered ?? []).map((f) => `Remembered: ${f}`),
      ].filter(Boolean) as string[];
      memo.textContent = notes.join('\n'); show(memo, notes.length > 0);
      memo.style.whiteSpace = 'pre-wrap';
      offerReply();
      break;
    }
    case 'error':
      show(status, false);
      show(error, true);
      error.textContent = ev.message;
      titleEl.textContent = 'Oops';
      showActions(ev.actions);
      if (sent) offerReply();
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
  if (!note.value.trim()) show(note, false);
  show(hint, false);
  titleEl.textContent = name;
  window.bubble.submit(note.value);
  fit();
}

function sendReply(): void {
  const value = reply.value.trim();
  if (!value) return;
  clearAnswer();
  // The first note and thumbnail stay as context; the latest reply shows above the answer.
  show(thumb, false); show(note, false);
  you.textContent = value; show(you, true);
  titleEl.textContent = name;
  reply.value = '';
  window.bubble.submit(value);
  fit();
}

const onEnter = (fn: () => void) => (e: KeyboardEvent): void => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); fn(); }
};
note.addEventListener('keydown', onEnter(submit));
reply.addEventListener('keydown', onEnter(sendReply));
reply.addEventListener('input', () => { reply.style.height = 'auto'; reply.style.height = `${Math.min(reply.scrollHeight, 120)}px`; fit(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.bubble.close(); });
$('close').addEventListener('click', () => window.bubble.close());
$('open-chat').addEventListener('click', (e) => { e.preventDefault(); window.bubble.action('open-chat'); });
new ResizeObserver(fit).observe(document.getElementById('card')!);
