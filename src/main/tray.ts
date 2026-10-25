import { Tray, Menu, nativeImage, app } from 'electron';
import { join } from 'node:path';

export interface TrayActions {
  lookAtSomething(): void;
  toggleVisible(): void;
  toggleSleep(): void;
  isVisible(): boolean;
  isSleeping(): boolean;
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
        { label: 'Quit Clippet', role: 'quit' },
      ]),
    );
  };
  rebuild();
  return tray;
}
