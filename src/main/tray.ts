import { join } from 'node:path';
import { app, Menu, nativeImage, Tray } from 'electron';

export interface TrayOptions {
  /** The shortcut that currently works, if any. */
  hotkey: () => string | undefined;
  onOpen(): void;
  onOpenNotes(): void;
  onOpenSettings(): void;
  onOpenExtensionsFolder(): void;
  onReloadExtensions(): void;
}

function trayIcon(): Electron.NativeImage {
  // macOS template images adapt to light and dark menu bars automatically.
  const file = process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png';
  const image = nativeImage.createFromPath(join(app.getAppPath(), 'resources', file));
  if (process.platform === 'darwin') image.setTemplateImage(true);
  return image;
}

export class AppTray {
  private readonly tray: Tray;

  constructor(private readonly options: TrayOptions) {
    this.tray = new Tray(trayIcon());
    this.tray.setToolTip('Open Palette');
    // On Windows and Linux a click usually means "open"; macOS shows the menu instead.
    if (process.platform !== 'darwin') this.tray.on('click', () => options.onOpen());
    this.refresh();
  }

  /** Rebuilds the menu, e.g. after the hotkey changed. */
  refresh(): void {
    const { options } = this;
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: 'Open Palette',
          accelerator: options.hotkey(),
          registerAccelerator: false,
          click: () => options.onOpen(),
        },
        { label: 'Notes', click: () => options.onOpenNotes() },
        { type: 'separator' },
        { label: 'Settings…', click: () => options.onOpenSettings() },
        { label: 'Open Extensions Folder', click: () => options.onOpenExtensionsFolder() },
        { label: 'Reload Extensions', click: () => options.onReloadExtensions() },
        { type: 'separator' },
        { label: `Open Palette ${app.getVersion()}`, enabled: false },
        { label: 'Quit', role: 'quit' },
      ]),
    );
  }

  destroy(): void {
    this.tray.destroy();
  }
}
