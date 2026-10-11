import { describe, expect, it } from 'vitest';
import {
  cpuUsage,
  formatBytes,
  formatUptime,
  linuxBattery,
  linuxMemory,
  linuxName,
  localAddresses,
  macMemoryUsed,
  macOSName,
  parseHardwarePorts,
  parsePmset,
  parseWindowsBattery,
  windowsName,
} from './info.js';

describe('battery', () => {
  it('reads pmset', () => {
    expect(
      parsePmset(
        "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=6488163)\t84%; discharging; 5:12 remaining present: true\n",
      ),
    ).toEqual({ percent: 84, state: 'discharging', minutesLeft: 312, onPower: false });
    expect(
      parsePmset(
        "Now drawing from 'AC Power'\n -InternalBattery-0 (id=1)\t57%; charging; 1:23 remaining present: true",
      ),
    ).toEqual({ percent: 57, state: 'charging', minutesLeft: 83, onPower: true });
    expect(
      parsePmset(
        "Now drawing from 'AC Power'\n -InternalBattery-0 (id=1)\t100%; charged; 0:00 remaining present: true",
      ),
    ).toMatchObject({ state: 'charged', minutesLeft: undefined });
    expect(
      parsePmset(
        "Now drawing from 'AC Power'\n -InternalBattery-0 (id=1)\t80%; AC attached; not charging present: true",
      ),
    ).toMatchObject({ state: 'not-charging' });
    // A desktop Mac has no battery line.
    expect(parsePmset("Now drawing from 'AC Power'\n")).toBeUndefined();
  });

  it('reads a Linux battery, by energy or by charge', () => {
    expect(
      linuxBattery({ capacity: '64', status: 'Discharging', energy_now: '30000000', power_now: '10000000' }),
    ).toEqual({ percent: 64, state: 'discharging', minutesLeft: 180, onPower: false });
    expect(
      linuxBattery({
        capacity: '50',
        status: 'Charging',
        charge_now: '2000000',
        charge_full: '4000000',
        current_now: '1000000',
      }),
    ).toMatchObject({ state: 'charging', minutesLeft: 120 });
    expect(linuxBattery({ status: 'Full' })).toBeUndefined();
  });

  it('reads Windows batteries', () => {
    expect(parseWindowsBattery('{"EstimatedChargeRemaining":91,"BatteryStatus":1,"EstimatedRunTime":240}')).toEqual({
      percent: 91,
      state: 'discharging',
      minutesLeft: 240,
      onPower: false,
    });
    expect(
      parseWindowsBattery('[{"EstimatedChargeRemaining":40,"BatteryStatus":6,"EstimatedRunTime":71582788}]'),
    ).toMatchObject({ state: 'charging', minutesLeft: undefined });
    expect(parseWindowsBattery('')).toBeUndefined();
  });
});

describe('CPU and memory', () => {
  /** @param {number} busy @param {number} idle */
  const cpu = (busy, idle) => ({ model: 'x', speed: 1, times: { user: busy, nice: 0, sys: 0, idle, irq: 0 } });

  it('measures CPU use between two readings', () => {
    expect(cpuUsage([cpu(100, 100), cpu(0, 0)], [cpu(150, 150), cpu(100, 0)])).toBeCloseTo(150 / 200);
    expect(cpuUsage([cpu(1, 1)], [cpu(1, 1)])).toBe(0);
  });

  it('counts macOS memory like Activity Monitor', () => {
    const vmStat = `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                               12000.
Pages active:                            400000.
Pages inactive:                          380000.
Pages wired down:                        150000.
Pages purgeable:                          10000.
Anonymous pages:                         350000.
Pages occupied by compressor:             50000.
`;
    expect(macMemoryUsed(vmStat)).toBe((350000 - 10000 + 150000 + 50000) * 16384);
    expect(macMemoryUsed('nothing')).toBeUndefined();
  });

  it('counts Linux memory without caches', () => {
    expect(linuxMemory('MemTotal:       16000000 kB\nMemFree:  1000 kB\nMemAvailable:   12000000 kB\n')).toEqual({
      total: 16_000_000 * 1024,
      used: 4_000_000 * 1024,
    });
  });
});

describe('network', () => {
  it('names macOS devices', () => {
    expect(
      parseHardwarePorts(
        'Hardware Port: Wi-Fi\nDevice: en0\nEthernet Address: x\n\nHardware Port: Thunderbolt Ethernet Slot 1\nDevice: en5\n',
      ),
    ).toEqual({
      en0: 'Wi-Fi',
      en5: 'Thunderbolt Ethernet Slot 1',
    });
  });

  it('lists real addresses, IPv4 first', () => {
    /** @param {string} address @param {'IPv4' | 'IPv6'} family @param {boolean} [internal] */
    const info = (address, family, internal = false) => ({
      address,
      family,
      internal,
      netmask: '',
      mac: '',
      cidr: null,
      ...(family === 'IPv6' ? { scopeid: 0 } : {}),
    });
    const addresses = localAddresses(
      {
        lo0: [info('127.0.0.1', 'IPv4', true)],
        en0: [info('fe80::1', 'IPv6'), info('2a02:1210::5', 'IPv6'), info('192.168.1.20', 'IPv4')],
        docker0: [info('172.17.0.1', 'IPv4')],
        wlp2s0: [info('10.0.0.7', 'IPv4')],
      },
      { en0: 'Wi-Fi' },
    );
    expect(addresses.map((a) => `${a.name} ${a.address}`)).toEqual([
      'Wi-Fi 192.168.1.20',
      'Wi-Fi 10.0.0.7',
      'Wi-Fi 2a02:1210::5',
    ]);
  });
});

describe('names and formats', () => {
  it('names the system', () => {
    expect(macOSName('15.1\n')).toBe('macOS Sequoia 15.1');
    expect(macOSName('27.0')).toBe('macOS 27.0');
    expect(windowsName('Windows 10 Pro', '10.0.22631')).toBe('Windows 11 Pro (build 22631)');
    expect(windowsName('Windows 10 Home', '10.0.19045')).toBe('Windows 10 Home (build 19045)');
    expect(linuxName('NAME="Ubuntu"\nPRETTY_NAME="Ubuntu 24.04.1 LTS"\n')).toBe('Ubuntu 24.04.1 LTS');
    expect(linuxName('')).toBe('Linux');
  });

  it('formats sizes and times', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(15_400_000_000)).toBe('15.4 GB');
    expect(formatBytes(494_000_000_000)).toBe('494 GB');
    expect(formatUptime(3 * 86_400 + 4 * 3600 + 59)).toBe('3 days, 4 hours');
    expect(formatUptime(3600 + 60)).toBe('1 hour, 1 minute');
    expect(formatUptime(5)).toBe('1 minute');
  });
});
