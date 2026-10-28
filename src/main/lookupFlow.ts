import { nativeImage, screen } from 'electron';
import type { CompanionWindow } from './companionWindow';
import type { BubbleWindow } from './bubbleWindow';
import type { Chat } from './chat';
import { pickRegion } from './picker';
import { captureShot, CaptureError } from './capture';
import type { Shot } from './capture';
import type { Pointer } from './pointer';
import { loadSettings } from './settings';
import type { BubbleActionId, ScreenRect } from '@shared/bubble';

/**
 * The bubble interactions: "look at something" (pick a region, capture it, walk the
 * character over, ask for a note), "glance" (capture the whole screen the cursor is on)
 * and "chat" (click the character). Either way the bubble's messages go to the shared
 * Chat, replies to its answers continue it, and the Pointer walks the character to
 * whatever the answer points at.
 */
export class LookupFlow {
  private busy = false;
  /** Handles card actions (sign-in buttons, open chat) raised from the bubble. */
  onAction: ((id: BubbleActionId) => void) | null = null;

  constructor(private companion: CompanionWindow, private bubble: BubbleWindow, private chat: Chat, private pointer: Pointer) {
    pointer.onMove = (head, side) => { if (this.bubble.visible) this.bubble.moveAnchor(head, side); };
  }

  async start(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      this.bubble.hide();
      this.pointer.clear(false);
      this.companion.send({ type: 'setState', state: 'attentive' });
      const rect = await pickRegion();
      if (!rect) { this.idle(); return; }

      // Give the overlay a moment to disappear before capturing.
      await new Promise((r) => setTimeout(r, 120));
      let shot: Shot;
      try {
        shot = await captureShot(rect, 'region');
      } catch (e) {
        this.showError(this.standPoint(rect), e instanceof CaptureError ? e.message : String(e));
        return;
      }

      const stand = this.standPoint(rect);
      const center = this.companion.toCanvas({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 });
      this.companion.send({ type: 'moveTo', x: stand.x, y: stand.y, walk: true });
      this.companion.send({ type: 'lookAt', x: center.x, y: center.y });

      const head = this.companion.toScreen({ x: stand.x, y: stand.y - loadSettings().scale * 0.9 });
      this.ask(shot, head);
    } finally {
      this.busy = false;
    }
  }

  /** Capture the whole display under the cursor, no dragging, and ask what the user needs. */
  async glance(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      this.bubble.hide();
      this.pointer.clear(false);
      this.companion.send({ type: 'setState', state: 'attentive' });
      const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
      const { x, y, width, height } = display.bounds;
      // Let the bubble finish hiding so it is not in the shot.
      await new Promise((r) => setTimeout(r, 120));
      let shot: Shot;
      try {
        shot = await captureShot({ x, y, w: width, h: height }, 'screen');
      } catch (e) {
        this.showError(this.companion.feet, e instanceof CaptureError ? e.message : String(e));
        return;
      }
      const f = this.companion.feet;
      this.ask(shot, this.companion.toScreen({ x: f.x, y: f.y - loadSettings().scale * 0.9 }));
    } finally {
      this.busy = false;
    }
  }

  /** Show the shot in the bubble with a note box. A new shot starts a new conversation; replies continue it. */
  private ask(shot: Shot, head: { x: number; y: number }): void {
    const thumbnail = nativeImage.createFromBuffer(shot.png).resize({ width: 320 }).toDataURL();
    let first = true;
    this.bubble.show({ kind: 'lookup', name: loadSettings().name, thumbnail, rect: shot.frame.rect, screen: shot.frame.kind === 'screen' }, head, {
      onAction: (id) => this.onAction?.(id),
      onSubmit: (text) => {
        if (first) {
          first = false;
          this.bubble.conversationId = this.chat.newConversation();
          void this.chat.send(text, shot);
        } else void this.chat.send(text);
      },
      onClose: () => this.idle(),
    });
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

  /** An error card above the character standing at stand (canvas pixels). */
  private showError(stand: { x: number; y: number }, message: string): void {
    const settings = loadSettings();
    const head = this.companion.toScreen({ x: stand.x, y: stand.y - settings.scale * 0.9 });
    this.bubble.show({ kind: 'card', title: 'Oops', message, actions: [{ id: 'dismiss', label: 'OK', primary: true }] }, head, { onAction: () => this.bubble.hide(), onClose: () => this.idle() });
    this.companion.send({ type: 'react', clip: 'sorry' });
    this.companion.send({ type: 'setState', state: 'idle' });
  }

  private idle(): void {
    // Closing the bubble stops an answer still streaming into it.
    if (this.bubble.conversationId && this.bubble.conversationId === this.chat.currentId) this.chat.stop();
    this.bubble.conversationId = null;
    this.pointer.clear(true);
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
