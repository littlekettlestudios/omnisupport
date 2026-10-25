import { BrowserWindow, ipcMain, screen } from 'electron';
import { join } from 'node:path';
import type { ScreenRect } from '@shared/bubble';
import { PICKER_IPC } from '@shared/bubble';

const here = import.meta.dirname;

/** Full-display overlay where the user drags a rectangle. Resolves null on cancel. */
export function pickRegion(): Promise<ScreenRect | null> {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { x, y, width, height } = display.bounds;

  const win = new BrowserWindow({
    x, y, width, height,
    show: false,
    transparent: true,
    frame: false,
    hasShadow: false,
    alwaysOnTop: true,
    resizable: false,
    movable: false,
    fullscreenable: false,
    skipTaskbar: true,
    enableLargerThanScreen: true,
    backgroundColor: '#00000000',
    webPreferences: { preload: join(here, '../preload/picker.mjs'), contextIsolation: true, sandbox: false },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  return new Promise((resolve) => {
    let settled = false;
    const finish = (rect: ScreenRect | null): void => {
      if (settled) return;
      settled = true;
      ipcMain.removeHandler(PICKER_IPC.origin);
      ipcMain.removeListener(PICKER_IPC.done, onDone);
      ipcMain.removeListener(PICKER_IPC.cancel, onCancel);
      win.close();
      resolve(rect);
    };
    const onDone = (_e: Electron.IpcMainEvent, rect: ScreenRect): void => finish(rect);
    const onCancel = (): void => finish(null);
    ipcMain.handle(PICKER_IPC.origin, () => ({ x, y }));
    ipcMain.on(PICKER_IPC.done, onDone);
    ipcMain.on(PICKER_IPC.cancel, onCancel);
    win.on('closed', () => finish(null));
    win.once('ready-to-show', () => { win.show(); win.focus(); });

    if (process.env['ELECTRON_RENDERER_URL']) void win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/picker/index.html`);
    else void win.loadFile(join(here, '../renderer/picker/index.html'));
  });
}
