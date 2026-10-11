/**
 * Runs the System commands' scripts on the real system. Off by default; the platform
 * workflow runs it on macOS, Windows and Linux with OPEN_PALETTE_SMOKE=1. Nothing here
 * restarts, shuts down or turns anything off.
 */
import { describe, expect, it } from 'vitest';
import type { Platform } from '../../shared/types';
import { exec, reasonOf } from '../exec';
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

  it('empties the Trash', { timeout: 120_000 }, async () => {
    try {
      await emptyTrash(platform, exec);
    } catch (error) {
      console.log('empty trash:', reasonOf(error));
      // A CI Mac may not let the runner script Finder.
      expect(platform === 'darwin' && /-1743|-1712|not authori[sz]ed/i.test(String(error))).toBe(true);
    }
  });
});
