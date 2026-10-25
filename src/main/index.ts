import { app, globalShortcut, screen } from 'electron';
import { CompanionWindow } from './companionWindow';
import { createTray } from './tray';
import { loadSettings } from './settings';

// Menu-bar app: no Dock icon, no main window in the app switcher.
if (process.platform === 'darwin') app.dock?.hide();

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

const companion = new CompanionWindow();
let visible = true;
let sleeping = false;

function lookAtSomething(): void {
  // M0: exercise the protocol. M1 replaces this with the region picker + agent.
  const { workArea } = screen.getPrimaryDisplay();
  const target = {
    x: workArea.x + 200 + Math.random() * (workArea.width - 400),
    y: workArea.y + 200 + Math.random() * (workArea.height - 300),
  };
  const c = companion.toCanvas(target);
  console.log('[clippet] capture requested; pretending the region is at', c);
  companion.send({ type: 'setState', state: 'attentive' });
  companion.send({ type: 'moveTo', x: c.x, y: c.y + 80, walk: true });
  companion.send({ type: 'lookAt', x: c.x, y: c.y });
}

app.whenReady().then(() => {
  const settings = loadSettings();
  companion.create();

  companion.onEvent((e) => {
    if (e.type === 'ready') console.log('[clippet] renderer ready, rig:', e.hasRig, 'clips:', e.clips);
    if (e.type === 'arrived') {
      companion.send({ type: 'setState', state: 'thinking' });
      setTimeout(() => {
        companion.send({ type: 'react', clip: 'happy' });
        companion.send({ type: 'setState', state: 'idle' });
      }, 1500);
    }
    if (e.type === 'click') {
      if (process.env['CLIPPET_DEBUG']) console.log('[clippet] click on character');
      companion.send({ type: 'react', clip: 'wave' });
    }
    if (e.type === 'dragEnd' && process.env['CLIPPET_DEBUG']) console.log('[clippet] dragged to', e.x, e.y);
  });

  // CLIPPET_DEBUG=1: fire the shortcut flow once on launch so it can be checked without a keyboard.
  if (process.env['CLIPPET_DEBUG']) setTimeout(lookAtSomething, 3000);

  const ok = globalShortcut.register(settings.shortcut, lookAtSomething);
  if (!ok) console.error('[clippet] could not register shortcut', settings.shortcut);

  createTray({
    lookAtSomething,
    toggleVisible: () => {
      visible = !visible;
      companion.send({ type: 'setVisible', visible });
    },
    toggleSleep: () => {
      sleeping = !sleeping;
      companion.send({ type: 'setState', state: sleeping ? 'sleeping' : 'idle' });
    },
    isVisible: () => visible,
    isSleeping: () => sleeping,
    shortcutLabel: settings.shortcut.replace('CommandOrControl', '⌘').replace('Alt', '⌥').replace('+', '').replace('+', ''),
  });
});

app.on('will-quit', () => globalShortcut.unregisterAll());
// Keep running with no windows; the tray owns the lifecycle.
app.on('window-all-closed', () => {});
