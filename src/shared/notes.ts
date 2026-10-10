/** Notes: plain Markdown files, as many as you like. Shared by the main process and the Notes window. */
import type { Platform } from './types';

export interface Note {
  /** The file name without `.md`. */
  id: string;
  text: string;
  /** Epoch milliseconds. */
  createdAt: number;
  updatedAt: number;
}

export interface NotesWindowState {
  /** Keep the Notes window above other windows. */
  alwaysOnTop: boolean;
  sidebar: boolean;
}

export const NotesChannel = {
  list: 'notes:list',
  create: 'notes:create',
  update: 'notes:update',
  /** Fire-and-forget save, used while the window is closing. */
  flush: 'notes:flush',
  /** Deletes a note only if it's empty; used when leaving a note you never wrote in. */
  discardIfEmpty: 'notes:discard-if-empty',
  trash: 'notes:trash',
  reveal: 'notes:reveal',
  getState: 'notes:get-state',
  setState: 'notes:set-state',
  setCurrent: 'notes:set-current',
  /** main → window: show this note. */
  open: 'notes:open',
  /** main → window: files changed on disk. */
  changed: 'notes:changed',
} as const;

/** What the Notes window's preload exposes as `window.notes`. */
export interface NotesApi {
  platform: Platform;
  list(): Promise<Note[]>;
  create(text?: string): Promise<Note>;
  update(id: string, text: string): Promise<Note>;
  flush(id: string, text: string): void;
  discardIfEmpty(id: string): Promise<boolean>;
  trash(id: string): Promise<void>;
  reveal(id: string): void;
  getState(): Promise<NotesWindowState & { currentId?: string }>;
  setState(patch: Partial<NotesWindowState>): void;
  setCurrent(id: string): void;
  onOpen(listener: (id: string) => void): () => void;
  onChanged(listener: () => void): () => void;
}

function stripMarkdown(line: string): string {
  return line
    .replace(/^\s{0,3}(#{1,6}\s+|>\s?|[-*+]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+)/, '')
    .replace(/[*_`~]/g, '')
    .trim();
}

function meaningfulLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map(stripMarkdown)
    .filter((line) => line.length > 0);
}

/** The first line with something in it, without Markdown markers. */
export function noteTitle(text: string): string {
  const title = meaningfulLines(text)[0] ?? '';
  if (!title) return 'Untitled';
  return title.length > 80 ? `${title.slice(0, 79)}…` : title;
}

/** The line after the title, for list previews. */
export function notePreview(text: string): string {
  const preview = meaningfulLines(text)[1] ?? '';
  return preview.length > 120 ? `${preview.slice(0, 119)}…` : preview;
}

export function countWords(text: string): number {
  const words = text.trim().match(/\S+/g);
  return words ? words.length : 0;
}
