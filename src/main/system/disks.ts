import { readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { Platform } from '../../shared/types';
import { type Exec, isMissing, powershellArgs, reasonOf } from '../exec';

/** A disk or volume you can eject: a USB drive, an SD card, a disk image or a network share. */
export interface Disk {
  /** What to hand back to {@link ejectDisk}: a mount point, drive letter or device. */
  id: string;
  name: string;
  kind: 'removable' | 'image' | 'network' | 'optical';
  /** Bytes. */
  size?: number;
  free?: number;
  /** Where it's mounted, for showing in Finder or Explorer. */
  path?: string;
  /** Linux: the whole disk a partition is on, to power it off once unmounted. */
  parent?: string;
}

// ── macOS ────────────────────────────────────────────────────────────────────

/** The values of a flat plist dictionary, as `diskutil info -plist` prints. */
export function parsePlist(xml: string): Record<string, string | number | boolean> {
  const values: Record<string, string | number | boolean> = {};
  const pattern = /<key>([^<]*)<\/key>\s*(?:<(true|false)\/>|<string>([^<]*)<\/string>|<integer>(-?\d+)<\/integer>)/g;
  for (const match of xml.matchAll(pattern)) {
    const [, key, bool, text, integer] = match;
    if (!key) continue;
    if (bool) values[key] = bool === 'true';
    else if (integer !== undefined) values[key] = Number(integer);
    else if (text !== undefined) values[key] = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  }
  return values;
}

/** Whether `diskutil info` describes something Finder would show an eject button for. */
export function macDiskFromInfo(path: string, info: Record<string, string | number | boolean>): Disk | undefined {
  const image = info.BusProtocol === 'Disk Image';
  const external = info.Internal === false || info.RemovableMediaOrExternalDevice === true || info.Ejectable === true;
  if (!image && !external) return undefined;
  const optical = typeof info.OpticalMediaType === 'string' || info.BusProtocol === 'ATAPI';
  const number = (value: unknown) => (typeof value === 'number' && value > 0 ? value : undefined);
  return {
    id: path,
    name: typeof info.VolumeName === 'string' && info.VolumeName ? info.VolumeName : path.split('/').pop() || path,
    kind: image ? 'image' : optical ? 'optical' : 'removable',
    size: number(info.TotalSize) ?? number(info.Size) ?? number(info.VolumeSize),
    free: number(info.FreeSpace) ?? number(info.APFSContainerFree) ?? number(info.VolumeFreeSpace),
    path,
  };
}

/** Network file systems as `mount` names them. */
const NETWORK_FS = /\((smbfs|afpfs|nfs|webdav|cifs|ftp)\b/;

async function macDisks(exec: Exec): Promise<Disk[]> {
  const root = await realpath('/');
  const entries = await readdir('/Volumes').catch(() => [] as string[]);
  const mounts = await exec('mount', []).catch(() => '');
  const disks = await Promise.all(
    entries.map(async (entry): Promise<Disk | undefined> => {
      const path = join('/Volumes', entry);
      // The startup disk appears here as a link to /.
      if ((await realpath(path).catch(() => root)) === root) return undefined;
      const line = mounts.split('\n').find((l) => l.includes(` on ${path} (`));
      if (!line) return undefined;
      if (NETWORK_FS.test(line)) return { id: path, name: entry, kind: 'network', path };
      try {
        return macDiskFromInfo(path, parsePlist(await exec('diskutil', ['info', '-plist', path])));
      } catch {
        return undefined;
      }
    }),
  );
  return disks.filter((disk): disk is Disk => disk !== undefined);
}

// ── Windows ──────────────────────────────────────────────────────────────────

/**
 * Removable drives, discs and mounted images, plus partitions of USB disks (which Windows
 * often counts as fixed drives).
 */
export const WINDOWS_LIST_DISKS = `$ErrorActionPreference = 'Stop'
$usb = @()
try {
  $usb = @(Get-Disk | Where-Object { $_.BusType -eq 'USB' } | Get-Partition | Where-Object { $_.DriveLetter } | ForEach-Object { "$($_.DriveLetter):" })
} catch {}
$images = @()
try {
  $images = @(Get-Volume | Where-Object { $_.DriveLetter } | Where-Object { (Get-DiskImage -Volume $_ -ErrorAction SilentlyContinue) } | ForEach-Object { "$($_.DriveLetter):" })
} catch {}
$drives = @(Get-CimInstance Win32_LogicalDisk | Where-Object { $_.Size -and ($_.DriveType -eq 2 -or $_.DriveType -eq 5 -or $usb -contains $_.DeviceID -or $images -contains $_.DeviceID) } | ForEach-Object {
  [pscustomobject]@{ id = $_.DeviceID; name = $_.VolumeName; type = $_.DriveType; size = $_.Size; free = $_.FreeSpace; image = ($images -contains $_.DeviceID) }
})
ConvertTo-Json -InputObject $drives -Compress`;

interface WindowsDrive {
  id?: string;
  name?: string | null;
  type?: number;
  size?: number | null;
  free?: number | null;
  image?: boolean;
}

export function parseWindowsDisks(output: string): Disk[] {
  const parsed = JSON.parse(output.trim() || '[]') as WindowsDrive[] | WindowsDrive;
  const drives = Array.isArray(parsed) ? parsed : [parsed];
  return drives.flatMap((drive) => {
    if (!drive.id || !/^[A-Z]:$/i.test(drive.id)) return [];
    const kind: Disk['kind'] = drive.image ? 'image' : drive.type === 5 ? 'optical' : 'removable';
    return [
      {
        id: drive.id.toUpperCase(),
        name: drive.name ? `${drive.name} (${drive.id.toUpperCase()})` : `Drive ${drive.id.toUpperCase()}`,
        kind,
        size: drive.size ?? undefined,
        free: drive.free ?? undefined,
        path: `${drive.id.toUpperCase()}\\`,
      },
    ];
  });
}

/**
 * Ejects a drive the way Explorer's Eject does; a mounted image is dismounted instead.
 * `drive` is a drive letter like `E:`.
 */
export function windowsEjectScript(drive: string): string {
  const letter = drive
    .replace(/[^A-Za-z]/g, '')
    .slice(0, 1)
    .toUpperCase();
  return `$ErrorActionPreference = 'Stop'
$image = $null
try { $image = Get-Volume -DriveLetter '${letter}' | Get-DiskImage -ErrorAction SilentlyContinue } catch {}
if ($image -and $image.ImagePath) {
  Dismount-DiskImage -ImagePath $image.ImagePath | Out-Null
} else {
  $item = (New-Object -ComObject Shell.Application).Namespace(17).ParseName('${letter}:')
  if (-not $item) { throw "There's no drive ${letter}:." }
  $item.InvokeVerb('Eject')
  # Eject doesn't say whether it worked; the drive going away does.
  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 250
    if (-not (Test-Path '${letter}:\\')) { exit 0 }
  }
  throw "${letter}: is still there; it may be in use."
}`;
}

// ── Linux ────────────────────────────────────────────────────────────────────

interface LsblkDevice {
  name?: string;
  path?: string;
  label?: string | null;
  mountpoint?: string | null;
  mountpoints?: Array<string | null>;
  rm?: boolean | string | number;
  hotplug?: boolean | string | number;
  size?: number | string | null;
  fsavail?: number | string | null;
  type?: string;
  children?: LsblkDevice[];
}

/** Where desktops mount what you plug in; anything mounted elsewhere is part of the system. */
const LINUX_REMOVABLE_MOUNTS = /^\/(media|run\/media|mnt)\//;

function truthy(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function bytes(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Reads `lsblk -J -b -o NAME,PATH,LABEL,MOUNTPOINT,RM,HOTPLUG,SIZE,FSAVAIL,TYPE`. */
export function parseLsblk(output: string): Disk[] {
  const { blockdevices = [] } = JSON.parse(output) as { blockdevices?: LsblkDevice[] };
  const disks: Disk[] = [];
  const visit = (device: LsblkDevice, parent?: LsblkDevice) => {
    const top = parent ?? device;
    const mountpoint = device.mountpoint ?? device.mountpoints?.find((m): m is string => !!m);
    const removable = truthy(top.rm) || truthy(top.hotplug) || truthy(device.rm) || truthy(device.hotplug);
    const path = device.path ?? (device.name ? `/dev/${device.name}` : undefined);
    if (mountpoint && path && LINUX_REMOVABLE_MOUNTS.test(mountpoint) && (removable || device.type === 'rom')) {
      disks.push({
        id: path,
        name: device.label || mountpoint.split('/').pop() || path,
        kind: device.type === 'rom' ? 'optical' : 'removable',
        size: bytes(device.size),
        free: bytes(device.fsavail),
        path: mountpoint,
        parent: parent?.path ?? (parent?.name ? `/dev/${parent.name}` : undefined),
      });
    }
    for (const child of device.children ?? []) visit(child, top);
  };
  for (const device of blockdevices) visit(device);
  return disks;
}

// ── Everywhere ───────────────────────────────────────────────────────────────

export async function listDisks(platform: Platform, exec: Exec): Promise<Disk[]> {
  switch (platform) {
    case 'darwin':
      return macDisks(exec);
    case 'win32':
      return parseWindowsDisks(await exec('powershell.exe', powershellArgs(WINDOWS_LIST_DISKS), 15_000));
    case 'linux': {
      // PATH and FSAVAIL arrived in util-linux 2.33 (2018); older versions refuse them.
      const output = await exec('lsblk', [
        '-J',
        '-b',
        '-o',
        'NAME,PATH,LABEL,MOUNTPOINT,RM,HOTPLUG,SIZE,FSAVAIL,TYPE',
      ]).catch(() => exec('lsblk', ['-J', '-b', '-o', 'NAME,LABEL,MOUNTPOINT,RM,HOTPLUG,SIZE,TYPE']));
      return parseLsblk(output);
    }
  }
}

/** Ejects a disk from {@link listDisks}. Throws with a reason people can act on. */
export async function ejectDisk(disk: Disk, platform: Platform, exec: Exec): Promise<void> {
  try {
    switch (platform) {
      case 'darwin':
        // diskutil eject takes the whole drive with it, like Finder; a share can only be unmounted.
        await exec('diskutil', [disk.kind === 'network' ? 'unmount' : 'eject', disk.id], 30_000);
        return;
      case 'win32':
        await exec('powershell.exe', powershellArgs(windowsEjectScript(disk.id)), 30_000);
        return;
      case 'linux':
        await ejectLinux(disk, exec);
        return;
    }
  } catch (error) {
    const reason = reasonOf(error);
    if (/busy|in use|being used/i.test(reason)) {
      throw new Error(`${disk.name} is in use. Close what's using it and try again.`);
    }
    throw new Error(`Couldn't eject ${disk.name}: ${reason}`);
  }
}

async function ejectLinux(disk: Disk, exec: Exec): Promise<void> {
  try {
    await exec('udisksctl', ['unmount', '--no-user-interaction', '-b', disk.id], 30_000);
  } catch (error) {
    if (!isMissing(error) || !disk.path) throw error;
    await exec('gio', ['mount', '--unmount', disk.path], 30_000);
    return;
  }
  // Once nothing on the drive is mounted, power it off so it's safe to unplug. Another
  // mounted partition on it makes this fail, which is fine.
  if (disk.parent) {
    await exec('udisksctl', ['power-off', '--no-user-interaction', '-b', disk.parent], 30_000).catch(() => undefined);
  }
}
