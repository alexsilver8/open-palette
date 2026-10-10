/**
 * Remembers rendered icons and limits how many are rendered at once, so scrolling through
 * hundreds of apps doesn't ask the OS for hundreds of icons in the same instant.
 */
export class IconCache {
  private readonly entries = new Map<string, Promise<Uint8Array>>();
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(
    private readonly load: (path: string) => Promise<Uint8Array>,
    private readonly maxEntries = 1000,
    private readonly concurrency = 4,
  ) {}

  get(path: string): Promise<Uint8Array> {
    const hit = this.entries.get(path);
    if (hit) {
      // Keep recently used icons at the end, so the oldest are evicted first.
      this.entries.delete(path);
      this.entries.set(path, hit);
      return hit;
    }
    const promise = this.schedule(() => this.load(path));
    this.entries.set(path, promise);
    // Don't remember failures; the file may be readable next time.
    promise.catch(() => {
      if (this.entries.get(path) === promise) this.entries.delete(path);
    });
    if (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    return promise;
  }

  private async schedule<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.concurrency) await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.active++;
    try {
      return await task();
    } finally {
      this.active--;
      this.waiting.shift()?.();
    }
  }
}

/**
 * The `size` to ask `app.getFileIcon` for. `large` is documented as unsupported on macOS,
 * where requesting it crashed the app, and is no bigger than `normal` on Windows.
 */
export function fileIconSize(platform: NodeJS.Platform): 'normal' | 'large' {
  return platform === 'linux' ? 'large' : 'normal';
}
