import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { powershellArgs } from '../exec';
import { type TargetWindow, type WindowBackend, WindowError, type WindowSnapshot } from './backend';
import type { Rect } from './layout';

/**
 * Windows moves windows with user32 calls from a PowerShell helper. Compiling those calls
 * takes a second, so the helper starts on first use and stays up, answering one request per
 * line, until it has been idle for a while. Everything is in real pixels: the helper asks to
 * be aware of each display's scaling.
 */

const HELPER_SOURCE = String.raw`
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class WaypointWindows {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

  [StructLayout(LayoutKind.Sequential)]
  public struct MONITORINFO { public int Size; public RECT Monitor; public RECT Work; public uint Flags; }

  public delegate bool MonitorEnumProc(IntPtr monitor, IntPtr hdc, ref RECT rect, IntPtr data);

  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr hwnd, uint flags);
  [DllImport("user32.dll")] static extern IntPtr GetShellWindow();
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool IsZoomed(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hwnd, int command);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
  [DllImport("user32.dll", SetLastError = true)]
  static extern bool SetWindowPos(IntPtr hwnd, IntPtr after, int x, int y, int width, int height, uint flags);
  [DllImport("user32.dll")] static extern bool EnumDisplayMonitors(IntPtr hdc, IntPtr clip, MonitorEnumProc callback, IntPtr data);
  [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr monitor, ref MONITORINFO info);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr hwnd, StringBuilder name, int size);
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern bool IsHungAppWindow(IntPtr hwnd);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr hwnd, int attribute, out RECT value, int size);

  const uint GA_ROOT = 2;
  const int SW_RESTORE = 9;
  const uint SWP_NOZORDER = 0x0004;
  const uint SWP_NOACTIVATE = 0x0010;
  const int DWMWA_EXTENDED_FRAME_BOUNDS = 9;

  public static void Init() {
    // Real pixels on every display, whatever its scaling (-4: per-monitor aware, v2).
    try { SetProcessDpiAwarenessContext(new IntPtr(-4)); }
    catch (EntryPointNotFoundException) { SetProcessDPIAware(); }
  }

  // The process may already have been given another awareness; the thread's own setting wins.
  static void Aware() {
    try { SetThreadDpiAwarenessContext(new IntPtr(-4)); }
    catch (EntryPointNotFoundException) {}
  }

  // The frame you see; GetWindowRect also counts the invisible borders used for resizing.
  static RECT Frame(IntPtr hwnd) {
    RECT frame;
    if (DwmGetWindowAttribute(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS, out frame, Marshal.SizeOf(typeof(RECT))) == 0) return frame;
    GetWindowRect(hwnd, out frame);
    return frame;
  }

  static string Json(RECT r) {
    return "{\"x\":" + r.Left + ",\"y\":" + r.Top + ",\"width\":" + (r.Right - r.Left) + ",\"height\":" + (r.Bottom - r.Top) + "}";
  }

  public static string Front() {
    Aware();
    IntPtr hwnd = GetForegroundWindow();
    if (hwnd != IntPtr.Zero) hwnd = GetAncestor(hwnd, GA_ROOT);
    StringBuilder name = new StringBuilder(256);
    if (hwnd != IntPtr.Zero) GetClassName(hwnd, name, name.Capacity);
    string cls = name.ToString();
    // The desktop and the taskbar aren't windows to move.
    bool none = hwnd == IntPtr.Zero || hwnd == GetShellWindow() || !IsWindowVisible(hwnd) ||
      cls == "Progman" || cls == "WorkerW" || cls == "Shell_TrayWnd" || cls == "Shell_SecondaryTrayWnd";

    List<RECT> work = new List<RECT>();
    MonitorEnumProc collect = delegate (IntPtr monitor, IntPtr hdc, ref RECT rect, IntPtr data) {
      MONITORINFO info = new MONITORINFO();
      info.Size = Marshal.SizeOf(typeof(MONITORINFO));
      if (GetMonitorInfo(monitor, ref info)) work.Add(info.Work);
      return true;
    };
    EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, collect, IntPtr.Zero);
    GC.KeepAlive(collect);

    StringBuilder json = new StringBuilder("{\"displays\":[");
    for (int i = 0; i < work.Count; i++) {
      if (i > 0) json.Append(',');
      json.Append(Json(work[i]));
    }
    json.Append("],\"window\":");
    if (none) json.Append("null");
    else json.Append("{\"id\":\"" + hwnd.ToInt64() + "\",\"bounds\":" + Json(Frame(hwnd)) + "}");
    json.Append('}');
    return json.ToString();
  }

  public static string Move(long id, int x, int y, int width, int height) {
    Aware();
    IntPtr hwnd = new IntPtr(id);
    if (!IsWindow(hwnd)) return "{\"error\":\"gone\"}";
    // Moving a window that isn't responding would wait until it does.
    if (IsHungAppWindow(hwnd)) return "{\"error\":\"hung\"}";
    if (IsZoomed(hwnd) || IsIconic(hwnd)) ShowWindow(hwnd, SW_RESTORE);
    // Twice: a window moved to a display with different scaling resizes itself once it arrives.
    for (int pass = 0; pass < 2; pass++) {
      RECT outer;
      GetWindowRect(hwnd, out outer);
      RECT frame = Frame(hwnd);
      int left = frame.Left - outer.Left;
      int top = frame.Top - outer.Top;
      int right = outer.Right - frame.Right;
      int bottom = outer.Bottom - frame.Bottom;
      bool moved = SetWindowPos(hwnd, IntPtr.Zero, x - left, y - top, width + left + right, height + top + bottom,
        SWP_NOZORDER | SWP_NOACTIVATE);
      if (!moved) {
        int error = Marshal.GetLastWin32Error();
        return error == 5 ? "{\"error\":\"denied\"}" : "{\"error\":\"SetWindowPos failed with error " + error + "\"}";
      }
    }
    return "{\"ok\":true}";
  }
}
`;

/** The helper: compiles the calls above, then answers `front` and `move id x y w h`, one JSON line each. */
export const HELPER_SCRIPT = `$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -TypeDefinition @'
${HELPER_SOURCE}
'@
[WaypointWindows]::Init()
[Console]::Out.WriteLine('{"ready":true}')
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  try {
    $parts = $line.Trim().Split(' ')
    if ($parts[0] -eq 'front') {
      $out = [WaypointWindows]::Front()
    } elseif ($parts[0] -eq 'move' -and $parts.Length -eq 6) {
      $out = [WaypointWindows]::Move([long]$parts[1], [int]$parts[2], [int]$parts[3], [int]$parts[4], [int]$parts[5])
    } else {
      $out = '{"error":"unknown request"}'
    }
  } catch {
    $out = '{"error":' + (ConvertTo-Json ([string]$_.Exception.Message) -Compress) + '}'
  }
  [Console]::Out.WriteLine($out)
}
`;

interface FrontReply {
  displays?: Rect[];
  window?: { id: string; bounds: Rect } | null;
  error?: string;
}

/** Reads the helper's answer to `front`. */
export function parseFront(line: string): WindowSnapshot | undefined {
  const reply = JSON.parse(line) as FrontReply;
  if (reply.error) throw new WindowError(`Couldn't find the window in front: ${reply.error}`);
  if (!reply.window) return undefined;
  return {
    window: { id: reply.window.id, key: reply.window.id, bounds: reply.window.bounds },
    displays: reply.displays ?? [],
  };
}

/** Reads the helper's answer to `move`. */
export function checkMove(line: string): void {
  const reply = JSON.parse(line) as { ok?: boolean; error?: string };
  if (reply.ok) return;
  if (reply.error === 'gone') throw new WindowError('That window has closed.');
  if (reply.error === 'hung') throw new WindowError("That app isn't responding, so its window can't be moved.");
  if (reply.error === 'denied') {
    throw new WindowError("Windows doesn't let Waypoint move the windows of apps running as administrator.");
  }
  throw new WindowError(`Couldn't move the window: ${reply.error ?? 'no answer'}`);
}

/** How long the helper waits for its next request before it quits. */
const IDLE_MS = 5 * 60_000;
/** The first request includes compiling, which can take a few seconds on a busy machine. */
const FIRST_TIMEOUT_MS = 15_000;
const TIMEOUT_MS = 4000;

export class PowerShellWindows implements WindowBackend {
  private child?: ChildProcessWithoutNullStreams;
  private lines: string[] = [];
  private waiting?: (line: string | undefined) => void;
  private queue: Promise<unknown> = Promise.resolve();
  private idle?: NodeJS.Timeout;
  private ready = false;

  /** `command` is only for tests, to stand in a fake helper. */
  constructor(
    private readonly command: { file: string; args: string[] } = {
      file: 'powershell.exe',
      args: powershellArgs(HELPER_SCRIPT),
    },
  ) {}

  front(): Promise<WindowSnapshot | undefined> {
    return this.request('front').then(parseFront);
  }

  async move(window: TargetWindow, bounds: Rect): Promise<void> {
    if (!/^-?\d+$/.test(window.id)) throw new WindowError('That window has closed.');
    const numbers = [bounds.x, bounds.y, bounds.width, bounds.height].map((n) => Math.round(n));
    checkMove(await this.request(`move ${window.id} ${numbers.join(' ')}`));
  }

  /** Stops the helper: asks it to finish, or ends it at once if it's stuck. */
  dispose(force = false): void {
    clearTimeout(this.idle);
    const child = this.child;
    this.child = undefined;
    if (!child) return;
    child.stdin.end();
    if (force) child.kill();
  }

  /** One request at a time, so answers can't cross. */
  private request(line: string): Promise<string> {
    const run = this.queue.then(() => this.send(line));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async send(line: string): Promise<string> {
    clearTimeout(this.idle);
    const child = this.start();
    if (!this.ready) {
      // The helper says it's ready once compiled; until then, a slow start isn't a failure.
      const ready = await this.next(FIRST_TIMEOUT_MS);
      if (ready === undefined) {
        this.dispose(true);
        throw new WindowError("Couldn't start the PowerShell helper that moves windows.");
      }
      this.ready = true;
    }
    child.stdin.write(`${line}\n`);
    const answer = await this.next(TIMEOUT_MS);
    if (answer === undefined) {
      this.dispose(true);
      throw new WindowError("The PowerShell helper that moves windows didn't answer.");
    }
    this.idle = setTimeout(() => this.dispose(), IDLE_MS);
    this.idle.unref?.();
    return answer;
  }

  private start(): ChildProcessWithoutNullStreams {
    if (this.child) return this.child;
    const child = spawn(this.command.file, this.command.args, { windowsHide: true });
    this.child = child;
    this.ready = false;
    this.lines = [];
    let errors = '';
    // Writing to a helper that just quit fails here; the request then times out cleanly.
    child.stdin.on('error', () => undefined);
    child.stderr.on('data', (chunk: Buffer) => {
      errors = (errors + chunk.toString()).slice(-2000);
    });
    createInterface({ input: child.stdout }).on('line', (text) => {
      const trimmed = text.trim();
      // Only JSON lines are answers; and a helper that was replaced has nothing more to say.
      if (!trimmed.startsWith('{') || this.child !== child) return;
      if (this.waiting) {
        const resolve = this.waiting;
        this.waiting = undefined;
        resolve(trimmed);
      } else {
        this.lines.push(trimmed);
      }
    });
    const ended = (reason: string) => {
      if (errors.trim()) console.warn(`[windows] PowerShell helper ${reason}:`, errors.trim());
      // A helper stopped on purpose, or already replaced, mustn't fail the current request.
      if (this.child !== child) return;
      this.child = undefined;
      const resolve = this.waiting;
      this.waiting = undefined;
      resolve?.(undefined);
    };
    child.on('error', (error) => ended(error.message));
    child.on('exit', (code) => ended(`exited with ${code}`));
    return child;
  }

  /** The helper's next line, or `undefined` if it doesn't come in time or the helper quits. */
  private next(timeout: number): Promise<string | undefined> {
    const queued = this.lines.shift();
    if (queued !== undefined) return Promise.resolve(queued);
    if (!this.child) return Promise.resolve(undefined);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiting = undefined;
        resolve(undefined);
      }, timeout);
      this.waiting = (line) => {
        clearTimeout(timer);
        resolve(line);
      };
    });
  }
}
