// Runs the media scripts on the real system. Off by default; the platform workflow runs it on
// macOS, Windows and Linux with OPEN_PALETTE_SMOKE=1. CI machines play nothing, so this checks
// that the scripts run and report that, rather than what they find.
import { execFile } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { listPlayers } from './index.js';
import { MAC_MEDIA_KEY_SCRIPT, windowsMediaKeyScript } from './media.js';

const enabled = process.env.OPEN_PALETTE_SMOKE === '1';
const platform = /** @type {'darwin' | 'win32' | 'linux'} */ (process.platform);

/** @param {string} file @param {string[]} args */
const run = (file, args) =>
  new Promise((resolve, reject) =>
    execFile(file, args, { timeout: 15_000 }, (error, stdout, stderr) =>
      error ? reject(new Error(`${error.message}\n${stderr}`)) : resolve(stdout),
    ),
  );

describe.runIf(enabled)(`Media Controls on ${platform}`, () => {
  it('lists the players', { timeout: 30_000 }, async () => {
    try {
      const players = await listPlayers(platform);
      console.log('players:', players);
      expect(Array.isArray(players)).toBe(true);
    } catch (error) {
      console.log('players:', error);
      // Linux CI has no session bus to ask; elsewhere the script must work.
      expect(platform).toBe('linux');
    }
  });

  it.runIf(platform === 'darwin')('presses a media key', { timeout: 30_000 }, async () => {
    await run('osascript', ['-l', 'JavaScript', '-e', MAC_MEDIA_KEY_SCRIPT, '16']);
  });

  it.runIf(platform === 'win32')('presses a media key', { timeout: 30_000 }, async () => {
    const script = Buffer.from(windowsMediaKeyScript('play-pause'), 'utf16le').toString('base64');
    await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', script]);
  });
});
