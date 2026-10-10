import { join } from 'node:path';
import { app, BrowserWindow, screen } from 'electron';
import { IpcChannel, type ShownInfo, type ToastMessage } from '../shared/ipc';

const WIDTH = 750;
const HEIGHT = 474;
/** After this long hidden, the launcher opens at the root again instead of where you left it. */
const RESET_AFTER_MS = 90_000;

const isMac = process.platform === 'darwin';

export interface LauncherWindowOptions {
  hideOnBlur: () => boolean;
}

/** The frameless launcher window, toggled by the global hotkey. */
export class LauncherWindow {
  readonly window: BrowserWindow;
  private hiddenAt = 0;

  constructor(private readonly options: LauncherWindowOptions) {
    this.window = new BrowserWindow({
      width: WIDTH,
      height: HEIGHT,
      show: false,
      frame: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      backgroundColor: '#00000000',
      hasShadow: true,
      // macOS: a panel can float above full-screen apps, and gets the native blurred
      // material. Elsewhere the window is transparent and the page draws its own rounded card.
      ...(isMac
        ? ({ type: 'panel', vibrancy: 'popover', visualEffectState: 'active' } as const)
        : ({ transparent: true } as const)),
      webPreferences: {
        preload: join(import.meta.dirname, '../preload/index.cjs'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        spellcheck: false,
        // Keep the renderer responsive while hidden so it opens instantly.
        backgroundThrottling: false,
      },
    });

    if (isMac) this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    this.window.on('blur', () => {
      if (this.options.hideOnBlur() && !this.window.webContents.isDevToolsFocused()) this.hide();
    });

    if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
      void this.window.loadURL(process.env.ELECTRON_RENDERER_URL);
    } else {
      void this.window.loadFile(join(import.meta.dirname, '../renderer/index.html'));
    }
  }

  get visible(): boolean {
    return this.window.isVisible();
  }

  toggle(): void {
    if (this.visible && this.window.isFocused()) this.hide();
    else this.show();
  }

  show(): void {
    const info: ShownInfo = {
      reset: !this.visible && this.hiddenAt > 0 && Date.now() - this.hiddenAt > RESET_AFTER_MS,
    };
    if (!this.visible) this.center();
    this.window.show();
    this.window.focus();
    if (isMac) app.focus({ steal: true });
    this.window.webContents.send(IpcChannel.shown, info);
  }

  hide(): void {
    if (!this.visible) return;
    this.hiddenAt = Date.now();
    this.window.hide();
    // Hand focus back to the app that was active before the launcher opened — unless
    // another of our windows (like Notes) is open and should keep it.
    const otherWindowOpen = BrowserWindow.getAllWindows().some((w) => w !== this.window && w.isVisible());
    if (isMac && !otherWindowOpen) app.hide();
  }

  /** Shows a message in the launcher's footer, once the page has loaded. */
  toast(message: ToastMessage): void {
    const { webContents } = this.window;
    if (webContents.isLoading()) webContents.once('did-finish-load', () => webContents.send(IpcChannel.toast, message));
    else webContents.send(IpcChannel.toast, message);
  }

  /** Centers the window horizontally on the display under the cursor, a bit above the middle. */
  private center(): void {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const { x, y, width, height } = display.workArea;
    this.window.setBounds({
      x: Math.round(x + (width - WIDTH) / 2),
      y: Math.round(y + height * 0.2),
      width: WIDTH,
      height: HEIGHT,
    });
  }
}
