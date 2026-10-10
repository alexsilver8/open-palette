import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, normalizeSettings } from './settings-schema';

describe('normalizeSettings', () => {
  it('returns the defaults when nothing was saved', () => {
    expect(normalizeSettings(undefined)).toEqual({ settings: DEFAULT_SETTINGS, problems: [] });
  });

  it('keeps valid values', () => {
    const { settings, problems } = normalizeSettings({
      hotkey: 'CommandOrControl+Shift+Space',
      theme: 'dark',
      clipboardHistory: { maxItems: 50 },
      extensionDirectories: ['/tmp/ext'],
      notesDirectory: '~/Dropbox/Notes',
    });
    expect(problems).toEqual([]);
    expect(settings.hotkey).toBe('CommandOrControl+Shift+Space');
    expect(settings.theme).toBe('dark');
    expect(settings.clipboardHistory).toEqual({ enabled: true, maxItems: 50 });
    expect(settings.extensionDirectories).toEqual(['/tmp/ext']);
    expect(settings.notesDirectory).toBe('~/Dropbox/Notes');
  });

  it('replaces invalid values with defaults and reports them', () => {
    const { settings, problems } = normalizeSettings({ hotkey: 42, theme: 'neon', clipboardHistory: { maxItems: -1 } });
    expect(settings.hotkey).toBe(DEFAULT_SETTINGS.hotkey);
    expect(settings.theme).toBe('system');
    expect(settings.clipboardHistory.maxItems).toBe(200);
    expect(problems).toHaveLength(3);
  });

  it('rejects non-object settings', () => {
    expect(normalizeSettings([1, 2]).problems).toHaveLength(1);
  });

  it('does not share nested objects with the defaults', () => {
    const { settings } = normalizeSettings({});
    settings.clipboardHistory.maxItems = 1;
    expect(DEFAULT_SETTINGS.clipboardHistory.maxItems).toBe(200);
  });
});
