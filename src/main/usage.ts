import { debounce, readJsonFile, writeJsonFile } from './json-file';

interface UsageEntry {
  count: number;
  /** Epoch milliseconds. */
  lastUsed: number;
}

const HALF_LIFE_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 500;

/**
 * "Frecency": how often something was used, with older uses fading away. An item used
 * ten times a month ago ranks about like one used 2–3 times this week.
 */
export function frecencyScore(entry: UsageEntry | undefined, now: number): number {
  if (!entry) return 0;
  const ageDays = Math.max(0, now - entry.lastUsed) / DAY_MS;
  return entry.count * 0.5 ** (ageDays / HALF_LIFE_DAYS);
}

/** Remembers which root items get used, to rank them higher next time. */
export class UsageTracker {
  private entries: Record<string, UsageEntry>;
  private readonly save = debounce(() => writeJsonFile(this.path, this.entries), 1000);

  constructor(
    private readonly path: string,
    private readonly now: () => number = Date.now,
  ) {
    let loaded: unknown;
    try {
      loaded = readJsonFile(path);
    } catch {
      loaded = undefined;
    }
    this.entries = typeof loaded === 'object' && loaded !== null ? (loaded as Record<string, UsageEntry>) : {};
  }

  record(id: string): void {
    const entry = this.entries[id];
    this.entries[id] = { count: (entry?.count ?? 0) + 1, lastUsed: this.now() };
    this.prune();
    this.save();
  }

  score(id: string): number {
    return frecencyScore(this.entries[id], this.now());
  }

  flush(): void {
    this.save.flush();
  }

  private prune(): void {
    const ids = Object.keys(this.entries);
    if (ids.length <= MAX_ENTRIES) return;
    const now = this.now();
    ids
      .sort((a, b) => frecencyScore(this.entries[a], now) - frecencyScore(this.entries[b], now))
      .slice(0, ids.length - MAX_ENTRIES)
      .forEach((id) => {
        delete this.entries[id];
      });
  }
}
