// The small markdown subset answers use, rendered to HTML for the bubble and the chat window.
import { stripTags } from './tags';

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

/** Numbered lists, **bold**, `code`, [links](url), paragraphs. Control tags are hidden. */
export function renderMarkdown(md: string): string {
  const lines = stripTags(md).split('\n');
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
