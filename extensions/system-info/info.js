// Reading battery, memory, network and OS details from what each system's tools print. Pure
// functions, so they can be tested with sample output from any system.

/**
 * @typedef {object} Battery
 * @property {number} percent
 * @property {'charging' | 'discharging' | 'charged' | 'not-charging'} state
 * @property {number} [minutesLeft] Until empty when discharging, until full when charging.
 * @property {boolean} [onPower] Plugged in.
 */

/**
 * Reads `pmset -g batt`.
 * @param {string} output
 * @returns {Battery | undefined}
 */
export function parsePmset(output) {
  const line = output.split('\n').find((l) => /\d+%;/.test(l));
  if (!line) return undefined;
  const percent = Number(/(\d+)%;/.exec(line)?.[1]);
  const status = (/\d+%;\s*([^;]+);/.exec(line)?.[1] ?? '').trim().toLowerCase();
  const time = /(\d+):(\d{2}) remaining/.exec(line);
  const onPower = /'AC Power'/.test(output);
  /** @type {Battery['state']} */
  const state =
    status === 'charging'
      ? 'charging'
      : status === 'charged' || status === 'finishing charge'
        ? 'charged'
        : status === 'discharging'
          ? 'discharging'
          : 'not-charging';
  const minutes = time ? Number(time[1]) * 60 + Number(time[2]) : undefined;
  return {
    percent,
    state,
    minutesLeft: minutes && (state === 'charging' || state === 'discharging') ? minutes : undefined,
    onPower,
  };
}

/**
 * Reads a battery from its files in /sys/class/power_supply.
 * @param {Record<string, string | undefined>} files `capacity`, `status`, and `energy_now`/`power_now` or `charge_now`/`current_now` and the `_full` ones.
 * @returns {Battery | undefined}
 */
export function linuxBattery(files) {
  const percent = Number(files.capacity);
  if (!files.capacity || !Number.isFinite(percent)) return undefined;
  const status = (files.status ?? '').trim().toLowerCase();
  /** @type {Battery['state']} */
  const state =
    status === 'charging'
      ? 'charging'
      : status === 'discharging'
        ? 'discharging'
        : status === 'full'
          ? 'charged'
          : 'not-charging';
  const num = (/** @type {string | undefined} */ v) => (v === undefined ? Number.NaN : Number(v));
  const now = num(files.energy_now ?? files.charge_now);
  const full = num(files.energy_full ?? files.charge_full);
  const rate = Math.abs(num(files.power_now ?? files.current_now));
  let minutesLeft;
  if (rate > 0 && Number.isFinite(now)) {
    if (state === 'discharging') minutesLeft = Math.round((now / rate) * 60);
    else if (state === 'charging' && Number.isFinite(full)) minutesLeft = Math.round(((full - now) / rate) * 60);
  }
  return { percent, state, minutesLeft, onPower: state !== 'discharging' };
}

/**
 * Reads `Get-CimInstance Win32_Battery | ConvertTo-Json`: an object, a list, or nothing.
 * @param {string} output
 * @returns {Battery | undefined}
 */
export function parseWindowsBattery(output) {
  if (!output.trim()) return undefined;
  const parsed = JSON.parse(output);
  const battery = /** @type {Record<string, unknown> | undefined} */ (Array.isArray(parsed) ? parsed[0] : parsed);
  const percent = Number(battery?.EstimatedChargeRemaining);
  if (!battery || !Number.isFinite(percent)) return undefined;
  const status = Number(battery.BatteryStatus);
  /** @type {Battery['state']} */
  const state = [6, 7, 8, 9].includes(status)
    ? 'charging'
    : status === 3
      ? 'charged'
      : status === 1 || status === 4 || status === 5
        ? 'discharging'
        : 'not-charging';
  const runtime = Number(battery.EstimatedRunTime);
  // 71582788 minutes means "unknown", which Windows reports while plugged in.
  const minutesLeft = state === 'discharging' && runtime > 0 && runtime < 71_582_788 ? runtime : undefined;
  return { percent, state, minutesLeft, onPower: state !== 'discharging' };
}

/**
 * The share of CPU time spent busy between two `os.cpus()` readings, from 0 to 1.
 * @param {import('node:os').CpuInfo[]} before
 * @param {import('node:os').CpuInfo[]} after
 */
export function cpuUsage(before, after) {
  let busy = 0;
  let total = 0;
  after.forEach((cpu, index) => {
    const previous = before[index];
    if (!previous) return;
    const delta = (/** @type {keyof import('node:os').CpuInfo['times']} */ key) => cpu.times[key] - previous.times[key];
    const all = delta('user') + delta('nice') + delta('sys') + delta('idle') + delta('irq');
    total += all;
    busy += all - delta('idle');
  });
  return total > 0 ? Math.min(1, Math.max(0, busy / total)) : 0;
}

/**
 * Memory in use on macOS from `vm_stat`, counted as Activity Monitor does: app memory, wired
 * and compressed, but not cached files.
 * @param {string} output
 * @returns {number | undefined} Bytes.
 */
export function macMemoryUsed(output) {
  const pageSize = Number(/page size of (\d+) bytes/.exec(output)?.[1] ?? 4096);
  /** @param {string} label */
  const pages = (label) => {
    const match = new RegExp(`^${label}:\\s+(\\d+)`, 'm').exec(output);
    return match ? Number(match[1]) : undefined;
  };
  const wired = pages('Pages wired down');
  const compressed = pages('Pages occupied by compressor') ?? 0;
  const anonymous = pages('Anonymous pages');
  const purgeable = pages('Pages purgeable') ?? 0;
  const active = pages('Pages active');
  if (wired === undefined) return undefined;
  const app = anonymous !== undefined ? Math.max(0, anonymous - purgeable) : (active ?? 0);
  return (app + wired + compressed) * pageSize;
}

/**
 * Memory in use on Linux from /proc/meminfo: everything but what's available, which counts
 * caches the kernel can drop.
 * @param {string} meminfo
 * @returns {{ total: number, used: number } | undefined}
 */
export function linuxMemory(meminfo) {
  /** @param {string} key */
  const kb = (key) => {
    const match = new RegExp(`^${key}:\\s+(\\d+) kB`, 'm').exec(meminfo);
    return match ? Number(match[1]) * 1024 : undefined;
  };
  const total = kb('MemTotal');
  const available = kb('MemAvailable');
  if (total === undefined || available === undefined) return undefined;
  return { total, used: Math.max(0, total - available) };
}

/**
 * "15.4 GB", "512 MB". Decimal units, as macOS and most disk makers count.
 * @param {number | undefined} bytes
 */
export function formatBytes(bytes) {
  if (bytes === undefined || !Number.isFinite(bytes)) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/**
 * "3 days, 4 hours", "2 hours, 5 minutes", "1 minute".
 * @param {number} seconds
 */
export function formatUptime(seconds) {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const part = (/** @type {number} */ n, /** @type {string} */ unit) => `${n} ${unit}${n === 1 ? '' : 's'}`;
  if (days > 0) return hours > 0 ? `${part(days, 'day')}, ${part(hours, 'hour')}` : part(days, 'day');
  if (hours > 0) return minutes > 0 ? `${part(hours, 'hour')}, ${part(minutes, 'minute')}` : part(hours, 'hour');
  return part(Math.max(minutes, 1), 'minute');
}

/** "1:05" from minutes. @param {number} minutes */
export function formatMinutes(minutes) {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

/** @type {Record<number, string>} */
const MACOS_NAMES = { 11: 'Big Sur', 12: 'Monterey', 13: 'Ventura', 14: 'Sonoma', 15: 'Sequoia', 26: 'Tahoe' };

/**
 * "macOS Sequoia 15.1".
 * @param {string} version What `sw_vers -productVersion` prints.
 */
export function macOSName(version) {
  const v = version.trim();
  const name = MACOS_NAMES[Number(v.split('.')[0])];
  return name ? `macOS ${name} ${v}` : `macOS ${v}`;
}

/**
 * Windows 11 still calls itself Windows 10 in some places; its build numbers start at 22000.
 * @param {string} version `os.version()`, e.g. "Windows 10 Pro".
 * @param {string} release `os.release()`, e.g. "10.0.22631".
 */
export function windowsName(version, release) {
  const build = Number(release.split('.')[2]);
  const name = build >= 22_000 ? version.replace(/Windows 10/, 'Windows 11') : version;
  return Number.isFinite(build) ? `${name} (build ${build})` : name;
}

/**
 * The PRETTY_NAME of /etc/os-release, e.g. "Ubuntu 24.04.1 LTS".
 * @param {string} osRelease
 */
export function linuxName(osRelease) {
  const match = /^PRETTY_NAME=(?:"([^"]*)"|'([^']*)'|(.*))$/m.exec(osRelease);
  return (match?.[1] ?? match?.[2] ?? match?.[3] ?? '').trim() || 'Linux';
}

/**
 * Maps devices to their names from `networksetup -listallhardwareports`: en0 → Wi-Fi.
 * @param {string} output
 * @returns {Record<string, string>}
 */
export function parseHardwarePorts(output) {
  /** @type {Record<string, string>} */
  const names = {};
  for (const block of output.split(/\n\s*\n/)) {
    const port = /Hardware Port:\s*(.+)/.exec(block)?.[1]?.trim();
    const device = /Device:\s*(\S+)/.exec(block)?.[1];
    if (port && device) names[device] = port;
  }
  return names;
}

/** Virtual interfaces of containers, VMs and bridges, which aren't how this computer is connected. */
const VIRTUAL = /^(docker|br-|veth|virbr|vmnet|vboxnet|lxc|lxd|cni|flannel|awdl|llw|bridge|anpi|ap\d|gif|stf)/i;

/**
 * @typedef {object} Address
 * @property {string} name What the connection is called: Wi-Fi, Ethernet, or the device.
 * @property {string} device
 * @property {string} address
 * @property {'IPv4' | 'IPv6'} family
 */

/**
 * The addresses this computer has on its networks: IPv4 first, then global IPv6, leaving out
 * loopback, link-local and virtual interfaces.
 * @param {NodeJS.Dict<import('node:os').NetworkInterfaceInfo[]>} interfaces
 * @param {Record<string, string>} [names] Friendly names by device.
 * @returns {Address[]}
 */
export function localAddresses(interfaces, names = {}) {
  /** @type {Address[]} */
  const addresses = [];
  for (const [device, infos] of Object.entries(interfaces)) {
    if (!infos || VIRTUAL.test(device)) continue;
    for (const info of infos) {
      if (info.internal) continue;
      const family = info.family === 'IPv4' || /** @type {unknown} */ (info.family) === 4 ? 'IPv4' : 'IPv6';
      if (family === 'IPv6' && /^(fe80|fd|fc)/i.test(info.address)) continue;
      addresses.push({ name: names[device] ?? friendlyDevice(device), device, address: info.address, family });
    }
  }
  return addresses.sort((a, b) => (a.family === b.family ? 0 : a.family === 'IPv4' ? -1 : 1));
}

/**
 * Linux devices are named by kind: wl… is wireless, en… and eth… are wired.
 * @param {string} device
 */
export function friendlyDevice(device) {
  if (/^wl/.test(device)) return 'Wi-Fi';
  if (/^(en|eth)/.test(device) && !/^en\d+$/.test(device)) return 'Ethernet';
  return device;
}
