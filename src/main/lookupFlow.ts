import { nativeImage, screen } from 'electron';
import type { CompanionWindow } from './companionWindow';
import type { BubbleWindow } from './bubbleWindow';
import type { Chat } from './chat';
import { pickRegion } from './picker';
import { captureRegion, CaptureError } from './capture';
import { loadSettings } from './settings';
import type { BubbleActionId, ScreenRect } from '@shared/bubble';

/**
 * The bubble interactions: "look at something" (pick a region, capture it, walk the
 * character over, ask for a note) and "chat" (click the character). Either way the
 * bubble's messages go to the shared Chat, and replies to its answers continue it.
 */
export class LookupFlow {
  private busy = false;
  /** Handles card actions (sign-in buttons, open chat) raised from the bubble. */
  onAction: ((id: BubbleActionId) => void) | null = null;

  constructor(private companion: CompanionWindow, private bubble: BubbleWindow, private chat: Chat) {}

  async start(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      this.bubble.hide();
      this.companion.send({ type: 'setState', state: 'attentive' });
      const rect = await pickRegion();
      if (!rect) { this.idle(); return; }

      // Give the overlay a moment to disappear before capturing.
      await new Promise((r) => setTimeout(r, 120));
      let png: Buffer;
      try {
        png = await captureRegion(rect);
      } catch (e) {
        this.showError(rect, e instanceof CaptureError ? e.message : String(e));
        return;
      }

      const stand = this.standPoint(rect);
      const center = this.companion.toCanvas({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 });
      this.companion.send({ type: 'moveTo', x: stand.x, y: stand.y, walk: true });
      this.companion.send({ type: 'lookAt', x: center.x, y: center.y });

      const thumbnail = nativeImage.createFromBuffer(png).resize({ width: 320 }).toDataURL();
      const settings = loadSettings();
      const head = this.companion.toScreen({ x: stand.x, y: stand.y - settings.scale * 0.9 });

      // A new region starts a new conversation; replies in the bubble continue it.
      let first = true;
      this.bubble.show({ kind: 'lookup', name: settings.name, thumbnail, rect }, head, {
        onAction: (id) => this.onAction?.(id),
        onSubmit: (text) => {
          if (first) {
            first = false;
            this.bubble.conversationId = this.chat.newConversation();
            void this.chat.send(text, png);
          } else void this.chat.send(text);
        },
        onClose: () => this.idle(),
      });
    } finally {
      this.busy = false;
    }
  }

  /** Open the bubble as a plain chat box above the character. */
  openChat(): void {
    if (this.busy) return;
    const settings = loadSettings();
    const head = this.companion.toScreen({ x: this.companion.feet.x, y: this.companion.feet.y - settings.scale * 0.9 });
    this.companion.send({ type: 'setState', state: 'attentive' });
    this.bubble.show({ kind: 'chat', name: settings.name }, head, {
      onAction: (id) => this.onAction?.(id),
      onSubmit: (text) => {
        this.bubble.conversationId = this.chat.resume();
        void this.chat.send(text);
      },
      onClose: () => this.idle(),
    });
  }

  private showError(rect: ScreenRect, message: string): void {
    const settings = loadSettings();
    const stand = this.standPoint(rect);
    const head = this.companion.toScreen({ x: stand.x, y: stand.y - settings.scale * 0.9 });
    this.bubble.show({ kind: 'card', title: 'Oops', message, actions: [{ id: 'dismiss', label: 'OK', primary: true }] }, head, { onAction: () => this.bubble.hide(), onClose: () => this.idle() });
    this.companion.send({ type: 'react', clip: 'sorry' });
    this.companion.send({ type: 'setState', state: 'idle' });
  }

  private idle(): void {
    // Closing the bubble stops an answer still streaming into it.
    if (this.bubble.conversationId && this.bubble.conversationId === this.chat.currentId) this.chat.stop();
    this.bubble.conversationId = null;
    this.companion.send({ type: 'lookAt', x: null, y: null });
    this.companion.send({ type: 'setState', state: 'idle' });
  }

  /** Where the character should stand: just outside the region's bottom-left or bottom-right corner, inside the work area. */
  private standPoint(rect: ScreenRect): { x: number; y: number } {
    const { workArea } = screen.getDisplayMatching({ x: rect.x, y: rect.y, width: rect.w, height: rect.h });
    const scale = loadSettings().scale;
    const margin = scale * 0.5;
    let x = rect.x - margin;
    if (x - margin < workArea.x) x = rect.x + rect.w + margin;
    x = Math.min(Math.max(workArea.x + margin, x), workArea.x + workArea.width - margin);
    let y = rect.y + rect.h + scale * 0.2;
    y = Math.min(Math.max(workArea.y + scale, y), workArea.y + workArea.height - 10);
    return this.companion.toCanvas({ x, y });
  }
}
