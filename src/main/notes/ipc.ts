import { ipcMain, shell } from 'electron';
import { isOpenableLink, NotesChannel, type NotesWindowState } from '../../shared/notes';
import type { NotesStore } from './store';
import type { NotesWindow } from './window';

/** Wires the Notes window's `window.notes` API to the store. */
export function registerNotesIpc(store: NotesStore, notesWindow: NotesWindow): void {
  const check = (event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent) => {
    if (!notesWindow.webContents || event.sender !== notesWindow.webContents) throw new Error('Unexpected sender');
  };
  const text = (value: unknown) => {
    if (typeof value !== 'string') throw new Error('Note text must be a string');
    return value;
  };
  const id = (value: unknown) => {
    if (typeof value !== 'string') throw new Error('Note id must be a string');
    return value;
  };

  ipcMain.handle(NotesChannel.list, (event) => {
    check(event);
    return store.list();
  });
  ipcMain.handle(NotesChannel.create, (event, value: unknown) => {
    check(event);
    return store.create(value === undefined ? '' : text(value));
  });
  ipcMain.handle(NotesChannel.update, (event, noteId: unknown, value: unknown) => {
    check(event);
    return store.update(id(noteId), text(value));
  });
  ipcMain.on(NotesChannel.flush, (event, noteId: unknown, value: unknown) => {
    check(event);
    store.update(id(noteId), text(value)).catch((error: unknown) => console.error('[notes] Save failed:', error));
  });
  ipcMain.handle(NotesChannel.discardIfEmpty, (event, noteId: unknown) => {
    check(event);
    return store.discardIfEmpty(id(noteId));
  });
  ipcMain.handle(NotesChannel.trash, (event, noteId: unknown) => {
    check(event);
    return store.trash(id(noteId));
  });
  ipcMain.on(NotesChannel.openLink, (event, url: unknown) => {
    check(event);
    if (typeof url === 'string' && isOpenableLink(url)) void shell.openExternal(url.trim());
  });
  ipcMain.on(NotesChannel.reveal, (event, noteId: unknown) => {
    check(event);
    shell.showItemInFolder(store.pathOf(id(noteId)));
  });
  ipcMain.handle(NotesChannel.getState, (event) => {
    check(event);
    const { alwaysOnTop, sidebar, currentId } = notesWindow.getState();
    return { alwaysOnTop, sidebar, ...(currentId ? { currentId } : {}) };
  });
  ipcMain.on(NotesChannel.setState, (event, patch: Partial<NotesWindowState>) => {
    check(event);
    notesWindow.setState(typeof patch === 'object' && patch !== null ? patch : {});
  });
  ipcMain.on(NotesChannel.setCurrent, (event, noteId: unknown) => {
    check(event);
    notesWindow.setCurrent(id(noteId));
  });
}
