import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ListView } from '../../shared/types';
import { systemExtension } from '../commands/system';
import type { Exec } from '../exec';
import { macDiskFromInfo, parseLsblk, parsePlist, parseWindowsDisks, windowsEjectScript } from './disks';
import { linuxLogOut, powerPrograms } from './power';
import { emptyTrash, linuxTrash } from './trash';
import { parseAirportPower, parseRfkill, parseWifiDevice, windowsWifiScript } from './wifi';

const missing = () => Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' });

/** Answers commands from a table, and records what ran. */
function fakeExec(answers: Record<string, string | Error>) {
  const calls: string[] = [];
  const exec: Exec = async (file, args) => {
    const line = [file, ...args].join(' ');
    calls.push(line);
    const key = Object.keys(answers).find((k) => line.startsWith(k));
    const answer = key === undefined ? missing() : answers[key];
    if (answer instanceof Error) throw answer;
    return answer ?? '';
  };
  return { exec, calls };
}

describe('power', () => {
  it('restarts, shuts down and logs out on every system', () => {
    expect(powerPrograms('restart', 'darwin')).toEqual([
      ['osascript', ['-e', 'tell application "System Events" to restart']],
    ]);
    expect(powerPrograms('shut-down', 'win32')).toEqual([['shutdown.exe', ['/s', '/t', '0']]]);
    expect(powerPrograms('log-out', 'win32')).toEqual([['shutdown.exe', ['/l']]]);
    expect(powerPrograms('restart', 'linux')).toEqual([['systemctl', ['reboot']]]);
  });

  it('logs out of each Linux desktop its own way, then by ending the session', () => {
    expect(linuxLogOut({ XDG_CURRENT_DESKTOP: 'ubuntu:GNOME', XDG_SESSION_ID: '3' })).toEqual([
      ['gnome-session-quit', ['--logout', '--no-prompt']],
      ['loginctl', ['terminate-session', '3']],
    ]);
    expect(linuxLogOut({ XDG_CURRENT_DESKTOP: 'KDE' }).map(([file]) => file)).toEqual(['qdbus6', 'qdbus']);
    expect(linuxLogOut({})).toEqual([]);
  });
});

describe('disks', () => {
  it('reads diskutil’s plist', () => {
    const info = parsePlist(`<?xml version="1.0"?><plist><dict>
      <key>VolumeName</key><string>Holiday &amp; Photos</string>
      <key>Internal</key><false/>
      <key>TotalSize</key><integer>64000000000</integer>
      <key>FreeSpace</key><integer>12000000000</integer>
      <key>BusProtocol</key><string>USB</string>
    </dict></plist>`);
    expect(info).toEqual({
      VolumeName: 'Holiday & Photos',
      Internal: false,
      TotalSize: 64_000_000_000,
      FreeSpace: 12_000_000_000,
      BusProtocol: 'USB',
    });
    expect(macDiskFromInfo('/Volumes/Holiday & Photos', info)).toEqual({
      id: '/Volumes/Holiday & Photos',
      name: 'Holiday & Photos',
      kind: 'removable',
      size: 64_000_000_000,
      free: 12_000_000_000,
      path: '/Volumes/Holiday & Photos',
    });
    expect(macDiskFromInfo('/Volumes/Data', { Internal: true, BusProtocol: 'Apple Fabric' })).toBeUndefined();
    expect(macDiskFromInfo('/Volumes/Xcode', { Internal: true, BusProtocol: 'Disk Image' })?.kind).toBe('image');
  });

  it('reads Windows drives, one or many', () => {
    expect(
      parseWindowsDisks('{"id":"E:","name":"KINGSTON","type":2,"size":31000000000,"free":1000,"image":false}'),
    ).toEqual([{ id: 'E:', name: 'KINGSTON (E:)', kind: 'removable', size: 31_000_000_000, free: 1000, path: 'E:\\' }]);
    const many = parseWindowsDisks(
      '[{"id":"D:","name":"","type":5,"size":700000000,"free":0,"image":true},{"id":"F:","name":null,"type":3,"size":null,"free":null,"image":false}]',
    );
    expect(many.map((d) => [d.name, d.kind])).toEqual([
      ['Drive D:', 'image'],
      ['Drive F:', 'removable'],
    ]);
    expect(parseWindowsDisks('')).toEqual([]);
  });

  it('only puts a drive letter in the Windows eject script', () => {
    const script = windowsEjectScript("E:'; Remove-Item C:\\ -Recurse; '");
    expect(script).toContain("ParseName('E:')");
    expect(script).not.toContain('Remove-Item');
  });

  it('finds mounted removable partitions with lsblk', () => {
    const output = JSON.stringify({
      blockdevices: [
        {
          name: 'nvme0n1',
          path: '/dev/nvme0n1',
          rm: false,
          hotplug: false,
          type: 'disk',
          children: [
            { name: 'nvme0n1p2', path: '/dev/nvme0n1p2', mountpoint: '/', rm: false, hotplug: false, type: 'part' },
          ],
        },
        {
          name: 'sdb',
          path: '/dev/sdb',
          rm: true,
          hotplug: true,
          size: 32000000000,
          type: 'disk',
          children: [
            {
              name: 'sdb1',
              path: '/dev/sdb1',
              label: 'STICK',
              mountpoint: '/media/alex/STICK',
              rm: true,
              hotplug: true,
              size: 31999000000,
              fsavail: 5000000000,
              type: 'part',
            },
            { name: 'sdb2', path: '/dev/sdb2', mountpoint: null, rm: true, type: 'part' },
          ],
        },
        // util-linux before 2.33: no path, "0"/"1" flags, mountpoints.
        {
          name: 'sdc',
          rm: '0',
          hotplug: '1',
          type: 'disk',
          children: [
            {
              name: 'sdc1',
              mountpoints: ['/run/media/alex/BACKUP'],
              rm: '0',
              hotplug: '1',
              size: '1000',
              type: 'part',
            },
          ],
        },
      ],
    });
    expect(parseLsblk(output)).toEqual([
      {
        id: '/dev/sdb1',
        name: 'STICK',
        kind: 'removable',
        size: 31_999_000_000,
        free: 5_000_000_000,
        path: '/media/alex/STICK',
        parent: '/dev/sdb',
      },
      {
        id: '/dev/sdc1',
        name: 'BACKUP',
        kind: 'removable',
        size: 1000,
        free: undefined,
        path: '/run/media/alex/BACKUP',
        parent: '/dev/sdc',
      },
    ]);
  });
});

describe('wifi', () => {
  it('finds the Wi-Fi device and whether it’s on', () => {
    const ports = `Hardware Port: Thunderbolt Bridge
Device: bridge0
Ethernet Address: N/A

Hardware Port: Wi-Fi
Device: en0
Ethernet Address: aa:bb:cc:dd:ee:ff
`;
    expect(parseWifiDevice(ports)).toBe('en0');
    expect(parseWifiDevice('Hardware Port: Ethernet\nDevice: en5\n')).toBeUndefined();
    expect(parseAirportPower('Wi-Fi Power (en0): On\n')).toBe(true);
    expect(parseAirportPower('Wi-Fi Power (en0): Off')).toBe(false);
    expect(parseRfkill('1: phy0: Wireless LAN\n\tSoft blocked: yes\n\tHard blocked: no\n')).toBe(false);
    expect(parseRfkill('1: phy0: Wireless LAN\n\tSoft blocked: no\n\tHard blocked: no\n')).toBe(true);
    expect(parseRfkill('')).toBeUndefined();
  });

  it('only asks Windows when there’s nothing to change', () => {
    expect(windowsWifiScript('')).toContain("$want = ''");
    expect(windowsWifiScript('off')).toContain("$want = 'off'");
    expect(windowsWifiScript('')).toContain("'IAsyncOperation`1'");
  });
});

describe('trash', () => {
  it('empties the Linux trash itself when gio isn’t there', async () => {
    const data = mkdtempSync(join(tmpdir(), 'open-palette-trash-'));
    const trash = linuxTrash({ XDG_DATA_HOME: data });
    mkdirSync(join(trash, 'files', 'old folder'), { recursive: true });
    mkdirSync(join(trash, 'info'), { recursive: true });
    writeFileSync(join(trash, 'files', 'old folder', 'a.txt'), 'a');
    writeFileSync(join(trash, 'info', 'old folder.trashinfo'), '[Trash Info]');
    const { exec, calls } = fakeExec({});
    await emptyTrash('linux', exec, { XDG_DATA_HOME: data });
    expect(calls).toEqual(['gio trash --empty']);
    expect(readdirSync(join(trash, 'files'))).toEqual([]);
    expect(readdirSync(join(trash, 'info'))).toEqual([]);
  });
});

describe('System commands', () => {
  it('asks before restarting, and goes back on Cancel', async () => {
    const { exec, calls } = fakeExec({ systemctl: '' });
    const { commands } = systemExtension({ platform: 'linux', exec });
    const view = (await commands.restart?.view?.({ query: '', platform: 'linux' })) as ListView;
    expect(view.sections[0]?.items.map((item) => item.title)).toEqual(['Restart Now', 'Cancel']);
    expect(await commands.restart?.onAction?.('cancel', undefined, { query: '', platform: 'linux' })).toEqual({
      pop: true,
    });
    expect(calls).toEqual([]);
    expect(await commands.restart?.onAction?.('confirm', undefined, { query: '', platform: 'linux' })).toEqual({
      hide: true,
    });
    expect(calls).toEqual(['systemctl reboot']);
  });

  it('says what permission is missing on macOS', async () => {
    const { exec } = fakeExec({
      osascript: new Error('execution error: Not authorized to send Apple events to Finder. (-1743)'),
    });
    const { commands } = systemExtension({ platform: 'darwin', exec });
    const result = await commands['empty-trash']?.onAction?.('confirm', undefined, { query: '', platform: 'darwin' });
    expect(result).toMatchObject({ toastStyle: 'failure', toast: expect.stringMatching(/control Finder/) });
  });

  it('lists disks and ejects them', async () => {
    const lsblk = JSON.stringify({
      blockdevices: [
        {
          name: 'sdb',
          path: '/dev/sdb',
          rm: true,
          type: 'disk',
          children: [{ name: 'sdb1', path: '/dev/sdb1', label: 'A', mountpoint: '/media/a', rm: true, type: 'part' }],
        },
        {
          name: 'sdc',
          path: '/dev/sdc',
          rm: true,
          type: 'disk',
          children: [{ name: 'sdc1', path: '/dev/sdc1', label: 'B', mountpoint: '/media/b', rm: true, type: 'part' }],
        },
      ],
    });
    const { exec, calls } = fakeExec({ lsblk, 'udisksctl unmount': '', 'udisksctl power-off': '' });
    const { commands } = systemExtension({ platform: 'linux', exec });
    const ctx = { query: '', platform: 'linux' as const };
    const view = (await commands.eject?.view?.(ctx)) as ListView;
    const items = view.sections[0]?.items ?? [];
    expect(items.map((item) => item.title)).toEqual(['Eject All', 'A', 'B']);
    const eject = items[1]?.actions[0];
    if (eject?.type !== 'callback') throw new Error('expected a callback');
    const result = await commands.eject?.onAction?.(eject.id, eject.payload, ctx);
    expect(result).toMatchObject({ toast: 'Ejected A' });
    expect(calls).toContain('udisksctl unmount --no-user-interaction -b /dev/sdb1');
    expect(calls).toContain('udisksctl power-off --no-user-interaction -b /dev/sdb');
  });

  it('turns Wi-Fi off when it’s on', async () => {
    const { exec, calls } = fakeExec({
      'networksetup -listallhardwareports': 'Hardware Port: Wi-Fi\nDevice: en1\n',
      'networksetup -getairportpower': 'Wi-Fi Power (en1): On',
      'networksetup -setairportpower': '',
    });
    const { commands } = systemExtension({ platform: 'darwin', exec });
    expect(await commands['toggle-wifi']?.run?.({ query: '', platform: 'darwin' })).toEqual({ toast: 'Wi-Fi is off' });
    expect(calls).toContain('networksetup -setairportpower en1 off');
  });

  it('explains a computer without Wi-Fi', async () => {
    const { exec } = fakeExec({ 'networksetup -listallhardwareports': 'Hardware Port: Ethernet\nDevice: en0\n' });
    const { commands } = systemExtension({ platform: 'darwin', exec });
    expect(await commands['toggle-wifi']?.run?.({ query: '', platform: 'darwin' })).toMatchObject({
      toast: "This computer doesn't have Wi-Fi.",
    });
  });
});
