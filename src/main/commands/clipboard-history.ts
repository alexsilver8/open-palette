import { timeAgo } from '../../shared/time';
import type { Action, ItemDetail, ListItem, RootItem, View } from '../../shared/types';
import type { ClipboardEntry, ClipboardHistory } from '../clipboard/history';
import type { BuiltinExtension } from './types';

function preview(text: string): string {
  const firstLine = text.trim().split(/\r?\n/, 1)[0] ?? '';
  const collapsed = firstLine.replace(/\s+/g, ' ');
  return collapsed.length > 120 ? `${collapsed.slice(0, 119)}…` : collapsed;
}

function describe(text: string): string {
  const lines = text.split(/\r?\n/).length;
  const chars = text.length.toLocaleString('en-US');
  return lines > 1 ? `${lines} lines, ${chars} characters` : `${chars} characters`;
}

function isUrl(text: string): boolean {
  return /^https?:\/\/\S+$/i.test(text.trim());
}

const PREVIEW_LENGTH = 4000;

function entryDetail(entry: ClipboardEntry): ItemDetail {
  const lines = entry.text.split(/\r?\n/).length;
  return {
    body: entry.text.length > PREVIEW_LENGTH ? `${entry.text.slice(0, PREVIEW_LENGTH)}…` : entry.text,
    metadata: [
      { label: 'Copied', value: timeAgo(entry.copiedAt) },
      { label: 'Characters', value: entry.text.length.toLocaleString('en-US') },
      ...(lines > 1 ? [{ label: 'Lines', value: lines.toLocaleString('en-US') }] : []),
    ],
  };
}

/**
 * How many recent entries the root search carries. Each holds its whole text, so the whole
 * history (up to thousands of entries) would be a lot to send every time the launcher opens;
 * Clipboard History searches all of it.
 */
export const CLIPBOARD_ROOT_LIMIT = 200;

/** Recent clipboard entries, for the root search and its Clipboard tab. */
export function clipboardRootItems(history: ClipboardHistory, isEnabled: () => boolean): RootItem[] {
  if (!isEnabled()) return [];
  return history
    .entries()
    .slice(0, CLIPBOARD_ROOT_LIMIT)
    .map((entry) => {
      const actions: Action[] = [{ type: 'copy', text: entry.text, title: 'Copy to Clipboard' }];
      if (isUrl(entry.text)) actions.push({ type: 'open-url', url: entry.text.trim(), title: 'Open in Browser' });
      return {
        id: `clipboard:${entry.id}`,
        kind: 'clipboard',
        title: preview(entry.text),
        subtitle: describe(entry.text),
        icon: { builtin: isUrl(entry.text) ? 'link' : 'text', tint: 'orange' },
        keywords: [entry.text.slice(0, 2000)],
        accessory: timeAgo(entry.copiedAt),
        frecency: 0,
        detail: entryDetail(entry),
        actions,
      };
    });
}

function toItem(entry: ClipboardEntry): ListItem {
  const actions: Action[] = [{ type: 'copy', text: entry.text, title: 'Copy to Clipboard' }];
  if (isUrl(entry.text)) actions.push({ type: 'open-url', url: entry.text.trim(), title: 'Open in Browser' });
  actions.push(
    {
      type: 'callback',
      id: 'delete',
      payload: entry.id,
      title: 'Delete Entry',
      style: 'destructive',
      shortcut: { key: 'Backspace', modifiers: ['mod'] },
    },
    {
      type: 'callback',
      id: 'clear',
      title: 'Clear History',
      style: 'destructive',
      shortcut: { key: 'Backspace', modifiers: ['mod', 'shift'] },
    },
  );
  return {
    id: entry.id,
    title: preview(entry.text),
    subtitle: describe(entry.text),
    icon: { builtin: isUrl(entry.text) ? 'link' : 'text', tint: 'gray' },
    // Lets the search match text beyond the first line.
    keywords: [entry.text.slice(0, 2000)],
    accessory: timeAgo(entry.copiedAt),
    detail: entryDetail(entry),
    actions,
  };
}

export function clipboardHistoryExtension(history: ClipboardHistory, isEnabled: () => boolean): BuiltinExtension {
  const view = (): View => ({
    type: 'list',
    title: 'Clipboard History',
    searchPlaceholder: 'Search copied text…',
    sections: [{ title: 'Recent', items: history.entries().map(toItem) }],
    emptyText: isEnabled()
      ? 'Copy some text and it will show up here.'
      : 'Clipboard history is turned off in settings.',
  });

  return {
    manifest: {
      name: 'clipboard',
      title: 'Clipboard',
      icon: { builtin: 'clipboard', tint: 'orange' },
      commands: [
        { name: 'history', title: 'Clipboard History', mode: 'view', keywords: ['paste', 'copy', 'pasteboard'] },
      ],
    },
    commands: {
      history: {
        view,
        onAction(id, payload) {
          if (id === 'delete' && typeof payload === 'string') {
            history.remove(payload);
            return { replace: view(), toast: 'Entry deleted' };
          }
          if (id === 'clear') {
            history.clear();
            return { replace: view(), toast: 'History cleared' };
          }
          return undefined;
        },
      },
    },
  };
}
