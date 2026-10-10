import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { clipboard, shell } from 'electron';
import type { Action, ActionResult } from '../shared/types';
import { execToArgv, parseDesktopEntry } from './apps/desktop-entry';

const BLOCKED_URL_SCHEMES = new Set(['file:', 'javascript:', 'data:', 'vbscript:', 'blob:']);

export class ActionError extends Error {}

/** Launches a Linux `.desktop` entry with `gio`, falling back to its Exec line. */
async function launchDesktopEntry(path: string): Promise<void> {
  const viaGio = await new Promise<boolean>((resolve) => {
    const child = spawn('gio', ['launch', path], { detached: true, stdio: 'ignore' });
    child.once('error', () => resolve(false));
    child.once('spawn', () => {
      child.unref();
      resolve(true);
    });
  });
  if (viaGio) return;

  const entry = parseDesktopEntry(await readFile(path, 'utf8'));
  const [command, ...args] = entry?.exec ? execToArgv(entry.exec) : [];
  if (!command) throw new ActionError('This application has no command to run.');
  spawn(command, args, { detached: true, stdio: 'ignore' }).unref();
}

/** Performs the actions that need nothing but the OS: opening, revealing and copying. */
export async function performSystemAction(
  action: Exclude<Action, { type: 'open-command' } | { type: 'callback' }>,
): Promise<ActionResult> {
  switch (action.type) {
    case 'open-url': {
      let url: URL;
      try {
        url = new URL(action.url);
      } catch {
        throw new ActionError(`Not a valid URL: ${action.url}`);
      }
      if (BLOCKED_URL_SCHEMES.has(url.protocol)) throw new ActionError(`Can't open ${url.protocol} links.`);
      await shell.openExternal(url.toString());
      return { hide: true };
    }
    case 'open-path': {
      if (process.platform === 'linux' && action.path.endsWith('.desktop')) {
        await launchDesktopEntry(action.path);
        return { hide: true };
      }
      const error = await shell.openPath(action.path);
      if (error) throw new ActionError(error);
      return { hide: true };
    }
    case 'reveal-path':
      shell.showItemInFolder(action.path);
      return { hide: true };
    case 'copy':
      await clipboard.writeText(action.text);
      return { hide: true };
  }
}
