import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { app, globalShortcut, nativeTheme, shell } from 'electron';
import { IpcChannel } from '../shared/ipc';
import { NotesChannel } from '../shared/notes';
import type { Platform } from '../shared/types';
import { AppIndex } from './apps/app-index';
import { electronClipboard } from './clipboard/electron-source';
import { ClipboardHistory } from './clipboard/history';
import { clipboardHistoryExtension } from './commands/clipboard-history';
import { notesExtension } from './commands/notes';
import { paletteExtension } from './commands/palette';
import { system } from './commands/system';
import { webSearch } from './commands/web-search';
import { ExtensionHostClient } from './extensions/host-client';
import { handleIconProtocol, registerIconScheme } from './icon-protocol';
import { registerIpc } from './ipc';
import { registerNotesIpc } from './notes/ipc';
import { NotesStore } from './notes/store';
import { NotesWindow } from './notes/window';
import { CommandRegistry } from './registry';
import { type Settings, SettingsStore } from './settings';
import { AppTray } from './tray';
import { UsageTracker } from './usage';
import { LauncherWindow } from './window';

// Lets tests and multiple dev copies use their own data folder.
if (process.env.OPEN_PALETTE_USER_DATA) app.setPath('userData', process.env.OPEN_PALETTE_USER_DATA);

registerIconScheme();

if (!app.requestSingleInstanceLock()) {
  // Running `open-palette` again toggles the existing instance (handy on Wayland,
  // where global shortcuts can be bound to a command instead).
  app.quit();
} else {
  void main();
}

let activeHotkey: string | undefined;

/**
 * Switches the global shortcut. The new one is registered before the old one is released,
 * so a typo or a shortcut taken by another app never leaves you without one.
 */
function setHotkey(accelerator: string, onPress: () => void): boolean {
  if (accelerator === activeHotkey) return true;
  let registered = false;
  try {
    registered = globalShortcut.register(accelerator, onPress);
  } catch {
    // An invalid accelerator throws.
  }
  if (!registered) return false;
  if (activeHotkey) globalShortcut.unregister(activeHotkey);
  activeHotkey = accelerator;
  return true;
}

async function main(): Promise<void> {
  await app.whenReady();
  if (process.platform === 'darwin') app.dock?.hide();

  const platform = process.platform as Platform;
  const dataDir = app.getPath('userData');
  const extensionsDir = join(dataDir, 'extensions');
  mkdirSync(extensionsDir, { recursive: true });

  const settingsPath = join(dataDir, 'settings.json');
  const firstRun = !existsSync(settingsPath);
  const settings = new SettingsStore(settingsPath);
  const usage = new UsageTracker(join(dataDir, 'usage.json'));
  const apps = new AppIndex(platform);
  const clipboardHistory = new ClipboardHistory(
    join(dataDir, 'clipboard-history.json'),
    electronClipboard,
    settings.get().clipboardHistory.maxItems,
  );
  const host = new ExtensionHostClient(join(import.meta.dirname, 'extension-host.js'));

  const notesDirectoryFor = (current: Settings) => {
    const dir = current.notesDirectory;
    if (!dir) return join(dataDir, 'notes');
    return resolve(dir === '~' || /^~[\\/]/.test(dir) ? join(homedir(), dir.slice(1)) : dir);
  };
  const notesStore = new NotesStore(notesDirectoryFor(settings.get()), (path) => shell.trashItem(path));
  const notesWindow = new NotesWindow(join(dataDir, 'notes-window.json'));
  registerNotesIpc(notesStore, notesWindow);
  notesStore.on('change', () => notesWindow.webContents?.send(NotesChannel.changed));
  void notesStore.watch();

  const registry: CommandRegistry = new CommandRegistry({
    platform,
    host,
    apps,
    usage,
    supportRoot: join(dataDir, 'extension-data'),
    extensionRoots: () => [
      extensionsDir,
      ...settings.get().extensionDirectories,
      // While developing, load the bundled examples too.
      ...(app.isPackaged ? [] : [join(app.getAppPath(), 'examples', 'extensions')]),
    ],
    builtins: [
      clipboardHistoryExtension(clipboardHistory, () => settings.get().clipboardHistory.enabled),
      notesExtension(notesStore, notesWindow),
      webSearch,
      system,
      paletteExtension({ settingsPath, extensionsDir, registry: () => registry }),
    ],
  });

  handleIconProtocol();
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('will-navigate', (event) => event.preventDefault());
  });

  const launcher = new LauncherWindow({ hideOnBlur: () => settings.get().hideOnBlur });
  registerIpc(registry, launcher);
  registry.on('change', () => launcher.window.webContents.send(IpcChannel.rootItemsChanged));
  app.on('second-instance', () => launcher.show());

  const tray = new AppTray({
    hotkey: () => activeHotkey,
    onOpen: () => launcher.show(),
    onOpenNotes: () => notesWindow.open(),
    onOpenSettings: () => void shell.openPath(settingsPath),
    onOpenExtensionsFolder: () => void shell.openPath(extensionsDir),
    onReloadExtensions: () => void registry.loadUserExtensions(),
  });

  const apply = (current: Settings, previous?: Settings) => {
    if (current.hotkey !== previous?.hotkey && !setHotkey(current.hotkey, () => launcher.toggle())) {
      const fallback = activeHotkey ? ` Still using ${activeHotkey}.` : '';
      console.warn(`[hotkey] Could not register "${current.hotkey}".`);
      launcher.toast({
        text: `Couldn't use “${current.hotkey}” as the shortcut. It may be invalid or taken by another app.${fallback}`,
        style: 'failure',
      });
      if (!activeHotkey) launcher.show();
    }
    tray.refresh();
    nativeTheme.themeSource = current.theme;
    if (platform !== 'linux') app.setLoginItemSettings({ openAtLogin: current.launchAtLogin });
    clipboardHistory.setMaxItems(current.clipboardHistory.maxItems);
    if (current.clipboardHistory.enabled) void clipboardHistory.start();
    else clipboardHistory.stop();
    if (previous && current.notesDirectory !== previous.notesDirectory) {
      notesStore.setDirectory(notesDirectoryFor(current));
    }
    if (previous && JSON.stringify(current.extensionDirectories) !== JSON.stringify(previous.extensionDirectories)) {
      void registry.loadUserExtensions();
    }
  };
  apply(settings.get());
  settings.on('change', apply);
  settings.watch();

  // Show the launcher right away in development, on first run, or when asked to. Apps and
  // extensions fill in as they load.
  if (!app.isPackaged || firstRun || process.argv.includes('--show')) launcher.show();

  await Promise.all([apps.refresh(), registry.loadUserExtensions()]);
  apps.startAutoRefresh();

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    usage.flush();
    clipboardHistory.flush();
    notesWindow.flushState();
    notesStore.unwatch();
    host.stop();
  });
  // A launcher lives in the tray; closing its window must not quit the app.
  app.on('window-all-closed', () => {});
}
