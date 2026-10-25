// Contract between main and the speech-bubble / picker windows.

export interface ScreenRect { x: number; y: number; w: number; h: number }

export type AgentStatus = 'thinking' | 'searching' | 'reading' | 'talking';
export type Mood = 'happy' | 'neutral' | 'sorry';

export type AgentEvent =
  | { type: 'status'; status: AgentStatus }
  | { type: 'delta'; text: string }
  | { type: 'source'; url: string; title: string }
  | { type: 'done'; mood: Mood; text: string }
  | { type: 'error'; message: string };

export interface BubbleShow { thumbnail: string; rect: ScreenRect }

export interface BubbleBridge {
  onShow(fn: (p: BubbleShow) => void): void;
  onAgent(fn: (e: AgentEvent) => void): void;
  submit(note: string): void;
  close(): void;
  openUrl(url: string): void;
  resize(height: number): void;
}

export interface PickerBridge {
  done(rect: ScreenRect): void;
  cancel(): void;
  getOrigin(): Promise<{ x: number; y: number }>;
}

export const BUBBLE_IPC = {
  show: 'bubble:show',
  agent: 'bubble:agent',
  submit: 'bubble:submit',
  close: 'bubble:close',
  openUrl: 'bubble:openUrl',
  resize: 'bubble:resize',
} as const;

export const PICKER_IPC = { done: 'picker:done', cancel: 'picker:cancel', origin: 'picker:origin' } as const;
