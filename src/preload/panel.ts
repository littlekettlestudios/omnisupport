import { contextBridge, ipcRenderer } from 'electron';
import type { ChatEvent, PanelBridge, PanelState, PanelTab } from '@shared/panel';
import { PANEL_IPC } from '@shared/panel';

const bridge: PanelBridge = {
  getState: () => ipcRenderer.invoke(PANEL_IPC.getState),
  saveSettings: (patch) => ipcRenderer.invoke(PANEL_IPC.saveSettings, patch),
  setApiKey: (key) => ipcRenderer.invoke(PANEL_IPC.setApiKey, key),
  addMemory: (text) => ipcRenderer.invoke(PANEL_IPC.addMemory, text),
  removeMemory: (id) => ipcRenderer.invoke(PANEL_IPC.removeMemory, id),
  clearMemories: () => ipcRenderer.invoke(PANEL_IPC.clearMemories),
  send: (text) => ipcRenderer.send(PANEL_IPC.send, text),
  newChat: () => ipcRenderer.send(PANEL_IPC.newChat),
  stop: () => ipcRenderer.send(PANEL_IPC.stop),
  chooseModel: () => ipcRenderer.invoke(PANEL_IPC.chooseModel),
  resetModel: () => ipcRenderer.invoke(PANEL_IPC.resetModel),
  chooseSprites: () => ipcRenderer.invoke(PANEL_IPC.chooseSprites),
  resetSprites: () => ipcRenderer.invoke(PANEL_IPC.resetSprites),
  openTerminal: () => ipcRenderer.send(PANEL_IPC.openTerminal),
  openScreenSettings: () => ipcRenderer.send(PANEL_IPC.openScreenSettings),
  openDataFolder: () => ipcRenderer.send(PANEL_IPC.openDataFolder),
  openUrl: (url) => ipcRenderer.send(PANEL_IPC.openUrl, url),
  onChat: (fn) => { ipcRenderer.on(PANEL_IPC.chat, (_e, ev: ChatEvent) => fn(ev)); },
  onState: (fn) => { ipcRenderer.on(PANEL_IPC.state, (_e, s: PanelState) => fn(s)); },
  onTab: (fn) => { ipcRenderer.on(PANEL_IPC.tab, (_e, tab: PanelTab) => fn(tab)); },
};
contextBridge.exposeInMainWorld('panel', bridge);
