// A pulsing ring with its label underneath (above when flipped), drawn where the helper points. Main positions the window
// and calls showMarker with executeJavaScript; there is no other IPC.

const wrap = document.getElementById('wrap')!;
const label = document.getElementById('label')!;

declare global {
  interface Window {
    showMarker(text: string, flip: boolean): void;
  }
}

window.showMarker = (text, flip) => {
  label.textContent = text;
  wrap.classList.toggle('flip', flip);
  // Restart the fade so a new spot is noticed even when the window just moved.
  wrap.classList.remove('on');
  requestAnimationFrame(() => wrap.classList.add('on'));
};

export {};
