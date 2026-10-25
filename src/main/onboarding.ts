import { execFile } from 'node:child_process';
import type { CompanionWindow } from './companionWindow';
import type { BubbleWindow } from './bubbleWindow';
import { findClaude } from './claudeCode';
import { loadSettings } from './settings';
import type { BubbleAction } from '@shared/bubble';

export type SignInState = 'ok' | 'signed-out' | 'missing';

/** `claude auth status` prints JSON with loggedIn; no model call, no cost. */
export async function claudeSignInState(claudePath?: string): Promise<SignInState> {
  const bin = await findClaude(claudePath);
  if (!bin) return 'missing';
  const env = { ...process.env };
  delete env['ANTHROPIC_API_KEY'];
  delete env['ANTHROPIC_AUTH_TOKEN'];
  return new Promise((resolve) => {
    execFile(bin, ['auth', 'status'], { env, timeout: 15000 }, (_err, out) => {
      try {
        const j = JSON.parse(String(out));
        resolve(j.loggedIn ? 'ok' : 'signed-out');
      } catch {
        resolve('signed-out');
      }
    });
  });
}

export const SIGN_IN_ACTIONS: BubbleAction[] = [
  { id: 'open-terminal', label: 'Open Terminal', primary: true },
  { id: 'check-again', label: 'Check again' },
];

/**
 * First-run and sign-in flow for the Claude Code backend: the companion waves and asks
 * the user to sign in to Claude Code in their own terminal. Clippet never handles the
 * credentials itself.
 */
export class Onboarding {
  constructor(private companion: CompanionWindow, private bubble: BubbleWindow) {}

  /** Check at launch; show the card only when something is missing. */
  async checkAtLaunch(): Promise<void> {
    if (loadSettings().backend !== 'claude-code') return;
    const state = await claudeSignInState(loadSettings().claudePath ?? undefined);
    if (state !== 'ok') this.show(state);
  }

  show(state: SignInState): void {
    const head = this.headPoint();
    this.companion.send({ type: 'setState', state: 'attentive' });
    this.companion.send({ type: 'react', clip: 'wave' });
    const payload = state === 'missing'
      ? {
          kind: 'card' as const,
          title: 'Hi! One thing first',
          message: 'I answer through Claude Code, but I cannot find it on this Mac. Install it with:\n\nnpm install -g @anthropic-ai/claude-code\n\nthen sign in by running `claude` in a terminal.',
          actions: SIGN_IN_ACTIONS,
        }
      : {
          kind: 'card' as const,
          title: 'Hi! Sign in first',
          message: 'I answer through your Claude Code login. Open a terminal, run `claude`, and sign in with /login. I will wait here.',
          actions: SIGN_IN_ACTIONS,
        };
    this.bubble.show(payload, head, {
      onAction: (id) => void this.action(id),
      onClose: () => this.companion.send({ type: 'setState', state: 'idle' }),
    });
  }

  /** Run a card action by id (also used for actions raised from a failed lookup). */
  handle(id: string): void { void this.action(id); }

  private async action(id: string): Promise<void> {
    if (id === 'open-terminal') {
      // Opens the user's Terminal and starts the interactive CLI so they can /login.
      execFile('osascript', ['-e', 'tell application "Terminal" to activate', '-e', 'tell application "Terminal" to do script "claude"']);
      return;
    }
    if (id === 'check-again') {
      this.companion.send({ type: 'setState', state: 'thinking' });
      const state = await claudeSignInState(loadSettings().claudePath ?? undefined);
      if (state === 'ok') {
        this.companion.send({ type: 'react', clip: 'happy' });
        this.companion.send({ type: 'setState', state: 'idle' });
        const s = loadSettings();
        const label = s.shortcut.replace('CommandOrControl', '⌘').replace('Alt', '⌥').replaceAll('+', '');
        this.bubble.show(
          { kind: 'card', title: 'All set!', message: `Press ${label} and drag over anything on screen. I will look it up.`, actions: [{ id: 'dismiss', label: 'Got it', primary: true }], tone: 'success' },
          this.headPoint(),
          { onAction: () => this.bubble.hide() },
        );
      } else {
        this.companion.send({ type: 'react', clip: 'sorry' });
        this.show(state);
      }
    }
  }

  private headPoint(): { x: number; y: number } {
    const scale = loadSettings().scale;
    return this.companion.toScreen({ x: this.companion.feet.x, y: this.companion.feet.y - scale * 0.9 });
  }
}
