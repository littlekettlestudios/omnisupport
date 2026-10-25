import { contextBridge, ipcRenderer } from 'electron';
import type { AgentEvent, BubbleBridge, BubbleShow } from '@shared/bubble';
import { BUBBLE_IPC } from '@shared/bubble';

const bridge: BubbleBridge = {
  onShow: (fn) => { ipcRenderer.on(BUBBLE_IPC.show, (_e, p: BubbleShow) => fn(p)); },
  onAgent: (fn) => { ipcRenderer.on(BUBBLE_IPC.agent, (_e, ev: AgentEvent) => fn(ev)); },
  submit: (note) => ipcRenderer.send(BUBBLE_IPC.submit, note),
  action: (id) => ipcRenderer.send(BUBBLE_IPC.action, id),
  close: () => ipcRenderer.send(BUBBLE_IPC.close),
  openUrl: (url) => ipcRenderer.send(BUBBLE_IPC.openUrl, url),
  resize: (height) => ipcRenderer.send(BUBBLE_IPC.resize, height),
};
contextBridge.exposeInMainWorld('bubble', bridge);
