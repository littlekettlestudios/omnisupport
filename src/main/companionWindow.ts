import { BrowserWindow, screen, ipcMain, systemPreferences, app } from 'electron';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { Command, CompanionConfig, FaceMood, RendererEvent } from '@shared/protocol';
import { IPC } from '@shared/protocol';
import { loadSettings, saveSettings } from './settings';

const here = import.meta.dirname;

export class CompanionWindow {
  private win: BrowserWindow | null = null;
  private listeners = new Set<(e: RendererEvent) => void>();
  /** Where the character stands, in canvas pixels (feet). */
  feet = { x: 0, y: 0 };

  create(): BrowserWindow {
    const display = screen.getPrimaryDisplay();
    const { x, y, width, height } = display.workArea;

    const win = new BrowserWindow({
      x,
      y,
      width,
      height,
      show: false,
      transparent: true,
      frame: false,
      hasShadow: false,
      alwaysOnTop: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      focusable: false,
      roundedCorners: false,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: join(here, '../preload/index.mjs'),
        contextIsolation: true,
        sandbox: false,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });

    // Float above everything, follow the user across Spaces, start click-through.
    win.setAlwaysOnTop(true, 'floating');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.setIgnoreMouseEvents(true, { forward: true });

    ipcMain.handle(IPC.getConfig, (): CompanionConfig => this.config(win));
    ipcMain.on(IPC.event, (ev, event: RendererEvent) => {
      if (ev.sender !== win.webContents) return;
      this.handleEvent(win, event);
    });

    win.webContents.on('console-message', (event) => {
      if (event.level === 'warning' || event.level === 'error') console.error('[renderer]', event.message);
    });
    win.once('ready-to-show', () => win.show());
    screen.on('display-metrics-changed', () => this.fitToWorkArea(win));
    this.pollCursor(win);

    if (process.env['ELECTRON_RENDERER_URL']) {
      void win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/companion/index.html`);
    } else {
      void win.loadFile(join(here, '../renderer/companion/index.html'));
    }

    this.win = win;
    return win;
  }

  send(cmd: Command): void {
    if (cmd.type === 'moveTo') this.feet = { x: cmd.x, y: cmd.y };
    this.win?.webContents.send(IPC.command, cmd);
  }

  /** Convert companion-canvas pixels to a screen point. */
  toScreen(p: { x: number; y: number }): { x: number; y: number } {
    const b = this.win?.getBounds() ?? { x: 0, y: 0 };
    return { x: p.x + b.x, y: p.y + b.y };
  }

  onEvent(fn: (e: RendererEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  get window(): BrowserWindow | null {
    return this.win;
  }

  /** Convert a screen point to companion-canvas pixels. */
  toCanvas(p: { x: number; y: number }): { x: number; y: number } {
    const b = this.win?.getBounds() ?? { x: 0, y: 0 };
    return { x: p.x - b.x, y: p.y - b.y };
  }

  private config(win: BrowserWindow): CompanionConfig {
    const s = loadSettings();
    const [width, height] = win.getContentSize();
    const home = s.home ?? { x: width - 140, y: height - 24 };
    this.feet = home;
    return {
      modelUrl: this.modelUrl(s.modelUrl),
      spritesUrl: s.sprites ? this.spritesUrl(s.spritePack) : null,
      faceUrls: this.faceUrls(),
      canvas: { width, height, dpr: screen.getPrimaryDisplay().scaleFactor },
      home,
      scale: s.scale,
      reducedMotion: systemPreferences.getAnimationSettings().prefersReducedMotion,
    };
  }

  /** Face textures in assets/face, keyed by mood (none are bundled; see pipeline/README.md). */
  faceUrls(): Partial<Record<FaceMood, string>> {
    const out: Partial<Record<FaceMood, string>> = {};
    for (const mood of ['idle', 'happy', 'thinking', 'sorry'] as const) {
      const p = join(app.getAppPath(), 'assets', 'face', `${mood}.png`);
      if (existsSync(p)) out[mood] = pathToFileURL(p).href;
    }
    return out;
  }

  /** User-chosen sprite pack, else the bundled Data Monster (then the omni3 pixel robot), or null if none is there. */
  spritesUrl(custom: string | null): string | null {
    if (custom) return custom;
    for (const pack of ['data-monster', 'omni3']) {
      const atlas = join(app.getAppPath(), 'assets', 'sprites', pack, 'atlas.json');
      if (existsSync(atlas)) return pathToFileURL(atlas).href;
    }
    return null;
  }

  /** Reload the renderer page; it reads its config again, so this switches between 3D and sprites. */
  reloadRenderer(): void {
    this.win?.webContents.reload();
  }

  /** User-chosen model, else the bundled omni3 robot (the renderer draws a procedural stand-in if that fails to load). */
  modelUrl(custom: string | null): string {
    return custom ?? pathToFileURL(join(app.getAppPath(), 'assets', 'omni3.glb')).href;
  }

  private handleEvent(win: BrowserWindow, event: RendererEvent): void {
    switch (event.type) {
      case 'hover':
        if (process.env['CLIPPET_DEBUG']) console.log('[clippet] hover', event.over, Date.now() % 100000);
        // Click-through everywhere except on the character body.
        win.setIgnoreMouseEvents(!event.over, { forward: true });
        break;
      case 'dragEnd': {
        this.feet = { x: event.x, y: event.y };
        const s = loadSettings();
        s.home = { x: event.x, y: event.y };
        saveSettings(s);
        break;
      }
      case 'error':
        console.error('[companion]', event.message);
        break;
    }
    for (const fn of this.listeners) fn(event);
  }

  /**
   * Forwarded mouse moves to a click-through window can stop arriving on macOS, which
   * leaves the character unclickable. Poll the cursor and let the renderer hit-test it.
   */
  private pollCursor(win: BrowserWindow): void {
    let last = '';
    const timer = setInterval(() => {
      if (win.isDestroyed()) { clearInterval(timer); return; }
      if (!win.isVisible()) return;
      const p = this.toCanvas(screen.getCursorScreenPoint());
      const key = `${p.x},${p.y}`;
      if (key === last) return;
      last = key;
      win.webContents.send(IPC.command, { type: 'cursor', x: p.x, y: p.y } satisfies Command);
    }, 50);
    win.on('closed', () => clearInterval(timer));
  }

  private fitToWorkArea(win: BrowserWindow): void {
    const { x, y, width, height } = screen.getPrimaryDisplay().workArea;
    const b = win.getBounds();
    if (b.x === x && b.y === y && b.width === width && b.height === height) return;
    win.setBounds({ x, y, width, height });
    win.webContents.send(IPC.command, { type: 'reload', modelUrl: this.config(win).modelUrl } satisfies Command);
  }
}
