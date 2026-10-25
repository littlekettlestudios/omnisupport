import { BrowserWindow, screen, ipcMain, systemPreferences, app } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Command, CompanionConfig, RendererEvent } from '@shared/protocol';
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
      modelUrl: pathToFileURL(join(app.getAppPath(), 'assets', 'placeholder.glb')).href,
      canvas: { width, height, dpr: screen.getPrimaryDisplay().scaleFactor },
      home,
      scale: s.scale,
      reducedMotion: systemPreferences.getAnimationSettings().prefersReducedMotion,
    };
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

  private fitToWorkArea(win: BrowserWindow): void {
    const { x, y, width, height } = screen.getPrimaryDisplay().workArea;
    const b = win.getBounds();
    if (b.x === x && b.y === y && b.width === width && b.height === height) return;
    win.setBounds({ x, y, width, height });
    win.webContents.send(IPC.command, { type: 'reload', modelUrl: this.config(win).modelUrl } satisfies Command);
  }
}
