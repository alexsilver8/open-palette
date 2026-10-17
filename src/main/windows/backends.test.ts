import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { encodePowerShell } from '../exec';
import { explainMacError, MOVE_WINDOW_SCRIPT, macBackend, parseFrontWindow } from './macos';
import { checkMove, HELPER_SCRIPT, PowerShellWindows, parseFront } from './win32';
import { clientBounds, isWayland, parseExtents, parseGeometry, parseProperties, visibleBounds } from './x11';

describe('macOS', () => {
  it('reads the window in front', () => {
    expect(parseFrontWindow('512\tSafari\t-1200\t38\t1024\t768\tApple — Start\tPage\n')).toEqual({
      pid: 512,
      app: 'Safari',
      bounds: { x: -1200, y: 38, width: 1024, height: 768 },
      title: 'Apple — Start\tPage',
    });
    expect(parseFrontWindow('\n')).toBeUndefined();
    expect(parseFrontWindow('512\tSafari\tmissing value\t0\t1\t1\t')).toBeUndefined();
  });

  it('moves the focused window of the same app, passing numbers as arguments', async () => {
    const calls: string[][] = [];
    const backend = macBackend(
      () => [{ x: 0, y: 25, width: 1440, height: 875 }],
      async (file, args) => {
        calls.push([file, ...args]);
        return '512\tSafari\t10\t40\t800\t600\tStart Page\n';
      },
    );
    const snapshot = await backend.front();
    expect(snapshot?.window).toEqual({
      id: '512',
      key: '512\tStart Page',
      bounds: { x: 10, y: 40, width: 800, height: 600 },
    });
    if (!snapshot) return;
    await backend.move(snapshot.window, { x: 0, y: 25, width: 720.4, height: 875 });
    expect(calls[1]).toEqual(['osascript', '-e', MOVE_WINDOW_SCRIPT, '512', '0', '25', '720', '875']);
  });

  it('says which permission is missing', () => {
    expect(
      explainMacError(new Error('execution error: Not authorized to send Apple events to System Events. (-1743)'))
        .message,
    ).toMatch(/Automation/);
    expect(explainMacError(new Error('osascript is not allowed assistive access. (-25211)')).message).toMatch(
      /Accessibility/,
    );
  });
});

describe('Windows', () => {
  it('reads the helper’s answers', () => {
    const snapshot = parseFront(
      '{"displays":[{"x":0,"y":0,"width":2560,"height":1392}],"window":{"id":"132456","bounds":{"x":8,"y":0,"width":1280,"height":720}}}',
    );
    expect(snapshot).toEqual({
      window: { id: '132456', key: '132456', bounds: { x: 8, y: 0, width: 1280, height: 720 } },
      displays: [{ x: 0, y: 0, width: 2560, height: 1392 }],
    });
    expect(parseFront('{"displays":[],"window":null}')).toBeUndefined();
    expect(() => checkMove('{"ok":true}')).not.toThrow();
    expect(() => checkMove('{"error":"denied"}')).toThrow(/administrator/);
    expect(() => checkMove('{"error":"gone"}')).toThrow(/closed/);
  });

  it('fits the helper on a command line', () => {
    // Windows allows 32,767 characters on a command line.
    expect(encodePowerShell(HELPER_SCRIPT).length).toBeLessThan(30_000);
    expect(Buffer.from(encodePowerShell('ok'), 'base64').toString('utf16le')).toBe('ok');
  });

  describe('the helper process', () => {
    let backend: PowerShellWindows | undefined;
    afterEach(() => backend?.dispose());

    /** A stand-in helper in Node that answers like the PowerShell one. */
    function fakeHelper(body: string): PowerShellWindows {
      const file = join(tmpdir(), `waypoint-fake-helper-${process.pid}-${Math.random()}.cjs`);
      writeFileSync(
        file,
        `const rl = require('node:readline').createInterface({ input: process.stdin });
let moves = 0;
console.log('Warming up…');
console.log('{"ready":true}');
rl.on('line', (line) => { ${body} });`,
      );
      backend = new PowerShellWindows({ file: process.execPath, args: [file] });
      return backend;
    }

    it('starts once and answers each request in order', async () => {
      const helper = fakeHelper(`
        if (line === 'front') console.log(JSON.stringify({ displays: [{ x: 0, y: 0, width: 100, height: 100 }], window: { id: '7', bounds: { x: 1, y: 2, width: 3, height: 4 } } }));
        else console.log(JSON.stringify(line === 'move 7 0 0 50 100' ? { ok: true } : { error: line }));`);
      const [snapshot] = await Promise.all([helper.front(), helper.front()]);
      expect(snapshot?.window.id).toBe('7');
      if (!snapshot) return;
      await expect(helper.move(snapshot.window, { x: 0, y: 0, width: 50, height: 100 })).resolves.toBeUndefined();
      await expect(helper.move(snapshot.window, { x: 1, y: 0, width: 50, height: 100 })).rejects.toThrow(
        /move 7 1 0 50 100/,
      );
    });

    it('fails a request the helper never answers, and starts a fresh one next time', async () => {
      const helper = fakeHelper(`if (line === 'front') process.exit(1);`);
      await expect(helper.front()).rejects.toThrow(/didn't answer/);
    }, 10_000);
  });
});

describe('Linux', () => {
  it('reads xdotool and xprop', () => {
    expect(parseGeometry('WINDOW=4194316\nX=102\nY=140\nWIDTH=484\nHEIGHT=316\nSCREEN=0\n')).toEqual({
      x: 102,
      y: 140,
      width: 484,
      height: 316,
    });
    expect(parseGeometry('WINDOW=1\n')).toBeUndefined();
    const xprop =
      '_NET_FRAME_EXTENTS(CARDINAL) = 1, 1, 20, 5\n_GTK_FRAME_EXTENTS:  no such atom on any window.\n_NET_WM_STATE(ATOM) = _NET_WM_STATE_MAXIMIZED_VERT, _NET_WM_STATE_MAXIMIZED_HORZ\n';
    expect(parseExtents(xprop, '_NET_FRAME_EXTENTS')).toEqual({ left: 1, right: 1, top: 20, bottom: 5 });
    expect(parseProperties(xprop)).toEqual({
      frame: { left: 1, right: 1, top: 20, bottom: 5 },
      shadow: { left: 0, right: 0, top: 0, bottom: 0 },
      states: ['MAXIMIZED_VERT', 'MAXIMIZED_HORZ'],
      types: [],
    });
    expect(parseProperties('_NET_WM_WINDOW_TYPE(ATOM) = _NET_WM_WINDOW_TYPE_DESKTOP\n').types).toEqual(['DESKTOP']);
    expect(parseProperties('_NET_WM_STATE(ATOM) = \n').states).toEqual([]);
  });

  it('converts between a window and its visible frame', () => {
    const client = { x: 102, y: 140, width: 484, height: 316 };
    const frame = { left: 1, right: 1, top: 20, bottom: 5 };
    const shadow = { left: 10, right: 10, top: 8, bottom: 12 };
    const visible = visibleBounds(client, frame, { left: 0, right: 0, top: 0, bottom: 0 });
    expect(visible).toEqual({ x: 101, y: 120, width: 486, height: 341 });
    expect(clientBounds(visibleBounds(client, frame, shadow), frame, shadow)).toEqual(client);
  });

  it('knows a Wayland session', () => {
    expect(isWayland({ XDG_SESSION_TYPE: 'wayland', DISPLAY: ':0' })).toBe(true);
    expect(isWayland({ XDG_SESSION_TYPE: 'x11', DISPLAY: ':0' })).toBe(false);
    expect(isWayland({ WAYLAND_DISPLAY: 'wayland-0' })).toBe(true);
  });
});
