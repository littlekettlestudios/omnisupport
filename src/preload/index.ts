import { contextBridge, ipcRenderer } from 'electron';
import type { ClippetBridge, Command, CompanionConfig, RendererEvent } from '@shared/protocol';
import { IPC } from '@shared/protocol';

const bridge: ClippetBridge = {
  onCommand(handler) {
    const listener = (_e: Electron.IpcRendererEvent, cmd: Command): void => handler(cmd);
    ipcRenderer.on(IPC.command, listener);
    return () => ipcRenderer.removeListener(IPC.command, listener);
  },
  send(event: RendererEvent) {
    ipcRenderer.send(IPC.event, event);
  },
  getConfig(): Promise<CompanionConfig> {
    return ipcRenderer.invoke(IPC.getConfig);
  },
};

contextBridge.exposeInMainWorld('clippet', bridge);
