import { describe, expect, it } from 'vitest';
import {
  appBundleOf,
  formatMemory,
  isEssential,
  mergePs,
  parsePsNames,
  parsePsStats,
  parseTasklist,
  sortProcesses,
} from './processes.js';

const STATS = [
  '    1     0   0.0  13456 root             /sbin/launchd',
  '  501     1  12.5 251904 alex             /Applications/Google Chrome.app/Contents/MacOS/Google Chrome --flag',
  '  640   501   0,3  10240 alex             node /Users/alex/app/server.js',
  'garbage line',
].join('\n');

const NAMES = [
  '    1 /sbin/launchd',
  '  501 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '  640 node',
].join('\n');

describe('parsePsStats', () => {
  it('reads each process, with spaces in the command line', () => {
    const stats = parsePsStats(STATS);
    expect(stats.size).toBe(3);
    expect(stats.get(501)).toEqual({
      pid: 501,
      ppid: 1,
      cpu: 12.5,
      memory: 251904 * 1024,
      user: 'alex',
      command: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --flag',
    });
  });

  it('reads a decimal comma in the CPU column', () => {
    expect(parsePsStats(STATS).get(640)?.cpu).toBe(0.3);
  });
});

describe('mergePs', () => {
  it('names each process after its program', () => {
    const procs = mergePs(parsePsStats(STATS), parsePsNames(NAMES));
    expect(procs.map((proc) => [proc.pid, proc.name, proc.executable])).toEqual([
      [1, 'launchd', '/sbin/launchd'],
      [501, 'Google Chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
      [640, 'node', undefined],
    ]);
  });

  it('takes the full name from the command line when Linux cut it short', () => {
    const stats = parsePsStats('  900     1   1.0  2048 alex /usr/lib/gnome-settings-daemon --x');
    const names = parsePsNames('  900 gnome-settings-');
    expect(mergePs(stats, names)[0]?.name).toBe('gnome-settings-daemon');
  });
});

describe('parseTasklist', () => {
  it('reads names, IDs and memory in any digit grouping', () => {
    const output = [
      '"System Idle Process","0","Services","0","8 K"',
      '"chrome.exe","1234","Console","1","150,312 K"',
      '"node.exe","4321","Console","1","48.200 K"',
    ].join('\r\n');
    expect(parseTasklist(output)).toEqual([
      { pid: 0, name: 'System Idle Process', memory: 8 * 1024 },
      { pid: 1234, name: 'chrome', memory: 150312 * 1024 },
      { pid: 4321, name: 'node', memory: 48200 * 1024 },
    ]);
  });
});

describe('appBundleOf', () => {
  it('finds the .app a program is in', () => {
    expect(appBundleOf('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')).toBe(
      '/Applications/Google Chrome.app',
    );
    expect(appBundleOf('/usr/bin/node')).toBeUndefined();
    expect(appBundleOf(undefined)).toBeUndefined();
  });
});

describe('formatMemory', () => {
  it('picks a sensible unit', () => {
    expect(formatMemory(512)).toBe('1 KB');
    expect(formatMemory(250 * 1024 ** 2)).toBe('250 MB');
    expect(formatMemory(1.25 * 1024 ** 3)).toBe('1.3 GB');
  });
});

describe('sortProcesses', () => {
  it('puts the busiest first', () => {
    const sorted = sortProcesses([
      { pid: 1, name: 'a', cpu: 1, memory: 10 },
      { pid: 2, name: 'b', cpu: 30, memory: 5 },
      { pid: 3, name: 'c', cpu: 1, memory: 50 },
    ]);
    expect(sorted.map((proc) => proc.pid)).toEqual([2, 3, 1]);
  });
});

describe('isEssential', () => {
  it('protects what the system needs', () => {
    expect(isEssential({ pid: 1, name: 'launchd', memory: 0 })).toBe(true);
    expect(isEssential({ pid: 300, name: 'WindowServer', memory: 0 })).toBe(true);
    expect(isEssential({ pid: 700, name: 'csrss', memory: 0 })).toBe(true);
    expect(isEssential({ pid: 640, name: 'node', memory: 0 })).toBe(false);
  });
});
