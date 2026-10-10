import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ExtensionStorage } from '../shared/extension-api';
import type { Json } from '../shared/types';

/** A JSON file in the extension's support folder, read once and written on every change. */
export function createStorage(supportPath: string): ExtensionStorage {
  const file = join(supportPath, 'storage.json');
  let data: Record<string, Json> | undefined;

  const load = (): Record<string, Json> => {
    if (data) return data;
    try {
      const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
      data =
        typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, Json>) : {};
    } catch {
      data = {};
    }
    return data;
  };
  const save = () => {
    mkdirSync(supportPath, { recursive: true });
    const temporary = `${file}.tmp`;
    writeFileSync(temporary, JSON.stringify(load(), null, 2));
    renameSync(temporary, file);
  };

  return {
    get: <T extends Json = Json>(key: string) => load()[key] as T | undefined,
    set: (key, value) => {
      load()[key] = value;
      save();
    },
    remove: (key) => {
      delete load()[key];
      save();
    },
  };
}
