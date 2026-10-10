import { describe, expect, it } from 'vitest';
import { timeAgo } from './time';

describe('timeAgo', () => {
  const now = Date.UTC(2026, 9, 10, 12);
  it.each([
    [now - 10_000, 'just now'],
    [now - 5 * 60_000, '5m ago'],
    [now - 3 * 3_600_000, '3h ago'],
    [now - 2 * 86_400_000, '2d ago'],
    [Date.UTC(2026, 8, 1, 12), 'Sep 1'],
  ])('%i → %s', (timestamp, expected) => {
    expect(timeAgo(timestamp, now)).toBe(expected);
  });
});
