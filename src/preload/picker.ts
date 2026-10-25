import { contextBridge, ipcRenderer } from 'electron';
import type { PickerBridge, ScreenRect } from '@shared/bubble';
import { PICKER_IPC } from '@shared/bubble';

const bridge: PickerBridge = {
  done: (rect: ScreenRect) => ipcRenderer.send(PICKER_IPC.done, rect),
  cancel: () => ipcRenderer.send(PICKER_IPC.cancel),
  getOrigin: () => ipcRenderer.invoke(PICKER_IPC.origin),
};
contextBridge.exposeInMainWorld('picker', bridge);
