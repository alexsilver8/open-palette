import { join } from 'node:path';
import { app, BrowserWindow } from 'electron';
import { glassFor, glassWindowOptions, loadPage } from './glass';

const isMac = process.platform === 'darwin';

/** The Settings window. One at a time; opening it again brings it forward. */
export class SettingsWindow {
  private window: BrowserWindow | undefined;

  get webContents(): Electron.WebContents | undefined {
    return this.window?.webContents;
  }

  open(): void {
    const window = this.window ?? this.create();
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
    if (isMac) app.focus({ steal: true });
  }

  private create(): BrowserWindow {
    const glass = glassFor();
    const window = new BrowserWindow({
      width: 760,
      height: 560,
      minWidth: 620,
      minHeight: 420,
      show: false,
      title: 'Open Palette Settings',
      fullscreenable: false,
      maximizable: false,
      ...glassWindowOptions(glass, false),
      ...(isMac
        ? ({ titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 14, y: 15 } } as const)
        : ({ autoHideMenuBar: true } as const)),
      webPreferences: {
        preload: join(import.meta.dirname, '../preload/settings.cjs'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        spellcheck: false,
      },
    });
    this.window = window;
    window.once('ready-to-show', () => window.show());
    window.on('closed', () => {
      this.window = undefined;
    });
    loadPage(window, 'settings', glass);
    return window;
  }
}
