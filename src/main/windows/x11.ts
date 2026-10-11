import { exec as defaultExec, delay, type Exec, isMissing, type WindowBackend, WindowError } from './backend';
import type { Rect } from './layout';

/**
 * Linux moves windows with xdotool, on X11. Window managers differ in whether a requested
 * position is the window's or its frame's, so after moving, the window's real position is
 * read back and corrected. Wayland doesn't let one app move another's windows.
 */

/** Space a window manager's frame or a GTK app's shadow adds around the window, in pixels. */
export interface Extents {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const NO_EXTENTS: Extents = { left: 0, right: 0, top: 0, bottom: 0 };

export function isWayland(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.XDG_SESSION_TYPE === 'wayland' || (!!env.WAYLAND_DISPLAY && !env.DISPLAY);
}

/** Reads `xdotool getwindowgeometry --shell`. */
export function parseGeometry(output: string): Rect | undefined {
  const values: Record<string, number> = {};
  for (const line of output.split('\n')) {
    const match = /^(\w+)=(-?\d+)\s*$/.exec(line.trim());
    if (match?.[1] && match[2]) values[match[1]] = Number(match[2]);
  }
  const { X: x, Y: y, WIDTH: width, HEIGHT: height } = values;
  if (x === undefined || y === undefined || width === undefined || height === undefined) return undefined;
  return { x, y, width, height };
}

/** Reads one `NAME(CARDINAL) = left, right, top, bottom` line from xprop. */
export function parseExtents(output: string, property: string): Extents | undefined {
  const line = output.split('\n').find((l) => l.startsWith(`${property}(`));
  const numbers = line
    ?.split('=')[1]
    ?.split(',')
    .map((n) => Number(n.trim()));
  const [left, right, top, bottom] = numbers ?? [];
  if (left === undefined || right === undefined || top === undefined || bottom === undefined) return undefined;
  if (numbers?.length !== 4 || !numbers.every(Number.isFinite)) return undefined;
  return { left, right, top, bottom };
}

export interface WindowProperties {
  frame: Extents;
  shadow: Extents;
  /** `_NET_WM_STATE` without its prefix, e.g. `MAXIMIZED_VERT`. */
  states: string[];
}

const STATES_TO_REMOVE = ['MAXIMIZED_VERT', 'MAXIMIZED_HORZ', 'FULLSCREEN'];

/** Reads xprop's frame extents, shadow extents and window states. */
export function parseProperties(output: string): WindowProperties {
  const stateLine = output.split('\n').find((line) => line.startsWith('_NET_WM_STATE('));
  const states = (stateLine?.split('=')[1] ?? '')
    .split(',')
    .map((state) => state.trim().replace(/^_NET_WM_STATE_/, ''))
    .filter(Boolean);
  return {
    frame: parseExtents(output, '_NET_FRAME_EXTENTS') ?? NO_EXTENTS,
    shadow: parseExtents(output, '_GTK_FRAME_EXTENTS') ?? NO_EXTENTS,
    states,
  };
}

/**
 * The window's visible frame from its own geometry: a window manager's frame sits outside it,
 * and a GTK app that draws its own title bar has an invisible shadow inside it.
 */
export function visibleBounds(client: Rect, frame: Extents, shadow: Extents): Rect {
  return {
    x: client.x - frame.left + shadow.left,
    y: client.y - frame.top + shadow.top,
    width: client.width + frame.left + frame.right - shadow.left - shadow.right,
    height: client.height + frame.top + frame.bottom - shadow.top - shadow.bottom,
  };
}

/** The inverse: the window geometry that shows its frame at `visible`. */
export function clientBounds(visible: Rect, frame: Extents, shadow: Extents): Rect {
  return {
    x: visible.x + frame.left - shadow.left,
    y: visible.y + frame.top - shadow.top,
    width: visible.width - frame.left - frame.right + shadow.left + shadow.right,
    height: visible.height - frame.top - frame.bottom + shadow.top + shadow.bottom,
  };
}

/** How long a window manager gets to act on a move before it's checked. */
const SETTLE_MS = 80;

export function x11Backend(
  displays: () => Rect[],
  exec: Exec = defaultExec,
  env: NodeJS.ProcessEnv = process.env,
): WindowBackend {
  const xdotool = async (args: string[]) => {
    try {
      return await exec('xdotool', args);
    } catch (error) {
      if (isMissing(error)) throw new WindowError('Install xdotool to move windows.');
      throw error;
    }
  };

  const properties = async (id: string): Promise<WindowProperties> => {
    try {
      return parseProperties(
        await exec('xprop', ['-id', id, '_NET_FRAME_EXTENTS', '_GTK_FRAME_EXTENTS', '_NET_WM_STATE']),
      );
    } catch {
      // Without xprop, frames are left out; the move is corrected afterwards anyway.
      return { frame: NO_EXTENTS, shadow: NO_EXTENTS, states: [] };
    }
  };

  /** A maximized or full-screen window ignores moves. */
  const unmaximize = async (id: string, states: string[]) => {
    const remove = states.filter((state) => STATES_TO_REMOVE.includes(state));
    if (remove.length === 0) return;
    try {
      for (const state of remove) await exec('xdotool', ['windowstate', '--remove', state, id]);
    } catch {
      // xdotool before 2021 doesn't know windowstate; wmctrl does the same, two states at a time.
      const names = remove.map((state) => state.toLowerCase());
      for (let i = 0; i < names.length; i += 2) {
        await exec('wmctrl', ['-i', '-r', id, '-b', `remove,${names.slice(i, i + 2).join(',')}`]).catch(
          () => undefined,
        );
      }
    }
    await delay(SETTLE_MS);
  };

  const geometry = async (id: string) => {
    const rect = parseGeometry(await xdotool(['getwindowgeometry', '--shell', id]));
    if (!rect) throw new WindowError("Couldn't read where the window is.");
    return rect;
  };

  return {
    async front() {
      if (isWayland(env)) {
        throw new WindowError(
          "Wayland doesn't let apps move other apps' windows. Log in with an X11 session to use this.",
        );
      }
      let id: string;
      try {
        id = (await xdotool(['getactivewindow'])).trim();
      } catch (error) {
        if (error instanceof WindowError) throw error;
        return undefined;
      }
      if (!/^\d+$/.test(id)) return undefined;
      const [client, { frame, shadow }] = await Promise.all([geometry(id), properties(id)]);
      return { window: { id, key: id, bounds: visibleBounds(client, frame, shadow) }, displays: displays() };
    },

    async move(window, bounds) {
      const { id } = window;
      if (!/^\d+$/.test(id)) throw new WindowError('That window has closed.');
      const before = await properties(id);
      await unmaximize(id, before.states);
      // Frames often change size once a window isn't maximized any more.
      const { frame, shadow } = before.states.length > 0 ? await properties(id) : before;
      const target = clientBounds(bounds, frame, shadow);
      const size = [String(target.width), String(target.height)];
      await xdotool(['windowsize', id, ...size, 'windowmove', id, String(target.x), String(target.y)]);

      // Some window managers put the frame, not the window, where it was asked to go.
      await delay(SETTLE_MS);
      const actual = await geometry(id);
      const dx = actual.x - target.x;
      const dy = actual.y - target.y;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        await xdotool(['windowmove', id, String(target.x - dx), String(target.y - dy)]);
      }
    },
  };
}
