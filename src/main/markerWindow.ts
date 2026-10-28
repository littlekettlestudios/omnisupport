import { BrowserWindow, screen } from 'electron';
import { join } from 'node:path';

const here = import.meta.dirname;
const WIDTH = 240;
const HEIGHT = 88;
/** Centre of the ring from the window's near edge: padding 4 + half the 48px ring. */
const RING = 28;

/**
 * The ring that marks the exact spot the helper is pointing at. A small transparent,
 * click-through window of its own, so it works on any display and needs nothing from
 * the character renderer.
 */
export class MarkerWindow {
  private win: BrowserWindow | null = null;
  private ready: Promise<void> | null = null;

  private ensure(): { win: BrowserWindow; ready: Promise<void> } {
    if (this.win && !this.win.isDestroyed() && this.ready) return { win: this.win, ready: this.ready };
    const win = new BrowserWindow({
      width: WIDTH,
      height: HEIGHT,
      show: false,
      transparent: true,
      frame: false,
      hasShadow: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      focusable: false,
      backgroundColor: '#00000000',
      webPreferences: { contextIsolation: true, sandbox: true },
    });
    // Above the companion and the bubble, and never in the way of a click.
    win.setAlwaysOnTop(true, 'pop-up-menu');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.setIgnoreMouseEvents(true);
    win.on('closed', () => { this.win = null; this.ready = null; });

    this.ready = (process.env['ELECTRON_RENDERER_URL']
      ? win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/marker/index.html`)
      : win.loadFile(join(here, '../renderer/marker/index.html'))).catch((e: Error) => console.error('[marker]', e.message));
    this.win = win;
    return { win, ready: this.ready };
  }

  /** Ring the screen point, with the label below it, or above it near the bottom of the screen. */
  async show(p: { x: number; y: number }, label: string): Promise<void> {
    const { win, ready } = this.ensure();
    await ready;
    if (win.isDestroyed()) return;
    const { bounds } = screen.getDisplayNearestPoint({ x: Math.round(p.x), y: Math.round(p.y) });
    const flip = p.y + HEIGHT - RING > bounds.y + bounds.height;
    const y = flip ? p.y - HEIGHT + RING : p.y - RING;
    win.setBounds({ x: Math.round(p.x - WIDTH / 2), y: Math.round(y), width: WIDTH, height: HEIGHT });
    await win.webContents.executeJavaScript(`window.showMarker(${JSON.stringify(label)}, ${flip})`);
    win.showInactive();
  }

  hide(): void {
    if (!this.win || this.win.isDestroyed() || !this.win.isVisible()) return;
    this.win.hide();
  }
}
