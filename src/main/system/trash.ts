import { readdir, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Platform } from '../../shared/types';
import { type Exec, isMissing, powershellArgs } from '../exec';

/** Empties the Recycle Bin on every drive, without Windows asking again. Prints `empty` if there was nothing in it. */
export const WINDOWS_EMPTY_RECYCLE_BIN = `$ErrorActionPreference = 'Stop'
Add-Type -Namespace OpenPalette -Name RecycleBin -MemberDefinition '[DllImport("shell32.dll", CharSet = CharSet.Unicode)] public static extern int SHEmptyRecycleBin(IntPtr hwnd, string root, uint flags);'
# 7: no confirmation, no progress, no sound. An already empty bin answers E_UNEXPECTED.
$result = [OpenPalette.RecycleBin]::SHEmptyRecycleBin([IntPtr]::Zero, $null, 7)
if ($result -eq -2147418113) { 'empty'; exit }
if ($result -ne 0) { throw ("Windows couldn't empty the Recycle Bin (0x{0:X8})." -f $result) }
'emptied'`;

/**
 * Finder empties the Trash as its own Empty Trash does. It fails with -128 when there's
 * nothing to empty, so the Trash is counted first. Prints `empty` or `emptied`.
 */
export const MAC_EMPTY_TRASH = `tell application "Finder"
  if (count of items of trash) is 0 then return "empty"
  empty trash
end tell
return "emptied"`;

/** The trash in your home folder, as the freedesktop.org spec places it. */
export function linuxTrash(env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  return join(env.XDG_DATA_HOME || join(home, '.local', 'share'), 'Trash');
}

function lastLine(output: string): string {
  return output.trim().split(/\r?\n/).pop()?.trim() ?? '';
}

async function emptyFolder(dir: string): Promise<void> {
  const names = await readdir(dir).catch(() => [] as string[]);
  await Promise.all(names.map((name) => rm(join(dir, name), { recursive: true, force: true })));
}

/**
 * Deletes everything in the Trash (Recycle Bin on Windows) for good. Resolves to whether there
 * was anything to delete. On macOS, the first time asks to let Open Palette control Finder.
 */
export async function emptyTrash(platform: Platform, exec: Exec, env = process.env): Promise<'emptied' | 'empty'> {
  switch (platform) {
    case 'darwin':
      return lastLine(await exec('osascript', ['-e', MAC_EMPTY_TRASH], 120_000)) === 'empty' ? 'empty' : 'emptied';
    case 'win32':
      return lastLine(await exec('powershell.exe', powershellArgs(WINDOWS_EMPTY_RECYCLE_BIN), 120_000)) === 'empty'
        ? 'empty'
        : 'emptied';
    case 'linux': {
      const trash = linuxTrash(env);
      const files = await readdir(join(trash, 'files')).catch(() => [] as string[]);
      if (files.length === 0) return 'empty';
      // gio also empties the trash on other drives, and file managers notice; but without
      // gvfs running it does nothing and still succeeds, so what's left is deleted here.
      await exec('gio', ['trash', '--empty'], 120_000).catch((error: unknown) => {
        if (!isMissing(error)) throw error;
      });
      const left = await readdir(join(trash, 'files')).catch(() => [] as string[]);
      if (left.length > 0) {
        await Promise.all(['files', 'info', 'expunged'].map((sub) => emptyFolder(join(trash, sub))));
      }
      return 'emptied';
    }
  }
}
