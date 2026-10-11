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
  openLink: 'notes:open-link',
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
  /** Opens a web or mail link from a note in the default app. */
  openLink(url: string): void;
  onOpen(listener: (id: string) => void): () => void;
  onChanged(listener: () => void): () => void;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Turns `&amp;`, `&nbsp;`, `&#39;` and the like back into characters. */
function decodeEntities(text: string): string {
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
    if (name[0] === '#') {
      const code = name[1]?.toLowerCase() === 'x' ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1));
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    }
    return ENTITIES[name.toLowerCase()] ?? entity;
  });
}

// Escaped punctuation (`\_`, `\*`) is set aside as private-use characters while markers are
// stripped, so a literal `*` or `_` survives and an emphasis marker doesn't.
const ESCAPED = /\\([!-/:-@[-`{-~])/g;
const protect = (text: string) =>
  text.replace(ESCAPED, (_, char: string) => String.fromCharCode(0xe000 + char.charCodeAt(0)));
const restore = (text: string) =>
  text.replace(/[\ue000-\ue07f]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xe000));

/** A line as you'd read it: no heading, quote, list or checkbox markers, links as their text. */
function stripMarkdown(line: string): string {
  // Code fences mark where a code block starts and ends; they aren't text.
  if (/^\s{0,3}(```|~~~)/.test(line)) return '';
  const text = protect(line)
    .replace(/^\s*(?:>\s?)*/, '')
    .replace(/^\s*(#{1,6}\s+|[-*+]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+)/, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*`~]/g, '')
    // Underscores mark emphasis at the edges of words; inside one (snake_case) they're text.
    .replace(/(^|[^\p{L}\p{N}])_+|_+(?=[^\p{L}\p{N}]|$)/gu, '$1');
  return decodeEntities(restore(text)).trim();
}

/**
 * A note's Markdown made easier to read where it's shown as text: entities decoded and
 * backslash escapes dropped, with the block markers (`#`, `-`, `- [ ]`) kept.
 */
export function readableMarkdown(text: string): string {
  return decodeEntities(text.replace(ESCAPED, '$1'));
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
  const words = meaningfulLines(text).join(' ').match(/\S+/g);
  return words ? words.length : 0;
}

/** Links a note may open: web pages and email. Anything else (file:, javascript:) is refused. */
export function isOpenableLink(url: string): boolean {
  return /^(https?:\/\/|mailto:)\S+$/i.test(url.trim());
}

/**
 * What's typed into a note's link field, as an address: `example.com` and `localhost:5173`
 * get `https://`, an email address gets `mailto:`. Empty input gives '' (remove the link);
 * an address of any other kind (`javascript:`, `file:`) gives null.
 */
export function normalizeLink(value: string): string | null {
  const text = value.trim();
  if (!text) return '';
  if (/^(https?:\/\/|mailto:|tel:)\S+$/i.test(text)) return text;
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(text) || /^(javascript|data|file|vbscript):/i.test(text)) return null;
  if (/^[^\s@/:]+@[^\s@/]+\.[^\s@/]+$/.test(text)) return `mailto:${text}`;
  if (/\s/.test(text)) return null;
  return `https://${text}`;
}
