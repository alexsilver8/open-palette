import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { frecencyScore, UsageTracker } from './usage';

const DAY = 24 * 60 * 60 * 1000;

describe('frecencyScore', () => {
  it('is zero for unused items', () => {
    expect(frecencyScore(undefined, 0)).toBe(0);
  });

  it('halves every two weeks', () => {
    expect(frecencyScore({ count: 4, lastUsed: 0 }, 0)).toBe(4);
    expect(frecencyScore({ count: 4, lastUsed: 0 }, 14 * DAY)).toBeCloseTo(2);
    expect(frecencyScore({ count: 4, lastUsed: 0 }, 28 * DAY)).toBeCloseTo(1);
  });
});

describe('UsageTracker', () => {
  it('ranks recently and frequently used items higher, and persists', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'usage-')), 'usage.json');
    let now = 0;
    const tracker = new UsageTracker(path, () => now);
    tracker.record('a');
    tracker.record('a');
    tracker.record('b');
    expect(tracker.score('a')).toBeGreaterThan(tracker.score('b'));
    expect(tracker.score('c')).toBe(0);

    now = 60 * DAY;
    tracker.record('b');
    expect(tracker.score('b')).toBeGreaterThan(tracker.score('a'));

    tracker.flush();
    expect(new UsageTracker(path, () => now).score('b')).toBeCloseTo(tracker.score('b'));
  });
});
