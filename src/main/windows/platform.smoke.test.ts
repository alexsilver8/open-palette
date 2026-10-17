/**
 * Moves a real window on the system it runs on. Off by default; the platform workflow runs it
 * on macOS, Windows and Linux (under Xvfb with a window manager) with WAYPOINT_SMOKE=1,
 * after opening a window and bringing it to the front.
 */
import { describe, expect, it } from 'vitest';
import { exec, type WindowBackend } from './backend';
import { type Layout, layoutBounds, type Rect, sameBounds } from './layout';
import { macBackend } from './macos';
import { WindowManager } from './manager';
import { PowerShellWindows } from './win32';
import { x11Backend } from './x11';

const enabled = process.env.WAYPOINT_SMOKE === '1';

/**
 * Whether a window landed where it should. Apps round sizes to what they support, and won't go
 * below their smallest size (a Finder window is wider than a third of a small screen), so the
 * position must match and the size match or be bigger.
 */
function fits(actual: Rect, expected: Rect, slack = 12): boolean {
  const near = (a: number, b: number) => Math.abs(a - b) <= slack;
  const sizeFits = (a: number, b: number) => near(a, b) || a > b;
  return (
    near(actual.x, expected.x) &&
    near(actual.y, expected.y) &&
    sizeFits(actual.width, expected.width) &&
    sizeFits(actual.height, expected.height)
  );
}

/** macOS: the main display's work area from AppKit, flipped to top-left coordinates. */
async function macWorkAreas(): Promise<Rect[]> {
  const script = `ObjC.import('AppKit');
const screens = $.NSScreen.screens;
const main = screens.objectAtIndex(0).frame;
const out = [];
for (let i = 0; i < screens.count; i++) {
  const f = screens.objectAtIndex(i).visibleFrame;
  out.push({ x: f.origin.x, y: main.size.height - f.origin.y - f.size.height, width: f.size.width, height: f.size.height });
}
JSON.stringify(out);`;
  return JSON.parse(await exec('osascript', ['-l', 'JavaScript', '-e', script])) as Rect[];
}

/** X11: the work area the window manager reports, as one display. */
async function x11WorkAreas(): Promise<Rect[]> {
  const output = await exec('xprop', ['-root', '_NET_WORKAREA']);
  const [x = 0, y = 0, width = 0, height = 0] = (output.split('=')[1] ?? '').split(',').map((n) => Number(n.trim()));
  return [{ x, y, width, height }];
}

async function backendForThisSystem(): Promise<{ backend: WindowBackend; close?: () => void }> {
  if (process.platform === 'win32') {
    const backend = new PowerShellWindows();
    return { backend, close: () => backend.dispose() };
  }
  if (process.platform === 'darwin') {
    const displays = await macWorkAreas();
    return { backend: macBackend(() => displays) };
  }
  const displays = await x11WorkAreas();
  return { backend: x11Backend(() => displays) };
}

describe.runIf(enabled)(`moving a real window on ${process.platform}`, () => {
  it('finds the window in front, snaps it to layouts and restores it', { timeout: 60_000 }, async () => {
    const { backend, close } = await backendForThisSystem();
    try {
      const first = await backend.front();
      expect(first, 'a window in front').toBeDefined();
      if (!first) return;
      console.log('window in front:', first.window, 'displays:', first.displays);
      const manager = new WindowManager();

      const layouts: Layout[] = ['left-half', 'right-half', 'top-left', 'center-third', 'center', 'maximize'];
      for (const layout of layouts) {
        const current = await backend.front();
        if (!current) throw new Error('lost the window');
        const expected = layoutBounds(layout, current.window.bounds, current.displays);
        await manager.apply(backend, layout);
        await new Promise((resolve) => setTimeout(resolve, 300));
        const after = await backend.front();
        console.log(layout, 'expected', expected, 'got', after?.window.bounds);
        expect(after?.window.key).toBe(first.window.key);
        expect(expected && after && fits(after.window.bounds, expected), layout).toBe(true);
      }

      await manager.apply(backend, 'restore');
      await new Promise((resolve) => setTimeout(resolve, 300));
      const restored = await backend.front();
      console.log('restored', restored?.window.bounds, 'from', first.window.bounds);
      expect(restored && sameBounds(restored.window.bounds, first.window.bounds, 12)).toBe(true);
    } finally {
      close?.();
    }
  });
});
