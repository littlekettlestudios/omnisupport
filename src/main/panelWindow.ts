import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { join } from 'node:path';
import type { ChatEvent, PanelSettings, PanelState, PanelTab } from '@shared/panel';
import { PANEL_IPC } from '@shared/panel';
import type { Chat } from './chat';
import { addMemory, clearMemories, removeMemory } from './memory';
import { loadSettings } from './settings';

const here = import.meta.dirname;

/** What the panel needs from the rest of the app. */
export interface PanelHost {
  state(recheck?: boolean): Promise<PanelState>;
  saveSettings(patch: Partial<PanelSettings>): void;
  setApiKey(key: string | null): void;
  chooseModel(): Promise<void>;
  resetModel(): void;
  chooseSprites(): Promise<void>;
  resetSprites(): void;
  openTerminal(): void;
}

/**
 * The panel: an ordinary window with Chat, Memory, Settings and Setup tabs. While it is
 * open the app shows a Dock icon so it can be found with ⌘Tab.
 */
export class PanelWindow {
  private win: BrowserWindow | null = null;

  get isOpen(): boolean { return !!this.win && !this.win.isDestroyed(); }

  constructor(private host: PanelHost, private chat: Chat) {
    const mine = (e: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): boolean => !!this.win && e.sender === this.win.webContents;
    const handle = (channel: string, fn: (...args: never[]) => unknown): void => {
      ipcMain.handle(channel, async (e, ...args) => {
        if (!mine(e)) throw new Error('not the panel');
        await fn(...(args as never[]));
        return this.host.state();
      });
    };
    ipcMain.handle(PANEL_IPC.getState, (e) => { if (!mine(e)) throw new Error('not the panel'); return this.host.state(true); });
    handle(PANEL_IPC.saveSettings, (patch: Partial<PanelSettings>) => this.host.saveSettings(patch));
    handle(PANEL_IPC.setApiKey, (key: string | null) => this.host.setApiKey(typeof key === 'string' && key.trim() ? key.trim() : null));
    handle(PANEL_IPC.addMemory, (text: string) => addMemory(String(text ?? '')));
    handle(PANEL_IPC.removeMemory, (id: string) => removeMemory(String(id)));
    handle(PANEL_IPC.clearMemories, () => clearMemories());
    handle(PANEL_IPC.chooseModel, () => this.host.chooseModel());
    handle(PANEL_IPC.resetModel, () => this.host.resetModel());
    handle(PANEL_IPC.chooseSprites, () => this.host.chooseSprites());
    handle(PANEL_IPC.resetSprites, () => this.host.resetSprites());
    ipcMain.on(PANEL_IPC.send, (e, text: string) => { if (mine(e) && String(text ?? '').trim()) void this.chat.send(String(text)); });
    ipcMain.on(PANEL_IPC.newChat, (e) => { if (mine(e)) this.chat.newConversation(); });
    ipcMain.on(PANEL_IPC.stop, (e) => { if (mine(e)) this.chat.stop(); });
    ipcMain.on(PANEL_IPC.openTerminal, (e) => { if (mine(e)) this.host.openTerminal(); });
    ipcMain.on(PANEL_IPC.openScreenSettings, (e) => {
      if (mine(e)) void shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
    });
    ipcMain.on(PANEL_IPC.openDataFolder, (e) => { if (mine(e)) void shell.openPath(app.getPath('userData')); });
    ipcMain.on(PANEL_IPC.openUrl, (e, url: string) => { if (mine(e) && /^https?:\/\//i.test(url)) void shell.openExternal(url); });
  }

  /** Open (or focus) the panel on a tab; welcome adds the first-run naming card to Setup. */
  show(tab: PanelTab = 'chat', welcome = false): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.webContents.send(PANEL_IPC.tab, tab);
      app.focus({ steal: true });
      this.win.show();
      this.win.focus();
      return;
    }
    const win = new BrowserWindow({
      width: 760,
      height: 600,
      minWidth: 560,
      minHeight: 440,
      show: false,
      title: 'Omni Support',
      titleBarStyle: 'hiddenInset',
      backgroundColor: '#00000000',
      vibrancy: 'sidebar',
      webPreferences: { preload: join(here, '../preload/panel.mjs'), contextIsolation: true, sandbox: false },
    });
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
      return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (e) => e.preventDefault());
    win.once('ready-to-show', () => {
      win.webContents.send(PANEL_IPC.tab, tab);
      // A menu-bar app is never active on its own; without this the panel opens behind.
      app.focus({ steal: true });
      win.show();
      win.focus();
    });
    win.on('closed', () => {
      this.win = null;
      if (process.platform === 'darwin' && !loadSettings().dock) app.dock?.hide();
    });
    if (process.platform === 'darwin') void app.dock?.show();

    const query: Record<string, string> = welcome ? { tab, welcome: '1' } : { tab };
    if (process.env['ELECTRON_RENDERER_URL']) void win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/panel/index.html?${new URLSearchParams(query)}`);
    else void win.loadFile(join(here, '../renderer/panel/index.html'), { query });
    this.win = win;
  }

  chatEvent(e: ChatEvent): void {
    this.win?.webContents.send(PANEL_IPC.chat, e);
  }

  /** Push fresh state, e.g. after a reply added a memory or renamed the helper. */
  async refresh(): Promise<void> {
    if (!this.win || this.win.isDestroyed()) return;
    this.win.webContents.send(PANEL_IPC.state, await this.host.state());
  }
}
