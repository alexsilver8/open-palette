import { join } from 'node:path';
import { app, BrowserWindow, screen } from 'electron';
import { IpcChannel, type ShownInfo, type ToastMessage } from '../shared/ipc';
import { glassFor, glassWindowOptions, loadPage } from './glass';
import { showOnEverySpace } from './spaces';

const WIDTH = 800;
const HEIGHT = 500;
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
  private openedFromOwnWindow = false;

  constructor(private readonly options: LauncherWindowOptions) {
    const glass = glassFor();
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
      hasShadow: true,
      // Frosted glass: the system blurs what's behind the window where it can.
      ...glassWindowOptions(glass, true),
      // On macOS a panel can float above full-screen apps.
      ...(isMac ? ({ type: 'panel' } as const) : {}),
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

    showOnEverySpace(this.window);

    // If the page crashes, bring it back rather than leaving an empty window.
    this.window.webContents.on('render-process-gone', (_event, details) => {
      console.error(`[launcher] Renderer gone: ${details.reason}`);
      if (details.reason !== 'clean-exit') loadPage(this.window, 'index', glass);
    });

    this.window.on('blur', () => {
      if (this.options.hideOnBlur() && !this.window.webContents.isDevToolsFocused()) this.hide();
    });

    loadPage(this.window, 'index', glass);
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
    if (!this.visible) {
      this.center();
      // Was one of our own windows (Notes, Settings) in front, or another app?
      const focused = BrowserWindow.getFocusedWindow();
      this.openedFromOwnWindow = focused !== null && focused !== this.window;
    }
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

  /**
   * Hides the launcher and makes sure what you were using before is in front again, so a
   * paste lands there. On macOS, a visible Notes window would otherwise keep Open Palette the
   * active app; unless you opened the launcher from Notes, the whole app steps aside.
   */
  hideAndReturnFocus(): void {
    const wasVisible = this.visible;
    this.hide();
    if (wasVisible && isMac && !this.openedFromOwnWindow) app.hide();
  }

  /**
   * Tells the page the root items changed. A hidden launcher reloads them when it opens, so
   * it isn't told (a note being typed changes them every few keystrokes). Changes can also
   * arrive while the app quits, after the window is gone, when sending would throw.
   */
  rootItemsChanged(): void {
    if (!this.window.isDestroyed() && this.window.isVisible()) {
      this.window.webContents.send(IpcChannel.rootItemsChanged);
    }
  }

  /** Shows a message in the launcher's footer, once the page has loaded. */
  toast(message: ToastMessage): void {
    if (this.window.isDestroyed()) return;
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
