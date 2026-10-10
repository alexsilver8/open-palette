import { notePreview, noteTitle } from '../../shared/notes';
import { timeAgo } from '../../shared/time';
import type { ListItem, View } from '../../shared/types';
import type { NotesStore } from '../notes/store';
import type { NotesWindow } from '../notes/window';
import type { BuiltinExtension } from './types';

const REVEAL_LABEL: Record<string, string> = {
  darwin: 'Show in Finder',
  win32: 'Show in File Explorer',
};

/** Launcher commands for Notes. The notes themselves live in the Notes window. */
export function notesExtension(store: NotesStore, notesWindow: NotesWindow): BuiltinExtension {
  const searchView = async (): Promise<View> => {
    const notes = await store.list();
    const items: ListItem[] = notes.map((note) => ({
      id: note.id,
      title: noteTitle(note.text),
      subtitle: notePreview(note.text),
      icon: { builtin: 'note', tint: 'yellow' },
      // Search the whole note, not just its title.
      keywords: [note.text.slice(0, 5000)],
      accessory: timeAgo(note.updatedAt),
      actions: [
        { type: 'callback', id: 'open', payload: note.id, title: 'Open Note' },
        { type: 'copy', text: note.text, title: 'Copy Note' },
        { type: 'reveal-path', path: store.pathOf(note.id), title: REVEAL_LABEL[process.platform] ?? 'Show in Folder' },
        {
          type: 'callback',
          id: 'trash',
          payload: note.id,
          title: 'Move to Trash',
          style: 'destructive',
          shortcut: { key: 'Backspace', modifiers: ['mod'] },
        },
      ],
    }));
    return {
      type: 'list',
      title: 'Notes',
      searchPlaceholder: 'Search notes…',
      sections: [{ title: `${notes.length} note${notes.length === 1 ? '' : 's'}`, items }],
      emptyText: 'No notes yet. Run Create Note to write one.',
    };
  };

  return {
    manifest: {
      name: 'notes',
      title: 'Notes',
      icon: { builtin: 'note', tint: 'yellow' },
      commands: [
        {
          name: 'create',
          title: 'Create Note',
          mode: 'no-view',
          fallback: true,
          keywords: ['new note', 'jot', 'write', 'memo'],
        },
        {
          name: 'search',
          title: 'Search Notes',
          mode: 'view',
          icon: { builtin: 'search', tint: 'yellow' },
          keywords: ['find note', 'browse notes'],
        },
        { name: 'open', title: 'Open Notes', mode: 'no-view', keywords: ['notes window', 'scratchpad'] },
      ],
    },
    commands: {
      create: {
        // As a fallback, whatever you typed in the launcher becomes the note.
        async run(ctx) {
          const note = await store.create(ctx.argument?.trim() ? `${ctx.argument.trim()}\n` : '');
          notesWindow.open(note.id);
          return { hide: true };
        },
      },
      search: {
        view: searchView,
        async onAction(id, payload) {
          if (typeof payload !== 'string') return undefined;
          if (id === 'open') {
            notesWindow.open(payload);
            return { hide: true };
          }
          if (id === 'trash') {
            await store.trash(payload);
            return { replace: await searchView(), toast: 'Moved to Trash' };
          }
          return undefined;
        },
      },
      open: {
        run() {
          notesWindow.open();
          return { hide: true };
        },
      },
    },
  };
}
