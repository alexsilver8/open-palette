import type { Platform } from '../../shared/types';
import { type Exec, isMissing, powershellArgs } from '../exec';

/** Finds the Wi-Fi device (like `en0`) in `networksetup -listallhardwareports`. */
export function parseWifiDevice(output: string): string | undefined {
  const blocks = output.split(/\n\s*\n/);
  for (const block of blocks) {
    if (!/Hardware Port:\s*(Wi-Fi|AirPort)\s*$/m.test(block)) continue;
    const device = /Device:\s*(\S+)/.exec(block)?.[1];
    if (device) return device;
  }
  return undefined;
}

/** Reads `networksetup -getairportpower en0`: "Wi-Fi Power (en0): On". */
export function parseAirportPower(output: string): boolean | undefined {
  const value = /:\s*(On|Off)\s*$/im.exec(output.trim())?.[1];
  return value === undefined ? undefined : value.toLowerCase() === 'on';
}

/** Reads `rfkill list wifi`: on unless something blocks it. */
export function parseRfkill(output: string): boolean | undefined {
  if (!/Wireless LAN|wlan|wifi/i.test(output)) return undefined;
  return !/blocked:\s*yes/i.test(output);
}

/**
 * Windows turns radios on and off through WinRT, which needs no administrator rights (unlike
 * disabling the adapter). Prints On, Off or None. `state` is `on`, `off` or empty to only ask.
 */
export function windowsWifiScript(state: '' | 'on' | 'off'): string {
  return `$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function Await($operation, [Type]$type) {
  $task = $asTask.MakeGenericMethod($type).Invoke($null, @($operation))
  $task.Wait(-1) | Out-Null
  $task.Result
}
[Windows.Devices.Radios.Radio, Windows.System.Devices, ContentType = WindowsRuntime] | Out-Null
[Windows.Devices.Radios.RadioAccessStatus, Windows.System.Devices, ContentType = WindowsRuntime] | Out-Null
Await ([Windows.Devices.Radios.Radio]::RequestAccessAsync()) ([Windows.Devices.Radios.RadioAccessStatus]) | Out-Null
$radios = Await ([Windows.Devices.Radios.Radio]::GetRadiosAsync()) ([System.Collections.Generic.IReadOnlyList[Windows.Devices.Radios.Radio]])
$wifi = $radios | Where-Object { $_.Kind -eq 'WiFi' } | Select-Object -First 1
if (-not $wifi) { 'None'; exit }
$want = '${state}'
if ($want) {
  $result = Await ($wifi.SetStateAsync($(if ($want -eq 'on') { 'On' } else { 'Off' }))) ([Windows.Devices.Radios.RadioAccessStatus])
  if ("$result" -ne 'Allowed') { throw "Windows didn't allow changing Wi-Fi ($result)." }
}
"$($wifi.State)"`;
}

export class WifiError extends Error {}

const NO_WIFI = "This computer doesn't have Wi-Fi.";

/** Whether Wi-Fi is on. */
export async function wifiPower(platform: Platform, exec: Exec): Promise<boolean> {
  switch (platform) {
    case 'darwin': {
      const on = parseAirportPower(await exec('networksetup', ['-getairportpower', await macDevice(exec)]));
      if (on === undefined) throw new WifiError("Couldn't tell whether Wi-Fi is on.");
      return on;
    }
    case 'win32':
      return windowsState(await exec('powershell.exe', powershellArgs(windowsWifiScript('')), 15_000));
    case 'linux':
      try {
        return (await exec('nmcli', ['radio', 'wifi'])).trim() === 'enabled';
      } catch (error) {
        if (!isMissing(error)) throw error;
        const on = parseRfkill(await exec('rfkill', ['list', 'wifi']));
        if (on === undefined) throw new WifiError(NO_WIFI);
        return on;
      }
  }
}

/** Turns Wi-Fi on or off. */
export async function setWifiPower(on: boolean, platform: Platform, exec: Exec): Promise<void> {
  switch (platform) {
    case 'darwin':
      await exec('networksetup', ['-setairportpower', await macDevice(exec), on ? 'on' : 'off']);
      return;
    case 'win32':
      windowsState(await exec('powershell.exe', powershellArgs(windowsWifiScript(on ? 'on' : 'off')), 15_000));
      return;
    case 'linux':
      try {
        await exec('nmcli', ['radio', 'wifi', on ? 'on' : 'off']);
      } catch (error) {
        if (!isMissing(error)) throw error;
        await exec('rfkill', [on ? 'unblock' : 'block', 'wifi']);
      }
  }
}

async function macDevice(exec: Exec): Promise<string> {
  const device = parseWifiDevice(await exec('networksetup', ['-listallhardwareports']));
  if (!device) throw new WifiError(NO_WIFI);
  return device;
}

function windowsState(output: string): boolean {
  const state = output.trim().split(/\r?\n/).pop()?.trim();
  if (state === 'None') throw new WifiError(NO_WIFI);
  return state === 'On';
}
