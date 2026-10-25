// Shared contract between the Electron main process and the companion renderer.
// Keep in sync with docs/companion-protocol.md.

export interface CompanionConfig {
  modelUrl: string;
  canvas: { width: number; height: number; dpr: number };
  home: { x: number; y: number };
  scale: number;
  reducedMotion: boolean;
}

export type CompanionState =
  | 'idle'
  | 'attentive'
  | 'thinking'
  | 'searching'
  | 'talking'
  | 'sleeping';

export type ReactionClip = 'wave' | 'point' | 'happy' | 'sorry' | 'excited' | 'nod';

export type Command =
  | { type: 'setState'; state: CompanionState }
  | { type: 'moveTo'; x: number; y: number; walk: boolean }
  | { type: 'lookAt'; x: number | null; y: number | null }
  | { type: 'react'; clip: ReactionClip }
  | { type: 'setVisible'; visible: boolean }
  | { type: 'setScale'; scale: number }
  | { type: 'reload'; modelUrl: string };

export type RendererEvent =
  | { type: 'ready'; hasRig: boolean; clips: string[] }
  | { type: 'hover'; over: boolean }
  | { type: 'click' }
  | { type: 'dragEnd'; x: number; y: number }
  | { type: 'arrived'; x: number; y: number }
  | { type: 'error'; message: string };

export interface ClippetBridge {
  onCommand(handler: (cmd: Command) => void): () => void;
  send(event: RendererEvent): void;
  getConfig(): Promise<CompanionConfig>;
}

export const IPC = {
  command: 'clippet:command',
  event: 'clippet:event',
  getConfig: 'clippet:getConfig',
} as const;
