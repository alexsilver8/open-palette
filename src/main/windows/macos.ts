import { exec as defaultExec, type Exec, type WindowBackend, WindowError } from './backend';
import type { Rect } from './layout';

/**
 * macOS moves other apps' windows through System Events, which uses the Accessibility API:
 * Waypoint needs to be allowed under Privacy & Security → Accessibility (as for pasting).
 * Coordinates are points from the top-left of the main display, the same as Electron's.
 */

/** The focused window of the app in front: pid, app, x, y, width, height and title, tab-separated. */
export const FRONT_WINDOW_SCRIPT = `tell application "System Events"
  set frontApp to first application process whose frontmost is true
  set theWindow to missing value
  try
    set theWindow to value of attribute "AXFocusedWindow" of frontApp
  end try
  if theWindow is missing value then
    if (count of windows of frontApp) is 0 then return ""
    set theWindow to window 1 of frontApp
  end if
  set {windowX, windowY} to position of theWindow
  set {windowWidth, windowHeight} to size of theWindow
  -- Not "title" or "name": inside this tell block those are System Events' own properties.
  set windowTitle to ""
  try
    set windowTitle to name of theWindow
  end try
  if windowTitle is missing value then set windowTitle to ""
  return ((unix id of frontApp) as text) & tab & (name of frontApp) & tab & windowX & tab & windowY & tab & windowWidth & tab & windowHeight & tab & windowTitle
end tell`;

/**
 * Moves the focused window of the app with the given pid. Position, then size, then position
 * again: an app may refuse a size that doesn't fit where the window is until it has moved.
 */
export const MOVE_WINDOW_SCRIPT = `on run argv
  set targetPid to (item 1 of argv) as integer
  set newX to (item 2 of argv) as integer
  set newY to (item 3 of argv) as integer
  set newWidth to (item 4 of argv) as integer
  set newHeight to (item 5 of argv) as integer
  tell application "System Events"
    set targetApp to first application process whose unix id is targetPid
    set theWindow to missing value
    try
      set theWindow to value of attribute "AXFocusedWindow" of targetApp
    end try
    if theWindow is missing value then set theWindow to window 1 of targetApp
    set position of theWindow to {newX, newY}
    set size of theWindow to {newWidth, newHeight}
    set position of theWindow to {newX, newY}
  end tell
end run`;

export interface MacWindow {
  pid: number;
  app: string;
  bounds: Rect;
  title: string;
}

/** Reads what {@link FRONT_WINDOW_SCRIPT} prints. */
export function parseFrontWindow(output: string): MacWindow | undefined {
  const line = output.replace(/\r?\n$/, '');
  if (!line.trim()) return undefined;
  const [pid = '', app = '', x = '', y = '', width = '', height = '', ...title] = line.split('\t');
  const number = (text: string) => (/^\s*-?\d+(\.\d+)?\s*$/.test(text) ? Math.round(Number(text)) : undefined);
  const numbers = { pid: number(pid), x: number(x), y: number(y), width: number(width), height: number(height) };
  if (Object.values(numbers).some((n) => n === undefined)) return undefined;
  return {
    pid: numbers.pid as number,
    app,
    bounds: {
      x: numbers.x as number,
      y: numbers.y as number,
      width: numbers.width as number,
      height: numbers.height as number,
    },
    title: title.join('\t'),
  };
}

/** Turns what osascript complains about into what to do about it. */
export function explainMacError(error: unknown): WindowError {
  const message = error instanceof Error ? error.message : String(error);
  if (/-1743|not authori[sz]ed to send apple events/i.test(message)) {
    return new WindowError(
      'Allow Waypoint to control System Events in System Settings → Privacy & Security → Automation.',
    );
  }
  if (/-25211|-1719|assistive access|accessibility/i.test(message)) {
    return new WindowError('Allow Waypoint in System Settings → Privacy & Security → Accessibility.');
  }
  const reason =
    message
      .split('\n')
      .filter((line) => line.trim())
      .pop() ?? message;
  if (/-10006/.test(message)) {
    return new WindowError(`This window can't be moved or resized, perhaps because it's full screen. (${reason})`);
  }
  return new WindowError(`Couldn't move the window: ${reason}`);
}

export function macBackend(displays: () => Rect[], exec: Exec = defaultExec): WindowBackend {
  return {
    async front() {
      let output: string;
      try {
        output = await exec('osascript', ['-e', FRONT_WINDOW_SCRIPT]);
      } catch (error) {
        throw explainMacError(error);
      }
      const window = parseFrontWindow(output);
      if (!window) return undefined;
      return {
        window: { id: String(window.pid), key: `${window.pid}\t${window.title}`, bounds: window.bounds },
        displays: displays(),
      };
    },
    async move(window, bounds) {
      const args = [window.id, bounds.x, bounds.y, bounds.width, bounds.height].map((n) => String(Math.round(+n)));
      try {
        await exec('osascript', ['-e', MOVE_WINDOW_SCRIPT, ...args]);
      } catch (error) {
        throw explainMacError(error);
      }
    },
  };
}
