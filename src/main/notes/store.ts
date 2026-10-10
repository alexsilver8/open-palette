import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { type FSWatcher, watch } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { Note } from '../../shared/notes';
import { debounce } from '../json-file';

const EXTENSION = '.md';

/** Any file name in the folder is a valid id, as long as it can't escape the folder. */
function assertValidId(id: string): void {
  if (!id || id.length > 200 || id !== basename(id) || id.startsWith('.') || /[\\/]/.test(id)) {
    throw new Error(`Invalid note id: ${id}`);
  }
}

/** Ids made here start with the creation time in base 36, so they sort and date themselves. */
function createdAtFromId(id: string): number | undefined {
  const match = /^([0-9a-z]{8,9})-[0-9a-f]{4}$/.exec(id);
  if (!match) return undefined;
  const time = Number.parseInt(match[1] as string, 36);
  return Number.isFinite(time) && time > 1e12 ? time : undefined;
}

/**
 * Notes are Markdown files in one folder — no database, no limit. Files added, edited or
 * removed by other apps (a sync client, your editor) show up too.
 */
export class NotesStore extends EventEmitter<{ change: [] }> {
  private watcher: FSWatcher | undefined;
  private readonly announce = debounce(() => this.emit('change'), 250);

  constructor(
    private dir: string,
    /** Moves a file to the system Trash. */
    private readonly trashFile: (path: string) => Promise<void>,
  ) {
    super();
  }

  get directory(): string {
    return this.dir;
  }

  setDirectory(dir: string): void {
    if (dir === this.dir) return;
    this.dir = dir;
    if (this.watcher) {
      this.unwatch();
      void this.watch();
    }
    this.emit('change');
  }

  pathOf(id: string): string {
    assertValidId(id);
    return join(this.dir, `${id}${EXTENSION}`);
  }

  /** All notes, most recently edited first. */
  async list(): Promise<Note[]> {
    await mkdir(this.dir, { recursive: true });
    const entries = await readdir(this.dir, { withFileTypes: true });
    const notes = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(EXTENSION) && !entry.name.startsWith('.'))
        .map((entry) => this.read(entry.name.slice(0, -EXTENSION.length)).catch(() => undefined)),
    );
    return notes.filter((note): note is Note => note !== undefined).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async get(id: string): Promise<Note | undefined> {
    return this.read(id).catch(() => undefined);
  }

  async create(text = ''): Promise<Note> {
    await mkdir(this.dir, { recursive: true });
    const id = `${Date.now().toString(36)}-${randomBytes(2).toString('hex')}`;
    await this.write(id, text);
    return this.read(id);
  }

  async update(id: string, text: string): Promise<Note> {
    await mkdir(this.dir, { recursive: true });
    await this.write(id, text);
    return this.read(id);
  }

  /** Moves a note to the system Trash, so a mistake can be undone. */
  async trash(id: string): Promise<void> {
    await this.trashFile(this.pathOf(id));
  }

  /** Deletes a note for good, but only if there's nothing in it. */
  async discardIfEmpty(id: string): Promise<boolean> {
    const note = await this.get(id);
    if (!note || note.text.trim()) return false;
    await rm(this.pathOf(id), { force: true });
    return true;
  }

  async watch(): Promise<void> {
    if (this.watcher) return;
    await mkdir(this.dir, { recursive: true });
    try {
      this.watcher = watch(this.dir, () => this.announce());
    } catch (error) {
      console.warn('[notes] Could not watch the notes folder:', error);
    }
  }

  unwatch(): void {
    this.watcher?.close();
    this.watcher = undefined;
  }

  private async read(id: string): Promise<Note> {
    const path = this.pathOf(id);
    const [text, info] = await Promise.all([readFile(path, 'utf8'), stat(path)]);
    return {
      id,
      text,
      createdAt: createdAtFromId(id) ?? (info.birthtimeMs || info.mtimeMs),
      updatedAt: info.mtimeMs,
    };
  }

  private async write(id: string, text: string): Promise<void> {
    const path = this.pathOf(id);
    const temporary = join(this.dir, `.${id}.${randomBytes(4).toString('hex')}.tmp`);
    await writeFile(temporary, text);
    await rename(temporary, path);
  }
}
