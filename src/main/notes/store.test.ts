import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NotesStore } from './store';

function setup() {
  const dir = join(mkdtempSync(join(tmpdir(), 'notes-')), 'notes');
  const trashed: string[] = [];
  const store = new NotesStore(dir, async (path) => {
    trashed.push(path);
  });
  return { dir, store, trashed };
}

describe('NotesStore', () => {
  it('creates notes as Markdown files and lists them newest first', async () => {
    const { dir, store } = setup();
    const first = await store.create('# First');
    await new Promise((resolve) => setTimeout(resolve, 15));
    const second = await store.create('# Second');
    expect(readFileSync(join(dir, `${first.id}.md`), 'utf8')).toBe('# First');
    expect((await store.list()).map((n) => n.id)).toEqual([second.id, first.id]);
    expect(first.createdAt).toBeGreaterThan(Date.now() - 60_000);
  });

  it('has no limit on the number of notes', async () => {
    const { store } = setup();
    await Promise.all(Array.from({ length: 250 }, (_, i) => store.create(`Note ${i}`)));
    expect(await store.list()).toHaveLength(250);
  });

  it('updates notes and moves edited ones to the top', async () => {
    const { store } = setup();
    const a = await store.create('a');
    await store.create('b');
    await new Promise((resolve) => setTimeout(resolve, 15));
    const updated = await store.update(a.id, 'a, edited');
    expect(updated.text).toBe('a, edited');
    expect((await store.list())[0]?.id).toBe(a.id);
  });

  it('picks up Markdown files added by other apps', async () => {
    const { dir, store } = setup();
    await store.list();
    writeFileSync(join(dir, 'Groceries.md'), '- oat milk');
    writeFileSync(join(dir, 'readme.txt'), 'not a note');
    const notes = await store.list();
    expect(notes.map((n) => n.id)).toEqual(['Groceries']);
  });

  it('moves notes to the Trash, and only discards empty ones', async () => {
    const { dir, store, trashed } = setup();
    const kept = await store.create('keep me');
    const empty = await store.create('  \n');
    expect(await store.discardIfEmpty(kept.id)).toBe(false);
    expect(await store.discardIfEmpty(empty.id)).toBe(true);
    expect(existsSync(join(dir, `${empty.id}.md`))).toBe(false);
    await store.trash(kept.id);
    expect(trashed).toEqual([join(dir, `${kept.id}.md`)]);
  });

  it('rejects ids that would escape the folder', async () => {
    const { store } = setup();
    await expect(store.update('../evil', 'x')).rejects.toThrow('Invalid note id');
    await expect(store.update('a/b', 'x')).rejects.toThrow('Invalid note id');
    await expect(store.update('.hidden', 'x')).rejects.toThrow('Invalid note id');
  });
});
