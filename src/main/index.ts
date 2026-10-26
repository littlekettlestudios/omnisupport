import { app, dialog, globalShortcut } from 'electron';
import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CompanionWindow } from './companionWindow';
import { BubbleWindow } from './bubbleWindow';
import { LookupFlow } from './lookupFlow';
import { Onboarding } from './onboarding';
import { createTray } from './tray';
import { loadSettings, saveSettings, SHORTCUT_FALLBACKS, setActiveShortcut, shortcutLabel } from './settings';

// Menu-bar app: no Dock icon, no main window in the app switcher.
if (process.platform === 'darwin') app.dock?.hide();

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

const companion = new CompanionWindow();
const bubble = new BubbleWindow();
const flow = new LookupFlow(companion, bubble);
const onboarding = new Onboarding(companion, bubble);
let visible = true;
let sleeping = false;

app.whenReady().then(() => {
  const settings = loadSettings();
  companion.create();

  companion.onEvent((e) => {
    if (e.type === 'ready') {
      console.log('[clippet] renderer ready, rig:', e.hasRig, 'clips:', e.clips);
      setTimeout(() => void onboarding.checkAtLaunch(), 800);
    }
    if (e.type === 'click') {
      if (process.env['CLIPPET_DEBUG']) console.log('[clippet] click on character');
      if (!bubble.visible) companion.send({ type: 'react', clip: 'wave' });
    }
    if (e.type === 'dragEnd' && process.env['CLIPPET_DEBUG']) console.log('[clippet] dragged to', e.x, e.y);
  });

  const lookAtSomething = (): void => { if (!sleeping) void flow.start(); };
  flow.onAction = (id) => {
    if (id === 'dismiss') bubble.hide();
    else onboarding.handle(id);
  };

  // CLIPPET_DEBUG=flow: open the picker once on launch so the flow can be checked without a keyboard.
  if (process.env['CLIPPET_DEBUG'] === 'flow') setTimeout(lookAtSomething, 2500);
  // CLIPPET_DEBUG=pose: cycle a few states and reactions so clip playback can be eyeballed.
  if (process.env['CLIPPET_DEBUG'] === 'pose') {
    const seq: Array<() => void> = [
      () => companion.send({ type: 'react', clip: 'wave' }),
      () => companion.send({ type: 'setState', state: 'thinking' }),
      () => companion.send({ type: 'setState', state: 'searching' }),
      () => { companion.send({ type: 'setState', state: 'idle' }); companion.send({ type: 'lookAt', x: companion.feet.x + 300, y: companion.feet.y - 400 }); },
      () => { companion.send({ type: 'lookAt', x: null, y: null }); companion.send({ type: 'react', clip: 'happy' }); },
      () => companion.send({ type: 'setState', state: 'sleeping' }),
    ];
    seq.forEach((fn, i) => setTimeout(fn, 2500 + i * 3000));
  }

  // Register the configured shortcut, falling back to known-free combinations if it is taken.
  let registered: string | null = null;
  for (const accel of [settings.shortcut, ...SHORTCUT_FALLBACKS.filter((a) => a !== settings.shortcut)]) {
    if (globalShortcut.register(accel, lookAtSomething)) { registered = accel; break; }
    console.warn('[clippet] shortcut taken:', accel);
  }
  if (registered) {
    setActiveShortcut(registered);
    console.log('[clippet] shortcut registered:', registered);
  } else console.error('[clippet] no shortcut could be registered; use the menu-bar icon');

  const chooseModel = async (): Promise<void> => {
    const r = await dialog.showOpenDialog({ title: 'Choose a GLB model', filters: [{ name: 'glTF binary', extensions: ['glb'] }], properties: ['openFile'] });
    if (r.canceled || !r.filePaths[0]) return;
    const dir = join(app.getPath('userData'), 'models');
    mkdirSync(dir, { recursive: true });
    const dest = join(dir, `custom-${Date.now()}.glb`);
    copyFileSync(r.filePaths[0], dest);
    const s = loadSettings();
    s.modelUrl = pathToFileURL(dest).href;
    const wasSprites = s.sprites;
    s.sprites = false; // picking a model means showing it
    saveSettings(s);
    if (wasSprites) companion.reloadRenderer();
    else companion.send({ type: 'reload', modelUrl: s.modelUrl });
  };

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
    chooseModel: () => void chooseModel(),
    resetModel: () => {
      const s = loadSettings();
      s.modelUrl = null;
      const wasSprites = s.sprites;
      s.sprites = false;
      saveSettings(s);
      if (wasSprites) companion.reloadRenderer();
      else companion.send({ type: 'reload', modelUrl: companion.modelUrl(null) });
    },
    toggleSprites: () => {
      const s = loadSettings();
      s.sprites = !s.sprites;
      saveSettings(s);
      companion.reloadRenderer();
    },
    isSprites: () => loadSettings().sprites,
    setup: () => void onboarding.show('signed-out'),
    isVisible: () => visible,
    isSleeping: () => sleeping,
    hasCustomModel: () => loadSettings().modelUrl !== null,
    shortcutLabel: shortcutLabel(),
  });
});

app.on('will-quit', () => globalShortcut.unregisterAll());
// Keep running with no windows; the tray owns the lifecycle.
app.on('window-all-closed', () => {});
