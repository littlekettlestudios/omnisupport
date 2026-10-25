import { nativeImage, screen } from 'electron';
import type { CompanionWindow } from './companionWindow';
import type { BubbleWindow } from './bubbleWindow';
import { pickRegion } from './picker';
import { captureRegion, CaptureError } from './capture';
import { lookup } from './agent';
import { lookupViaClaudeCode } from './claudeCode';
import { loadSettings, settingsFile } from './settings';
import type { ScreenRect } from '@shared/bubble';

/**
 * The whole "look at something" interaction: pick a region, capture it, walk the
 * character over, ask for a note, run the lookup, stream the answer into the bubble.
 */
export class LookupFlow {
  private busy = false;
  private abort: AbortController | null = null;

  constructor(private companion: CompanionWindow, private bubble: BubbleWindow) {}

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

      this.bubble.show({ thumbnail, rect }, head, {
        onSubmit: (note) => void this.run(png, note),
        onClose: () => this.idle(),
      });
    } finally {
      this.busy = false;
    }
  }

  private async run(png: Buffer, note: string): Promise<void> {
    this.abort?.abort();
    this.abort = new AbortController();
    const settings = loadSettings();
    const apiKey = process.env['ANTHROPIC_API_KEY'] || settings.apiKey || undefined;
    this.companion.send({ type: 'setState', state: 'thinking' });

    let talking = false;
    const onEvent = (ev: import('@shared/bubble').AgentEvent): void => {
      this.bubble.agent(ev);
      if (ev.type === 'status') {
        if (ev.status === 'searching' || ev.status === 'reading') this.companion.send({ type: 'setState', state: 'searching' });
        else if (ev.status === 'thinking') this.companion.send({ type: 'setState', state: 'thinking' });
      }
      if (ev.type === 'delta' && !talking) { talking = true; this.companion.send({ type: 'setState', state: 'talking' }); }
      if (ev.type === 'done') {
        this.companion.send({ type: 'react', clip: ev.mood === 'happy' ? 'happy' : ev.mood === 'sorry' ? 'sorry' : 'nod' });
        this.companion.send({ type: 'setState', state: 'idle' });
      }
      if (ev.type === 'error') {
        this.companion.send({ type: 'react', clip: 'sorry' });
        this.companion.send({ type: 'setState', state: 'idle' });
      }
    };
    if (settings.backend === 'api') {
      await lookup({ imagePng: png, note }, onEvent, { apiKey, webSearch: settings.webSearch, signal: this.abort.signal, settingsPath: settingsFile() });
    } else {
      await lookupViaClaudeCode({ imagePng: png, note }, onEvent, { model: settings.claudeModel, claudePath: settings.claudePath ?? undefined, webSearch: settings.webSearch, signal: this.abort.signal });
    }
  }

  private showError(rect: ScreenRect, message: string): void {
    const settings = loadSettings();
    const stand = this.standPoint(rect);
    const head = this.companion.toScreen({ x: stand.x, y: stand.y - settings.scale * 0.9 });
    this.bubble.show({ thumbnail: '', rect }, head, { onSubmit: () => {}, onClose: () => this.idle() });
    setTimeout(() => this.bubble.agent({ type: 'error', message }), 200);
    this.companion.send({ type: 'react', clip: 'sorry' });
    this.companion.send({ type: 'setState', state: 'idle' });
  }

  private idle(): void {
    this.abort?.abort();
    this.abort = null;
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
