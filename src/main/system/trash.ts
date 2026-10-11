import { readdir, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Platform } from '../../shared/types';
import { type Exec, isMissing, powershellArgs } from '../exec';

/** Empties the Recycle Bin on every drive, without Windows asking again. An empty bin isn't an error. */
export const WINDOWS_EMPTY_RECYCLE_BIN = `$ErrorActionPreference = 'Stop'
Add-Type -Namespace OpenPalette -Name RecycleBin -MemberDefinition '[DllImport("shell32.dll", CharSet = CharSet.Unicode)] public static extern int SHEmptyRecycleBin(IntPtr hwnd, string root, uint flags);'
# 7: no confirmation, no progress, no sound. An already empty bin answers E_UNEXPECTED.
$result = [OpenPalette.RecycleBin]::SHEmptyRecycleBin([IntPtr]::Zero, $null, 7)
if ($result -ne 0 -and $result -ne -2147418113) { throw ("Windows couldn't empty the Recycle Bin (0x{0:X8})." -f $result) }`;

/** The trash in your home folder, as the freedesktop.org spec places it. */
export function linuxTrash(env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  return join(env.XDG_DATA_HOME || join(home, '.local', 'share'), 'Trash');
}

async function emptyFolder(dir: string): Promise<void> {
  const names = await readdir(dir).catch(() => [] as string[]);
  await Promise.all(names.map((name) => rm(join(dir, name), { recursive: true, force: true })));
}

/** Deletes everything in the Trash (Recycle Bin on Windows) for good. */
export async function emptyTrash(platform: Platform, exec: Exec, env = process.env): Promise<void> {
  switch (platform) {
    case 'darwin':
      // Finder empties it as its own Empty Trash does; macOS asks once to let Open Palette control Finder.
      await exec('osascript', ['-e', 'tell application "Finder" to empty trash'], 120_000);
      return;
    case 'win32':
      await exec('powershell.exe', powershellArgs(WINDOWS_EMPTY_RECYCLE_BIN), 120_000);
      return;
    case 'linux':
      try {
        await exec('gio', ['trash', '--empty'], 120_000);
      } catch (error) {
        if (!isMissing(error)) throw error;
        const trash = linuxTrash(env);
        await Promise.all(['files', 'info', 'expunged'].map((sub) => emptyFolder(join(trash, sub))));
      }
  }
}
