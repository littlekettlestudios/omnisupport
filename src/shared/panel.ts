// Contract between main and the panel window (Chat, Memory, Settings, Setup tabs).
import type { AgentEvent } from './bubble';

export interface MemoryFact { id: string; text: string; at: string }

/** One message in a conversation as the windows show it. */
export interface TurnView {
  role: 'user' | 'assistant';
  text: string;
  /** data: URL thumbnail of the screen region the turn was about. */
  image?: string;
  sources?: { url: string; title: string }[];
  error?: boolean;
}

export interface ConversationView { id: string; turns: TurnView[]; busy: boolean }

/** A conversation event: a new user turn, or the streamed reply. */
export type ChatEvent = { conversationId: string } & ({ type: 'turn'; turn: TurnView } | { type: 'new' } | AgentEvent);

/** Settings the panel can change. The API key is write-only: the panel only learns whether one is set. */
export interface PanelSettings {
  name: string;
  backend: 'claude-code' | 'api';
  claudeModel: string;
  webSearch: boolean;
  scale: number;
  shortcut: string;
  glanceShortcut: string;
  sprites: boolean;
  memory: boolean;
  dock: boolean;
}

export type SetupCheck = 'ok' | 'missing' | 'signed-out' | 'denied' | 'unknown' | 'not-needed';

export interface PanelState {
  settings: PanelSettings;
  hasApiKey: boolean;
  apiKeyFromEnv: boolean;
  customModel: boolean;
  customSprites: boolean;
  memories: MemoryFact[];
  conversation: ConversationView | null;
  /** Shortcut actually registered, as macOS glyphs. */
  shortcutLabel: string;
  /** Glance shortcut as macOS glyphs, or '' when it could not be registered. */
  glanceShortcutLabel: string;
  setup: { claudeCode: SetupCheck; screen: SetupCheck; apiKey: SetupCheck };
  dataFolder: string;
  version: string;
}

export type PanelTab = 'chat' | 'memory' | 'settings' | 'setup';

export interface PanelBridge {
  getState(): Promise<PanelState>;
  saveSettings(patch: Partial<PanelSettings>): Promise<PanelState>;
  setApiKey(key: string | null): Promise<PanelState>;
  addMemory(text: string): Promise<PanelState>;
  removeMemory(id: string): Promise<PanelState>;
  clearMemories(): Promise<PanelState>;
  send(text: string): void;
  newChat(): void;
  stop(): void;
  chooseModel(): Promise<PanelState>;
  resetModel(): Promise<PanelState>;
  chooseSprites(): Promise<PanelState>;
  resetSprites(): Promise<PanelState>;
  openTerminal(): void;
  openScreenSettings(): void;
  openDataFolder(): void;
  openUrl(url: string): void;
  onChat(fn: (e: ChatEvent) => void): void;
  onState(fn: (s: PanelState) => void): void;
  onTab(fn: (tab: PanelTab) => void): void;
}

export const PANEL_IPC = {
  getState: 'panel:getState',
  saveSettings: 'panel:saveSettings',
  setApiKey: 'panel:setApiKey',
  addMemory: 'panel:addMemory',
  removeMemory: 'panel:removeMemory',
  clearMemories: 'panel:clearMemories',
  send: 'panel:send',
  newChat: 'panel:newChat',
  stop: 'panel:stop',
  chooseModel: 'panel:chooseModel',
  resetModel: 'panel:resetModel',
  chooseSprites: 'panel:chooseSprites',
  resetSprites: 'panel:resetSprites',
  openTerminal: 'panel:openTerminal',
  openScreenSettings: 'panel:openScreenSettings',
  openDataFolder: 'panel:openDataFolder',
  openUrl: 'panel:openUrl',
  chat: 'panel:chat',
  state: 'panel:state',
  tab: 'panel:tab',
} as const;
