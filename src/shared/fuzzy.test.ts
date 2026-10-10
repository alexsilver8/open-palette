import { describe, expect, it } from 'vitest';
import { fuzzyMatch } from './fuzzy';

describe('fuzzyMatch', () => {
  it('matches characters in order, case-insensitively', () => {
    expect(fuzzyMatch('gc', 'Google Chrome')).not.toBeNull();
    expect(fuzzyMatch('GC', 'google chrome')).not.toBeNull();
  });

  it('rejects text that does not contain the query as a subsequence', () => {
    expect(fuzzyMatch('xyz', 'Google Chrome')).toBeNull();
    expect(fuzzyMatch('cg', 'Google Chrome')).toBeNull();
    expect(fuzzyMatch('toolong', 'tool')).toBeNull();
  });

  it('matches everything with an empty query', () => {
    expect(fuzzyMatch('', 'anything')).toEqual({ score: 0, positions: [] });
  });

  it('reports the matched positions, preferring word starts', () => {
    expect(fuzzyMatch('gc', 'Google Chrome')?.positions).toEqual([0, 7]);
    expect(fuzzyMatch('vsc', 'Visual Studio Code')?.positions).toEqual([0, 7, 14]);
  });

  it('prefers consecutive matches', () => {
    expect(fuzzyMatch('chr', 'Google Chrome')?.positions).toEqual([7, 8, 9]);
  });

  it('scores word-start and consecutive matches above scattered ones', () => {
    const chrome = fuzzyMatch('chr', 'Google Chrome')?.score ?? 0;
    const character = fuzzyMatch('chr', 'Character Viewer')?.score ?? 0;
    expect(chrome).toBeGreaterThan(character);
  });

  it('scores an exact match highest', () => {
    const exact = fuzzyMatch('notes', 'Notes')?.score ?? 0;
    const prefix = fuzzyMatch('notes', 'Notes Helper')?.score ?? 0;
    expect(exact).toBeGreaterThan(prefix);
  });

  it('treats camelCase humps as word starts', () => {
    expect(fuzzyMatch('ps', 'openPalette Settings')?.positions).toEqual([4, 12]);
  });

  it('keeps highlight positions aligned when lowercasing changes length', () => {
    expect(fuzzyMatch('st', 'İstanbul')?.positions).toEqual([1, 2]);
  });

  it('handles long text with a substring fallback', () => {
    const long = `${'x'.repeat(300)}needle`;
    expect(fuzzyMatch('needle', long)?.positions).toEqual([300, 301, 302, 303, 304, 305]);
    expect(fuzzyMatch('nedl', long)).toBeNull();
  });
});
