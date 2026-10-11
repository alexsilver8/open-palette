import { describe, expect, it } from 'vitest';
import type { ClipboardEntry, ClipboardHistory } from '../clipboard/history';
import { CLIPBOARD_ROOT_LIMIT, clipboardRootItems } from './clipboard-history';

function historyOf(texts: string[]): ClipboardHistory {
  const entries: ClipboardEntry[] = texts.map((text, i) => ({ id: `e${i}`, text, copiedAt: 1_000_000 - i }));
  return { entries: () => entries } as unknown as ClipboardHistory;
}

describe('clipboardRootItems', () => {
  it('offers recent entries to the root search, with a preview and a copy action', () => {
    const [item] = clipboardRootItems(historyOf(['line one\nline two']), () => true);
    expect(item).toMatchObject({
      id: 'clipboard:e0',
      kind: 'clipboard',
      title: 'line one',
      detail: { body: 'line one\nline two' },
      actions: [{ type: 'copy', text: 'line one\nline two' }],
    });
    expect(item?.detail?.metadata).toContainEqual({ label: 'Lines', value: '2' });
  });

  it('carries only the most recent entries', () => {
    const texts = Array.from({ length: CLIPBOARD_ROOT_LIMIT + 50 }, (_, i) => `entry ${i}`);
    const items = clipboardRootItems(historyOf(texts), () => true);
    expect(items).toHaveLength(CLIPBOARD_ROOT_LIMIT);
    expect(items[0]?.title).toBe('entry 0');
  });

  it('offers nothing while clipboard history is off', () => {
    expect(clipboardRootItems(historyOf(['secret']), () => false)).toEqual([]);
  });
});
