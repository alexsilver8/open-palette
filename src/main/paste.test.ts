import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ Notification: { isSupported: () => false }, systemPreferences: {} }));

const { pasteKeystrokes } = await import('./paste');

describe('pasteKeystrokes', () => {
  it('asks System Events to press ⌘V on macOS', () => {
    expect(pasteKeystrokes('darwin')).toEqual([
      { file: 'osascript', args: ['-e', 'tell application "System Events" to keystroke "v" using command down'] },
    ]);
  });

  it('sends Ctrl+V with SendKeys on Windows', () => {
    const [keystroke] = pasteKeystrokes('win32');
    expect(keystroke?.file).toBe('powershell.exe');
    expect(keystroke?.args.at(-1)).toContain("SendKeys('^v')");
  });

  it('prefers xdotool on X11 and wtype on Wayland, trying the other next', () => {
    expect(pasteKeystrokes('linux', { DISPLAY: ':0' }).map((k) => k.file)).toEqual(['xdotool', 'wtype']);
    expect(pasteKeystrokes('linux', { XDG_SESSION_TYPE: 'wayland', DISPLAY: ':0' }).map((k) => k.file)).toEqual([
      'wtype',
      'xdotool',
    ]);
    expect(pasteKeystrokes('linux', { WAYLAND_DISPLAY: 'wayland-0' }).map((k) => k.file)).toEqual(['wtype', 'xdotool']);
  });
});
