// Contract between main and the speech-bubble / picker windows.

export interface ScreenRect { x: number; y: number; w: number; h: number }

export type AgentStatus = 'thinking' | 'searching' | 'reading' | 'talking';
export type Mood = 'happy' | 'neutral' | 'sorry';

export type BubbleActionId = 'open-terminal' | 'check-again' | 'dismiss' | 'open-chat' | 'open-setup';
export interface BubbleAction { id: BubbleActionId; label: string; primary?: boolean }

export type AgentEvent =
  | { type: 'status'; status: AgentStatus }
  | { type: 'delta'; text: string }
  | { type: 'source'; url: string; title: string }
  | { type: 'done'; mood: Mood; text: string; remembered?: string[]; renamed?: string }
  | { type: 'error'; message: string; actions?: BubbleAction[] };

export type BubbleShow =
  /** A captured screenshot to ask about; screen is true for a whole-screen glance. */
  | { kind: 'lookup'; name: string; thumbnail: string; rect: ScreenRect; screen?: boolean }
  /** Text-only chat, opened by clicking the character. */
  | { kind: 'chat'; name: string }
  | { kind: 'card'; title: string; message: string; actions: BubbleAction[]; tone?: 'info' | 'success' };

export interface BubbleBridge {
  onShow(fn: (p: BubbleShow) => void): void;
  onAgent(fn: (e: AgentEvent) => void): void;
  submit(note: string): void;
  action(id: BubbleActionId): void;
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
  action: 'bubble:action',
  close: 'bubble:close',
  openUrl: 'bubble:openUrl',
  resize: 'bubble:resize',
} as const;

export const PICKER_IPC = { done: 'picker:done', cancel: 'picker:cancel', origin: 'picker:origin' } as const;
