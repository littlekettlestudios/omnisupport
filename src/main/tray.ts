import { Tray, Menu, nativeImage, app } from 'electron';
import { join } from 'node:path';

export interface TrayActions {
  lookAtSomething(): void;
  openChat(): void;
  openSettings(): void;
  openSetup(): void;
  toggleVisible(): void;
  toggleSleep(): void;
  toggleSprites(): void;
  isVisible(): boolean;
  isSleeping(): boolean;
  isSprites(): boolean;
  name(): string;
  shortcutLabel(): string;
}

/** Menu-bar icon. Call the returned rebuild after the name or shortcut changes. */
export function createTray(actions: TrayActions): { tray: Tray; rebuild: () => void } {
  const icon = nativeImage.createFromPath(join(app.getAppPath(), 'resources', 'trayTemplate.png'));
  icon.setTemplateImage(true);
  const tray = new Tray(icon);

  const rebuild = (): void => {
    const name = actions.name();
    tray.setToolTip(name);
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: `Look at something…  (${actions.shortcutLabel()})`, click: () => actions.lookAtSomething() },
        { label: `Chat with ${name}…`, click: () => actions.openChat() },
        { type: 'separator' },
        { label: actions.isVisible() ? `Hide ${name}` : `Show ${name}`, click: () => { actions.toggleVisible(); rebuild(); } },
        { label: actions.isSleeping() ? 'Wake up' : 'Do not disturb', click: () => { actions.toggleSleep(); rebuild(); } },
        { label: 'Pixel sprites (2D)', type: 'checkbox', checked: actions.isSprites(), click: () => { actions.toggleSprites(); rebuild(); } },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'CommandOrControl+,', click: () => actions.openSettings() },
        { label: 'Setup…', click: () => actions.openSetup() },
        { type: 'separator' },
        { label: `Quit ${name}`, role: 'quit' },
      ]),
    );
  };
  rebuild();
  return { tray, rebuild };
}
