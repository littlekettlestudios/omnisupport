import { app, dialog, globalShortcut, Menu, systemPreferences } from 'electron';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CompanionWindow } from './companionWindow';
import { BubbleWindow } from './bubbleWindow';
import { PanelWindow } from './panelWindow';
import { Chat } from './chat';
import { LookupFlow } from './lookupFlow';
import { MarkerWindow } from './markerWindow';
import { Pointer } from './pointer';
import { Onboarding, claudeSignInState, openSignInTerminal } from './onboarding';
import { listMemories } from './memory';
import { createTray } from './tray';
import { activeShortcut, dockAtLaunch, loadSettings, saveSettings, SHORTCUT_FALLBACKS, setActiveShortcut, shortcutLabel } from './settings';
import type { PanelSettings, PanelState, SetupCheck } from '@shared/panel';

/** Earlier builds were called Clippet; carry their settings, memory and models over once. */
function migrateLegacyData(): void {
  const legacy = join(app.getPath('appData'), 'Clippet');
  const current = app.getPath('userData');
  // --user-data-dir is a deliberate scratch profile (testing); leave it empty.
  if (app.commandLine.hasSwitch('user-data-dir') || legacy === current || !existsSync(legacy) || existsSync(join(current, 'settings.json'))) return;
  mkdirSync(current, { recursive: true });
  for (const f of ['settings.json', 'memory.json', 'models']) {
    if (existsSync(join(legacy, f))) cpSync(join(legacy, f), join(current, f), { recursive: true });
  }
}
migrateLegacyData();

// With the Dock icon off it is a menu-bar-only app; the panel shows the icon while it is open.
if (process.platform === 'darwin' && !dockAtLaunch()) app.dock?.hide();

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

const companion = new CompanionWindow();
const bubble = new BubbleWindow();
const chat = new Chat(companion);
const pointer = new Pointer(companion, new MarkerWindow());
const flow = new LookupFlow(companion, bubble, chat, pointer);
const onboarding = new Onboarding(companion, bubble);
let visible = true;
let sleeping = false;
let claudeCheck: SetupCheck = 'unknown';
let rebuildTray = (): void => {};

const lookAtSomething = (): void => { if (!sleeping) void flow.start(); };
const glanceAtScreen = (): void => { if (!sleeping) void flow.glance(); };
/** The glance shortcut actually registered, or null when it was taken. */
let glanceActive: string | null = null;

/** Register both shortcuts: look-at-something with fallbacks, glance as configured or not at all. */
function registerShortcuts(): void {
  globalShortcut.unregisterAll();
  const s = loadSettings();
  registerShortcut(s.shortcut);
  glanceActive = null;
  try {
    if (globalShortcut.register(s.glanceShortcut, glanceAtScreen)) glanceActive = s.glanceShortcut;
  } catch {
    // Not a valid accelerator string.
  }
  if (glanceActive) console.log('[clippet] glance shortcut registered:', glanceActive);
  else console.warn('[clippet] glance shortcut taken or invalid:', s.glanceShortcut);
}

/** Register the shortcut, falling back to known-free combinations if it is taken. Returns the one registered. */
function registerShortcut(preferred: string): string | null {
  for (const accel of [preferred, ...SHORTCUT_FALLBACKS.filter((a) => a !== preferred)]) {
    try {
      if (globalShortcut.register(accel, lookAtSomething)) {
        setActiveShortcut(accel);
        console.log('[clippet] shortcut registered:', accel);
        return accel;
      }
    } catch {
      // Not a valid accelerator string.
    }
    console.warn('[clippet] shortcut taken or invalid:', accel);
  }
  console.error('[clippet] no shortcut could be registered; use the menu-bar icon');
  return null;
}

function screenCheck(): SetupCheck {
  const s = systemPreferences.getMediaAccessStatus('screen');
  return s === 'granted' ? 'ok' : s === 'denied' || s === 'restricted' ? 'denied' : 'unknown';
}

async function panelState(recheck = false): Promise<PanelState> {
  const s = loadSettings();
  if (recheck || claudeCheck === 'unknown') claudeCheck = await claudeSignInState(s.claudePath ?? undefined);
  const envKey = !!process.env['ANTHROPIC_API_KEY'];
  return {
    settings: {
      name: s.name, backend: s.backend, claudeModel: s.claudeModel, webSearch: s.webSearch,
      scale: s.scale, shortcut: s.shortcut, glanceShortcut: s.glanceShortcut, sprites: s.sprites, memory: s.memory, dock: s.dock,
    },
    hasApiKey: !!s.apiKey,
    apiKeyFromEnv: envKey,
    customModel: s.modelUrl !== null,
    customSprites: s.spritePack !== null,
    memories: listMemories(),
    conversation: chat.current,
    shortcutLabel: shortcutLabel(activeShortcut()),
    glanceShortcutLabel: glanceActive ? shortcutLabel(glanceActive) : '',
    setup: {
      claudeCode: claudeCheck,
      screen: screenCheck(),
      apiKey: s.backend !== 'api' ? 'not-needed' : envKey || s.apiKey ? 'ok' : 'missing',
    },
    dataFolder: app.getPath('userData'),
    version: app.getVersion(),
  };
}

function applySettings(patch: Partial<PanelSettings>): void {
  const before = loadSettings();
  const s = { ...before };
  if (typeof patch.name === 'string' && patch.name.trim()) s.name = patch.name.trim().slice(0, 40);
  if (patch.backend === 'claude-code' || patch.backend === 'api') s.backend = patch.backend;
  if (typeof patch.claudeModel === 'string' && patch.claudeModel) s.claudeModel = patch.claudeModel;
  if (typeof patch.webSearch === 'boolean') s.webSearch = patch.webSearch;
  if (typeof patch.memory === 'boolean') s.memory = patch.memory;
  if (typeof patch.sprites === 'boolean') s.sprites = patch.sprites;
  if (typeof patch.dock === 'boolean') s.dock = patch.dock;
  if (typeof patch.scale === 'number' && Number.isFinite(patch.scale)) s.scale = Math.round(Math.min(Math.max(patch.scale, 60), 400));
  if (typeof patch.shortcut === 'string' && patch.shortcut.trim()) s.shortcut = patch.shortcut.trim();
  if (typeof patch.glanceShortcut === 'string' && patch.glanceShortcut.trim()) s.glanceShortcut = patch.glanceShortcut.trim();
  saveSettings(s);

  if (s.scale !== before.scale) companion.send({ type: 'setScale', scale: s.scale });
  if (s.sprites !== before.sprites) companion.reloadRenderer();
  if (s.shortcut !== before.shortcut || s.glanceShortcut !== before.glanceShortcut) registerShortcuts();
  if (s.dock !== before.dock) applyDock(s.dock);
  rebuildTray();
}

/** Show or hide the Dock icon. Hiding waits while the panel is open; closing it hides the icon. */
function applyDock(show: boolean): void {
  if (process.platform !== 'darwin' || !app.dock) return;
  if (show) {
    void app.dock.show();
    // Run from source the bundle is Electron's, so give the Dock the app's own icon.
    if (!app.isPackaged) app.dock.setIcon(join(app.getAppPath(), 'resources', 'icon.png'));
    app.dock.setMenu(Menu.buildFromTemplate([
      { label: 'Look at something…', click: lookAtSomething },
      { label: 'Glance at the screen', click: glanceAtScreen },
      { label: 'Chat', click: () => panel.show('chat') },
      { label: 'Settings…', click: () => panel.show('settings') },
    ]));
  } else if (!panel.isOpen) {
    app.dock.hide();
  }
}

/** The macOS menu bar while the app is frontmost: Settings under the app name, plus Edit for copy and paste. */
function appMenu(): Menu {
  return Menu.buildFromTemplate([
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'CommandOrControl+,', click: () => panel.show('settings') },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    { role: 'windowMenu' },
  ]);
}

async function chooseModel(): Promise<void> {
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
  rebuildTray();
}

function resetModel(): void {
  const s = loadSettings();
  s.modelUrl = null;
  const wasSprites = s.sprites;
  s.sprites = false;
  saveSettings(s);
  if (wasSprites) companion.reloadRenderer();
  else companion.send({ type: 'reload', modelUrl: companion.modelUrl(null) });
  rebuildTray();
}

/** Pick a sprite pack folder (atlas.json plus its sheets), copy it into the data folder and show it. */
async function chooseSprites(): Promise<void> {
  const r = await dialog.showOpenDialog({ title: 'Choose a sprite pack folder (with atlas.json)', properties: ['openDirectory'] });
  if (r.canceled || !r.filePaths[0]) return;
  const src = r.filePaths[0];
  try {
    const atlas = JSON.parse(readFileSync(join(src, 'atlas.json'), 'utf8'));
    if (!atlas.clips || typeof atlas.clips !== 'object' || !Object.keys(atlas.clips).length) throw new Error('atlas.json lists no clips');
  } catch (err) {
    void dialog.showMessageBox({ type: 'warning', message: 'That folder is not a sprite pack.', detail: `It needs an atlas.json with clips, as made by scripts/make_sprite_pack.py. (${(err as Error).message})` });
    return;
  }
  const dest = join(app.getPath('userData'), 'sprites', `${basename(src)}-${Date.now()}`);
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
  // Picking a pack means showing it.
  saveSettings({ ...loadSettings(), spritePack: pathToFileURL(join(dest, 'atlas.json')).href, sprites: true });
  companion.reloadRenderer();
  rebuildTray();
}

function resetSprites(): void {
  const s = loadSettings();
  saveSettings({ ...s, spritePack: null });
  if (s.sprites) companion.reloadRenderer();
}

const panel = new PanelWindow({
  state: panelState,
  saveSettings: applySettings,
  setApiKey: (key) => saveSettings({ ...loadSettings(), apiKey: key }),
  chooseModel,
  resetModel,
  chooseSprites,
  resetSprites,
  openTerminal: openSignInTerminal,
}, chat);

chat.on((e) => {
  panel.chatEvent(e);
  if (e.type !== 'turn' && e.type !== 'new' && bubble.visible && bubble.conversationId === e.conversationId) bubble.agent(e);
});
chat.onStateChanged = () => { void panel.refresh(); rebuildTray(); };
chat.onPoint = (target) => { if (target) pointer.point(target); else pointer.clear(false); };

app.whenReady().then(() => {
  const settings = loadSettings();
  Menu.setApplicationMenu(appMenu());
  if (settings.dock) applyDock(true);
  companion.create();

  companion.onEvent((e) => {
    if (e.type === 'ready') {
      console.log('[clippet] renderer ready, rig:', e.hasRig, 'clips:', e.clips);
      setTimeout(() => {
        const s = loadSettings();
        if (!s.welcomed) {
          // First run: the Setup tab covers sign-in, permissions and naming in one place.
          saveSettings({ ...s, welcomed: true });
          companion.send({ type: 'react', clip: 'wave' });
          panel.show('setup', true);
        } else void onboarding.checkAtLaunch();
      }, 800);
    }
    if (e.type === 'click') {
      if (process.env['CLIPPET_DEBUG']) console.log('[clippet] click on character');
      if (!bubble.visible) {
        companion.send({ type: 'react', clip: 'wave' });
        flow.openChat();
      }
    }
    if (e.type === 'dragEnd' && process.env['CLIPPET_DEBUG']) console.log('[clippet] dragged to', e.x, e.y);
  });

  flow.onAction = (id) => {
    if (id === 'dismiss') bubble.hide();
    else if (id === 'open-chat') { bubble.hide(); panel.show('chat'); }
    else if (id === 'open-setup') { bubble.hide(); panel.show(loadSettings().backend === 'api' ? 'settings' : 'setup'); }
    else onboarding.handle(id);
  };

  // CLIPPET_DEBUG=flow: open the picker once on launch so the flow can be checked without a keyboard.
  if (process.env['CLIPPET_DEBUG'] === 'flow') setTimeout(lookAtSomething, 2500);
  // CLIPPET_DEBUG=glance: glance at the screen once on launch.
  if (process.env['CLIPPET_DEBUG'] === 'glance') setTimeout(glanceAtScreen, 2500);
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
  // CLIPPET_DEBUG=panel: open the panel on launch.
  if (process.env['CLIPPET_DEBUG'] === 'panel') setTimeout(() => panel.show('chat'), 1500);

  registerShortcuts();

  rebuildTray = createTray({
    lookAtSomething,
    glanceAtScreen,
    openChat: () => panel.show('chat'),
    openSettings: () => panel.show('settings'),
    openSetup: () => panel.show('setup'),
    toggleVisible: () => {
      visible = !visible;
      companion.send({ type: 'setVisible', visible });
      if (!visible) bubble.hide();
    },
    toggleSleep: () => {
      sleeping = !sleeping;
      companion.send({ type: 'setState', state: sleeping ? 'sleeping' : 'idle' });
    },
    toggleSprites: () => applySettings({ sprites: !loadSettings().sprites }),
    isSprites: () => loadSettings().sprites,
    isVisible: () => visible,
    isSleeping: () => sleeping,
    name: () => loadSettings().name,
    shortcutLabel: () => shortcutLabel(activeShortcut()),
    glanceShortcutLabel: () => (glanceActive ? shortcutLabel(glanceActive) : ''),
  }).rebuild;
});

// Clicking the Dock icon, or opening the app again from Finder, brings up the window.
app.on('activate', () => { if (app.isReady()) panel.show('chat'); });
app.on('second-instance', () => panel.show('chat'));
app.on('will-quit', () => globalShortcut.unregisterAll());
// Keep running with no windows; the tray owns the lifecycle.
app.on('window-all-closed', () => {});
