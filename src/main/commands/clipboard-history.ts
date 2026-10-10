import { timeAgo } from '../../shared/time';
import type { Action, ListItem, View } from '../../shared/types';
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
