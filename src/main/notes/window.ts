import { join } from 'node:path';
import { app, BrowserWindow } from 'electron';
import { NotesChannel, type NotesWindowState } from '../../shared/notes';
import { glassFor, glassWindowOptions, loadPage } from '../glass';
import { debounce, readJsonFile, writeJsonFile } from '../json-file';
import { showOnEverySpace } from '../spaces';

const isMac = process.platform === 'darwin';

interface SavedState extends NotesWindowState {
  bounds?: Electron.Rectangle;
  currentId?: string;
}

const DEFAULT_STATE: SavedState = { alwaysOnTop: false, sidebar: true };

/** The Notes window: one per app, remembers its size, position and last note. */
export class NotesWindow {
  private window: BrowserWindow | undefined;
  private state: SavedState;
  private readonly save = debounce(() => writeJsonFile(this.statePath, this.state), 500);

  constructor(private readonly statePath: string) {
    let saved: unknown;
    try {
      saved = readJsonFile(statePath);
    } catch {
      saved = undefined;
    }
    this.state = { ...DEFAULT_STATE, ...(typeof saved === 'object' && saved !== null ? (saved as SavedState) : {}) };
  }

  get webContents(): Electron.WebContents | undefined {
    return this.window?.webContents;
  }

  getState(): SavedState {
    return this.state;
  }

  setState(patch: Partial<NotesWindowState>): void {
    if (typeof patch.alwaysOnTop === 'boolean') {
      this.state.alwaysOnTop = patch.alwaysOnTop;
      this.applyAlwaysOnTop();
    }
    if (typeof patch.sidebar === 'boolean') this.state.sidebar = patch.sidebar;
    this.save();
  }

  setCurrent(id: string): void {
    this.state.currentId = id;
    this.save();
  }

  /** Shows the window, optionally on a specific note. */
  open(noteId?: string): void {
    const window = this.window ?? this.create();
    if (noteId) {
      this.state.currentId = noteId;
      const send = () => window.webContents.send(NotesChannel.open, noteId);
      if (window.webContents.isLoading()) window.webContents.once('did-finish-load', send);
      else send();
    }
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
    if (isMac) app.focus({ steal: true });
  }

  flushState(): void {
    this.save.flush();
  }

  private create(): BrowserWindow {
    const { bounds } = this.state;
    const glass = glassFor();
    const window = new BrowserWindow({
      width: bounds?.width ?? 560,
      height: bounds?.height ?? 600,
      ...(bounds ? { x: bounds.x, y: bounds.y } : {}),
      minWidth: 340,
      minHeight: 260,
      show: false,
      title: 'Notes',
      fullscreenable: false,
      ...glassWindowOptions(glass, false),
      ...(isMac
        ? ({ titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 14, y: 15 } } as const)
        : ({ autoHideMenuBar: true } as const)),
      webPreferences: {
        preload: join(import.meta.dirname, '../preload/notes.cjs'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        spellcheck: true,
      },
    });
    this.window = window;
    showOnEverySpace(window);
    this.applyAlwaysOnTop();

    const rememberBounds = debounce(() => {
      if (!window.isDestroyed()) {
        this.state.bounds = window.getBounds();
        this.save();
      }
    }, 300);
    window.on('move', rememberBounds);
    window.on('resize', rememberBounds);
    window.on('closed', () => {
      this.window = undefined;
      this.save.flush();
    });

    loadPage(window, 'notes', glass);
    return window;
  }

  /** Pinned, the window floats above other windows; either way it opens wherever you are. */
  private applyAlwaysOnTop(): void {
    const window = this.window;
    if (!window) return;
    window.setAlwaysOnTop(this.state.alwaysOnTop, 'floating');
  }
}
