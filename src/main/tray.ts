import { Tray, Menu, nativeImage, app } from 'electron';
import { join } from 'node:path';

export interface TrayActions {
  lookAtSomething(): void;
  toggleVisible(): void;
  toggleSleep(): void;
  chooseModel(): void;
  resetModel(): void;
  setup(): void;
  isVisible(): boolean;
  isSleeping(): boolean;
  hasCustomModel(): boolean;
  toggleSprites(): void;
  isSprites(): boolean;
  shortcutLabel: string;
}

export function createTray(actions: TrayActions): Tray {
  const icon = nativeImage.createFromPath(join(app.getAppPath(), 'resources', 'trayTemplate.png'));
  icon.setTemplateImage(true);
  const tray = new Tray(icon);
  tray.setToolTip('Clippet');

  const rebuild = (): void => {
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: `Look at something…  (${actions.shortcutLabel})`, click: () => actions.lookAtSomething() },
        { type: 'separator' },
        { label: actions.isVisible() ? 'Hide Clippet' : 'Show Clippet', click: () => { actions.toggleVisible(); rebuild(); } },
        { label: actions.isSleeping() ? 'Wake up' : 'Do not disturb', click: () => { actions.toggleSleep(); rebuild(); } },
        { type: 'separator' },
        { label: 'Pixel sprites (2D)', type: 'checkbox', checked: actions.isSprites(), click: () => { actions.toggleSprites(); rebuild(); } },
        { label: 'Use your own model (GLB)…', click: () => { actions.chooseModel(); rebuild(); } },
        { label: 'Use the default model', enabled: actions.hasCustomModel(), click: () => { actions.resetModel(); rebuild(); } },
        { label: 'Sign-in check…', click: () => actions.setup() },
        { type: 'separator' },
        { label: 'Quit Clippet', role: 'quit' },
      ]),
    );
  };
  rebuild();
  return tray;
}
