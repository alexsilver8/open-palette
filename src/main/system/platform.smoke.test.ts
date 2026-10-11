/**
 * Runs the System commands' scripts on the real system. Off by default; the platform
 * workflow runs it on macOS, Windows and Linux with OPEN_PALETTE_SMOKE=1. Nothing here
 * restarts, shuts down or turns anything off, and the Trash is only emptied on CI machines.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Platform } from '../../shared/types';
import { exec, powershellArgs, reasonOf } from '../exec';
import { listDisks } from './disks';
import { emptyTrash } from './trash';
import { WifiError, wifiPower } from './wifi';

const enabled = process.env.OPEN_PALETTE_SMOKE === '1';
const platform = process.platform as Platform;

describe.runIf(enabled)(`System commands on ${platform}`, () => {
  it('tells whether Wi-Fi is on, or that there is none', { timeout: 30_000 }, async () => {
    try {
      const on = await wifiPower(platform, exec);
      console.log('Wi-Fi on:', on);
      expect(typeof on).toBe('boolean');
    } catch (error) {
      console.log('Wi-Fi:', reasonOf(error));
      // CI machines have no Wi-Fi; Linux ones may have neither nmcli nor rfkill.
      const acceptable = error instanceof WifiError || (error as NodeJS.ErrnoException).code === 'ENOENT';
      expect(acceptable, reasonOf(error)).toBe(true);
    }
  });

  it('lists disks to eject', { timeout: 30_000 }, async () => {
    const disks = await listDisks(platform, exec);
    console.log('disks:', disks);
    expect(Array.isArray(disks)).toBe(true);
  });

  // Only on CI machines: anywhere else this would empty your own Trash.
  it.runIf(process.env.CI === 'true')('empties the Trash', { timeout: 120_000 }, async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'open-palette-')), 'thrown away.txt');
    writeFileSync(file, 'bye');
    const binned = await toTrash(file).then(
      () => true,
      (error: unknown) => {
        console.log('putting a file in the Trash:', reasonOf(error));
        return false;
      },
    );
    let first: string;
    let second: string;
    try {
      first = await emptyTrash(platform, exec);
      second = await emptyTrash(platform, exec);
    } catch (error) {
      console.log('empty trash:', reasonOf(error));
      // A CI Mac may not let the runner script Finder.
      expect(platform === 'darwin' && /-1743|-1712|not authori[sz]ed/i.test(String(error))).toBe(true);
      return;
    }
    console.log('empty trash:', first, binned ? '(a file was put in it first)' : '', 'then', second);
    if (binned) expect(first).toBe('emptied');
    expect(second).toBe('empty');
  });
});

/** Moves a file to the Trash the way each system's file manager does. */
async function toTrash(file: string): Promise<void> {
  if (platform === 'darwin') {
    await exec('osascript', [
      '-e',
      'on run argv',
      '-e',
      'tell application "Finder" to delete (POSIX file (item 1 of argv))',
      '-e',
      'end run',
      file,
    ]);
  } else if (platform === 'win32') {
    const script = `Add-Type -AssemblyName Microsoft.VisualBasic
[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile('${file.replace(/'/g, "''")}', 'OnlyErrorDialogs', 'SendToRecycleBin')`;
    await exec('powershell.exe', powershellArgs(script), 30_000);
  } else {
    await exec('gio', ['trash', file]);
  }
}
