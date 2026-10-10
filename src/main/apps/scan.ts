/** Finds installed applications on each platform. No Electron imports, so it can be tested. */
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, extname, isAbsolute, join } from 'node:path';
import type { Platform } from '../../shared/types';
import { parseDesktopEntry } from './desktop-entry';

export interface AppEntry {
  name: string;
  /** What to open: a `.app` bundle, a `.lnk` shortcut or a `.desktop` file. */
  path: string;
  /** Image to show; when missing, the OS icon of `path` is used. */
  iconPath?: string;
  keywords?: string[];
}

async function listDir(dir: string) {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/** macOS: `.app` bundles, looking one folder deep (e.g. /Applications/Utilities). */
export async function scanMacApps(dirs: string[]): Promise<AppEntry[]> {
  const apps: AppEntry[] = [];
  const visit = async (dir: string, depth: number) => {
    for (const entry of await listDir(dir)) {
      if (entry.name.startsWith('.')) continue;
      const path = join(dir, entry.name);
      if (entry.name.endsWith('.app')) {
        apps.push({ name: entry.name.slice(0, -'.app'.length), path });
      } else if (entry.isDirectory() && depth > 0) {
        await visit(path, depth - 1);
      }
    }
  };
  for (const dir of dirs) await visit(dir, 1);
  return apps;
}

const WINDOWS_NOISE = /\b(uninstall|uninstaller|readme|release notes|license|documentation|help)\b/i;

/** Windows: `.lnk` shortcuts in the Start Menu. */
export async function scanWindowsApps(dirs: string[]): Promise<AppEntry[]> {
  const apps: AppEntry[] = [];
  const visit = async (dir: string, depth: number) => {
    for (const entry of await listDir(dir)) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (depth > 0) await visit(path, depth - 1);
      } else if (extname(entry.name).toLowerCase() === '.lnk') {
        const name = basename(entry.name, extname(entry.name));
        if (!WINDOWS_NOISE.test(name)) apps.push({ name, path });
      }
    }
  };
  for (const dir of dirs) await visit(dir, 4);
  return apps;
}

const ICON_SIZES = ['scalable', '256x256', '128x128', '96x96', '64x64', '48x48', '32x32'];

/** Looks an icon name up in the hicolor theme and pixmaps, the places nearly every app installs to. */
export function resolveLinuxIcon(icon: string, dataDirs: string[]): string | undefined {
  if (isAbsolute(icon)) return existsSync(icon) ? icon : undefined;
  for (const dataDir of dataDirs) {
    for (const size of ICON_SIZES) {
      for (const ext of ['.svg', '.png']) {
        const candidate = join(dataDir, 'icons', 'hicolor', size, 'apps', `${icon}${ext}`);
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  for (const ext of ['.svg', '.png']) {
    const candidate = join('/usr/share/pixmaps', `${icon}${ext}`);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

/** Linux: visible `.desktop` entries in the XDG application folders. */
export async function scanLinuxApps(dataDirs: string[]): Promise<AppEntry[]> {
  const apps: AppEntry[] = [];
  const seenIds = new Set<string>();
  const visit = async (dir: string, depth: number) => {
    for (const entry of await listDir(dir)) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (depth > 0) await visit(path, depth - 1);
        continue;
      }
      // The first entry with a given file name wins, so user entries override system ones.
      if (!entry.name.endsWith('.desktop') || seenIds.has(entry.name)) continue;
      seenIds.add(entry.name);
      let source: string;
      try {
        source = await readFile(path, 'utf8');
      } catch {
        continue;
      }
      const desktop = parseDesktopEntry(source);
      if (!desktop?.visible) continue;
      const app: AppEntry = { name: desktop.name, path };
      const iconPath = desktop.icon ? resolveLinuxIcon(desktop.icon, dataDirs) : undefined;
      if (iconPath) app.iconPath = iconPath;
      if (desktop.keywords.length > 0) app.keywords = desktop.keywords;
      apps.push(app);
    }
  };
  for (const dataDir of dataDirs) await visit(join(dataDir, 'applications'), 2);
  return apps;
}

export function defaultAppDirectories(platform: Platform, env: NodeJS.ProcessEnv = process.env): string[] {
  const home = homedir();
  switch (platform) {
    case 'darwin':
      return [
        '/Applications',
        '/System/Applications',
        join(home, 'Applications'),
        '/System/Library/CoreServices/Applications',
      ];
    case 'win32':
      return [
        join(env.ProgramData ?? 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
        join(env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
      ];
    case 'linux': {
      const dataHome = env.XDG_DATA_HOME || join(home, '.local', 'share');
      const dataDirs = (env.XDG_DATA_DIRS || '/usr/local/share:/usr/share').split(':').filter(Boolean);
      return [
        dataHome,
        ...dataDirs,
        '/var/lib/flatpak/exports/share',
        join(home, '.local', 'share', 'flatpak', 'exports', 'share'),
        '/var/lib/snapd/desktop',
      ];
    }
  }
}

/** Scans the platform's usual locations, removing duplicates by name, sorted by name. */
export async function scanApplications(
  platform: Platform,
  dirs = defaultAppDirectories(platform),
): Promise<AppEntry[]> {
  const found =
    platform === 'darwin'
      ? await scanMacApps(dirs)
      : platform === 'win32'
        ? await scanWindowsApps(dirs)
        : await scanLinuxApps([...new Set(dirs)]);
  const byName = new Map<string, AppEntry>();
  for (const app of found) {
    const key = app.name.toLowerCase();
    if (!byName.has(key)) byName.set(key, app);
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}
