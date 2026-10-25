import type { PickerBridge } from '@shared/bubble';
declare global { interface Window { picker: PickerBridge } }

const sel = document.getElementById('sel') as HTMLDivElement;
const size = document.getElementById('size') as HTMLDivElement;
const hint = document.getElementById('hint') as HTMLDivElement;
// The overlay covers the whole display; main tells us where the display starts.
const origin = await window.picker.getOrigin();
let start: { x: number; y: number } | null = null;

const rectOf = (e: MouseEvent) => {
  const x = Math.min(start!.x, e.clientX), y = Math.min(start!.y, e.clientY);
  return { x, y, w: Math.abs(e.clientX - start!.x), h: Math.abs(e.clientY - start!.y) };
};

document.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  start = { x: e.clientX, y: e.clientY };
  hint.style.display = 'none';
  sel.style.display = 'block';
  size.style.display = 'block';
  document.body.style.background = 'transparent';
});
document.addEventListener('mousemove', (e) => {
  if (!start) return;
  const r = rectOf(e);
  Object.assign(sel.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
  size.textContent = `${r.w} × ${r.h}`;
  Object.assign(size.style, { left: `${r.x}px`, top: `${r.y + r.h + 6}px` });
});
document.addEventListener('mouseup', (e) => {
  if (!start) return;
  const r = rectOf(e);
  start = null;
  if (r.w < 8 || r.h < 8) { window.picker.cancel(); return; }
  window.picker.done({ x: origin.x + r.x, y: origin.y + r.y, w: r.w, h: r.h });
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.picker.cancel(); });
