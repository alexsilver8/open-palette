import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** Reads and parses a JSON file. Returns `undefined` if it doesn't exist; throws if it isn't valid JSON. */
export function readJsonFile(path: string): unknown {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  return JSON.parse(text);
}

/** Writes JSON via a temporary file and a rename, so a crash never leaves a half-written file. */
export function writeJsonFile(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`);
  renameSync(temporary, path);
}

/** Calls `fn` once things have been quiet for `ms` milliseconds. */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  ms: number,
): ((...args: A) => void) & { flush(): void; cancel(): void } {
  let timer: NodeJS.Timeout | undefined;
  let pending: A | undefined;
  const debounced = (...args: A) => {
    pending = args;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      const callArgs = pending as A;
      pending = undefined;
      fn(...callArgs);
    }, ms);
  };
  debounced.flush = () => {
    if (!timer || !pending) return;
    clearTimeout(timer);
    timer = undefined;
    const callArgs = pending;
    pending = undefined;
    fn(...callArgs);
  };
  debounced.cancel = () => {
    clearTimeout(timer);
    timer = undefined;
    pending = undefined;
  };
  return debounced;
}
