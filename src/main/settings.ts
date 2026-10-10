import { EventEmitter } from 'node:events';
import { type FSWatcher, watch } from 'node:fs';
import { basename, dirname } from 'node:path';
import { normalizeSettings, type Settings } from '../shared/settings';
import { debounce, readJsonFile, writeJsonFile } from './json-file';

export type { Settings } from '../shared/settings';

interface SettingsEvents {
  change: [settings: Settings, previous: Settings];
}

/**
 * Loads settings from a JSON file, writes the defaults on first run so there is something
 * to edit, and reloads when the file changes on disk.
 */
export class SettingsStore extends EventEmitter<SettingsEvents> {
  private current: Settings;
  private watcher: FSWatcher | undefined;

  constructor(readonly path: string) {
    super();
    this.current = this.read() ?? normalizeSettings(undefined).settings;
    try {
      if (readJsonFile(path) === undefined) writeJsonFile(path, this.current);
    } catch {
      // Unreadable or invalid file: keep it as is so the user can fix it.
    }
  }

  get(): Settings {
    return this.current;
  }

  /** Changes some settings, saves the file and notifies listeners. Invalid values are dropped. */
  update(patch: Partial<Settings>): Settings {
    const previous = this.current;
    const { settings } = normalizeSettings({ ...previous, ...patch });
    this.current = settings;
    writeJsonFile(this.path, settings);
    if (JSON.stringify(settings) !== JSON.stringify(previous)) this.emit('change', settings, previous);
    return settings;
  }

  /** Starts watching the file. Editors often replace files on save, so watch the folder. */
  watch(): void {
    if (this.watcher) return;
    const reload = debounce(() => this.reload(), 150);
    this.watcher = watch(dirname(this.path), (_event, filename) => {
      if (!filename || filename === basename(this.path)) reload();
    });
  }

  close(): void {
    this.watcher?.close();
    this.watcher = undefined;
  }

  private reload(): void {
    const next = this.read();
    if (!next || JSON.stringify(next) === JSON.stringify(this.current)) return;
    const previous = this.current;
    this.current = next;
    this.emit('change', next, previous);
  }

  private read(): Settings | undefined {
    try {
      const { settings, problems } = normalizeSettings(readJsonFile(this.path));
      for (const problem of problems) console.warn(`[settings] ${problem}`);
      return settings;
    } catch (error) {
      console.warn(`[settings] Could not read ${this.path}: ${(error as Error).message}`);
      return undefined;
    }
  }
}
