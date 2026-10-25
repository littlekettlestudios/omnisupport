import { app, globalShortcut } from 'electron';
import { CompanionWindow } from './companionWindow';
import { BubbleWindow } from './bubbleWindow';
import { LookupFlow } from './lookupFlow';
import { createTray } from './tray';
import { loadSettings } from './settings';

// Menu-bar app: no Dock icon, no main window in the app switcher.
if (process.platform === 'darwin') app.dock?.hide();

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

const companion = new CompanionWindow();
const bubble = new BubbleWindow();
const flow = new LookupFlow(companion, bubble);
let visible = true;
let sleeping = false;

app.whenReady().then(() => {
  const settings = loadSettings();
  companion.create();

  companion.onEvent((e) => {
    if (e.type === 'ready') console.log('[clippet] renderer ready, rig:', e.hasRig, 'clips:', e.clips);
    if (e.type === 'click') {
      if (process.env['CLIPPET_DEBUG']) console.log('[clippet] click on character');
      if (!bubble.visible) companion.send({ type: 'react', clip: 'wave' });
    }
    if (e.type === 'dragEnd' && process.env['CLIPPET_DEBUG']) console.log('[clippet] dragged to', e.x, e.y);
  });

  const lookAtSomething = (): void => { if (!sleeping) void flow.start(); };

  // CLIPPET_DEBUG=1: open the picker once on launch so the flow can be checked without a keyboard.
  if (process.env['CLIPPET_DEBUG'] === 'flow') setTimeout(lookAtSomething, 2500);

  const ok = globalShortcut.register(settings.shortcut, lookAtSomething);
  if (!ok) console.error('[clippet] could not register shortcut', settings.shortcut);

  createTray({
    lookAtSomething,
    toggleVisible: () => {
      visible = !visible;
      companion.send({ type: 'setVisible', visible });
      if (!visible) bubble.hide();
    },
    toggleSleep: () => {
      sleeping = !sleeping;
      companion.send({ type: 'setState', state: sleeping ? 'sleeping' : 'idle' });
    },
    isVisible: () => visible,
    isSleeping: () => sleeping,
    shortcutLabel: settings.shortcut.replace('CommandOrControl', '⌘').replace('Alt', '⌥').replaceAll('+', ''),
  });
});

app.on('will-quit', () => globalShortcut.unregisterAll());
// Keep running with no windows; the tray owns the lifecycle.
app.on('window-all-closed', () => {});
