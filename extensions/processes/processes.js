/**
 * Reading the running processes from `ps` (macOS, Linux) and `tasklist` (Windows).
 */
import { basename } from 'node:path';

/**
 * @typedef {object} Proc
 * @property {number} pid
 * @property {number} [ppid]
 * @property {string} name
 * @property {number} [cpu] Percent of one core.
 * @property {number} memory Resident memory in bytes.
 * @property {string} [user]
 * @property {string} [command] The full command line.
 * @property {string} [executable] The program's path, where the system tells.
 */

/**
 * `ps -axww -o pid=,ppid=,pcpu=,rss=,user=,args=`: everything but the program's name, which
 * comes from a second call because the command line can have spaces anywhere.
 * @param {string} output
 * @returns {Map<number, Omit<Proc, 'name'>>}
 */
export function parsePsStats(output) {
  /** @type {Map<number, Omit<Proc, 'name'>>} */
  const stats = new Map();
  for (const line of output.split(/\r?\n/)) {
    const match = /^\s*(\d+)\s+(\d+)\s+([\d.,]+)\s+(\d+)\s+(\S+)\s?(.*)$/.exec(line);
    if (!match) continue;
    const pid = Number(match[1]);
    stats.set(pid, {
      pid,
      ppid: Number(match[2]),
      cpu: Number((match[3] ?? '0').replace(',', '.')),
      memory: Number(match[4]) * 1024,
      user: match[5] ?? '',
      command: (match[6] ?? '').trim(),
    });
  }
  return stats;
}

/**
 * `ps -axww -o pid=,comm=`: the program for each process. On macOS that's its full path.
 * @param {string} output
 * @returns {Map<number, string>}
 */
export function parsePsNames(output) {
  /** @type {Map<number, string>} */
  const names = new Map();
  for (const line of output.split(/\r?\n/)) {
    const match = /^\s*(\d+)\s+(.+)$/.exec(line);
    if (match?.[1] && match[2]) names.set(Number(match[1]), match[2].trim());
  }
  return names;
}

/**
 * One list from both `ps` calls. Linux cuts `comm` to 15 characters, so a longer name is taken
 * from the command line when that starts with it.
 * @param {Map<number, Omit<Proc, 'name'>>} stats
 * @param {Map<number, string>} names
 * @returns {Proc[]}
 */
export function mergePs(stats, names) {
  return [...stats.values()].map((proc) => {
    const comm = names.get(proc.pid) ?? '';
    const first = (proc.command ?? '').split(' ')[0] ?? '';
    let name = basename(comm) || basename(first) || `Process ${proc.pid}`;
    const fromCommand = basename(first);
    if (name.length === 15 && fromCommand.startsWith(name)) name = fromCommand;
    // Kernel threads on Linux show as "[kworker/0:1]".
    if (!comm && first.startsWith('[')) name = proc.command ?? name;
    return comm.startsWith('/') ? { ...proc, name, executable: comm } : { ...proc, name };
  });
}

/**
 * `tasklist /FO CSV /NH`: `"chrome.exe","1234","Console","1","150,312 K"`. The memory column
 * uses the system's digit grouping, so every non-digit is dropped.
 * @param {string} output
 * @returns {Proc[]}
 */
export function parseTasklist(output) {
  /** @type {Proc[]} */
  const procs = [];
  for (const line of output.split(/\r?\n/)) {
    const cells = [...line.matchAll(/"([^"]*)"/g)].map((match) => match[1] ?? '');
    if (cells.length < 5) continue;
    const pid = Number(cells[1]);
    if (!Number.isInteger(pid)) continue;
    const kb = Number((cells[4] ?? '').replace(/\D/g, ''));
    procs.push({ pid, name: (cells[0] ?? '').replace(/\.exe$/i, ''), memory: kb * 1024 });
  }
  return procs;
}

/**
 * The .app a macOS program lives in, so the list can show the app's icon.
 * @param {string | undefined} executable
 */
export function appBundleOf(executable) {
  return executable ? /^(.+?\.app)\//.exec(executable)?.[1] : undefined;
}

/**
 * `245 MB`, `1.2 GB`.
 * @param {number} bytes
 */
export function formatMemory(bytes) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Busiest first: by CPU, then memory.
 * @param {Proc[]} procs
 */
export function sortProcesses(procs) {
  return [...procs].sort((a, b) => (b.cpu ?? 0) - (a.cpu ?? 0) || b.memory - a.memory || a.pid - b.pid);
}

/** Programs the system needs; quitting them would log you out or crash the desktop. */
const ESSENTIAL = new Set([
  'launchd',
  'kernel_task',
  'WindowServer',
  'loginwindow',
  'systemd',
  'init',
  'System',
  'System Idle Process',
  'Registry',
  'smss',
  'csrss',
  'wininit',
  'winlogon',
  'services',
  'lsass',
  'dwm',
]);

/** @param {Proc} proc */
export function isEssential(proc) {
  return proc.pid <= 4 || ESSENTIAL.has(proc.name);
}
