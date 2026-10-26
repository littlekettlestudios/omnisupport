import { BrowserWindow, ipcMain, screen, shell } from 'electron';
import { join } from 'node:path';
import type { AgentEvent, BubbleActionId, BubbleShow } from '@shared/bubble';
import { BUBBLE_IPC } from '@shared/bubble';

const here = import.meta.dirname;
const WIDTH = 352; // card 332 + 10px margin each side

export class BubbleWindow {
  private win: BrowserWindow | null = null;
  private onSubmit: ((note: string) => void) | null = null;
  private onClose: (() => void) | null = null;
  private onAction: ((id: BubbleActionId) => void) | null = null;
  private anchor = { x: 0, y: 0 };
  /** The Chat conversation this bubble is showing, so only its events reach it. */
  conversationId: string | null = null;

  private ensure(): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) return this.win;
    const win = new BrowserWindow({
      width: WIDTH,
      height: 260,
      show: false,
      transparent: true,
      frame: false,
      hasShadow: false,
      alwaysOnTop: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      backgroundColor: '#00000000',
      webPreferences: { preload: join(here, '../preload/bubble.mjs'), contextIsolation: true, sandbox: false },
    });
    win.setAlwaysOnTop(true, 'floating');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    const mine = (e: Electron.IpcMainEvent): boolean => e.sender === win.webContents;
    ipcMain.on(BUBBLE_IPC.submit, (e, note: string) => { if (mine(e)) this.onSubmit?.(String(note ?? '')); });
    ipcMain.on(BUBBLE_IPC.action, (e, id: BubbleActionId) => { if (mine(e)) this.onAction?.(id); });
    ipcMain.on(BUBBLE_IPC.close, (e) => { if (mine(e)) this.hide(); });
    ipcMain.on(BUBBLE_IPC.openUrl, (e, url: string) => {
      if (mine(e) && /^https?:\/\//i.test(url)) void shell.openExternal(url);
    });
    ipcMain.on(BUBBLE_IPC.resize, (e, height: number) => {
      if (!mine(e) || !Number.isFinite(height)) return;
      this.place(Math.min(Math.max(120, Math.ceil(height)), 700));
    });
    win.on('closed', () => { this.win = null; });

    if (process.env['ELECTRON_RENDERER_URL']) void win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/bubble/index.html`);
    else void win.loadFile(join(here, '../renderer/bubble/index.html'));
    this.win = win;
    return win;
  }

  /** Show next to a screen point (the character's head). */
  show(
    payload: BubbleShow,
    anchor: { x: number; y: number },
    handlers: { onSubmit?: (note: string) => void; onClose?: () => void; onAction?: (id: BubbleActionId) => void },
  ): void {
    this.anchor = anchor;
    this.conversationId = null;
    this.onSubmit = handlers.onSubmit ?? null;
    this.onClose = handlers.onClose ?? null;
    this.onAction = handlers.onAction ?? null;
    const win = this.ensure();
    const send = (): void => {
      win.webContents.send(BUBBLE_IPC.show, payload);
      this.place(200);
      win.show();
      if (payload.kind !== 'card') win.focus();
    };
    if (win.webContents.isLoading()) win.webContents.once('did-finish-load', send);
    else send();
  }

  agent(ev: AgentEvent): void {
    this.win?.webContents.send(BUBBLE_IPC.agent, ev);
  }

  hide(): void {
    if (!this.win || this.win.isDestroyed() || !this.win.isVisible()) return;
    this.win.hide();
    const cb = this.onClose;
    this.onClose = null;
    this.onSubmit = null;
    this.onAction = null;
    cb?.();
  }

  get visible(): boolean {
    return !!this.win && !this.win.isDestroyed() && this.win.isVisible();
  }

  /** Keep the bubble beside the anchor and inside the work area. */
  private place(height: number): void {
    if (!this.win) return;
    const { workArea } = screen.getDisplayNearestPoint(this.anchor);
    let x = this.anchor.x - WIDTH - 8; // prefer left of the character
    if (x < workArea.x) x = this.anchor.x + 8;
    x = Math.min(Math.max(workArea.x, x), workArea.x + workArea.width - WIDTH);
    let y = this.anchor.y - height + 40; // bottom of the bubble near the head
    y = Math.min(Math.max(workArea.y, y), workArea.y + workArea.height - height);
    this.win.setBounds({ x: Math.round(x), y: Math.round(y), width: WIDTH, height: Math.round(height) });
  }
}
