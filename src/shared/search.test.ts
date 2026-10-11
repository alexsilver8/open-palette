import { describe, expect, it } from 'vitest';
import { rankItems, scoreItem } from './search';

const items = [
  { title: 'Calculator' },
  { title: 'Calendar' },
  { title: 'Google Chrome', keywords: ['browser'] },
  { title: 'Character Viewer' },
  { title: 'Clipboard History', keywords: ['paste', 'copy'] },
  { title: 'System Settings', keywords: ['preferences'] },
];

const titles = (query: string) => rankItems(items, query).map((r) => r.item.title);

describe('rankItems', () => {
  it('keeps every item, in order, for an empty query', () => {
    expect(titles('')).toEqual(items.map((i) => i.title));
    expect(titles('   ')).toEqual(items.map((i) => i.title));
  });

  it('ranks prefix matches first', () => {
    expect(titles('cal')).toEqual(['Calendar', 'Calculator']);
  });

  it('prefers word-start matches over scattered ones', () => {
    expect(titles('chr')[0]).toBe('Google Chrome');
  });

  it('matches keywords', () => {
    expect(titles('browser')).toEqual(['Google Chrome']);
    expect(titles('preferences')).toEqual(['System Settings']);
  });

  it('matches multi-word queries in any order', () => {
    expect(titles('chrome google')).toEqual(['Google Chrome']);
    expect(titles('history clip')).toEqual(['Clipboard History']);
  });

  it('applies a boost', () => {
    const boosted = rankItems(items, 'cal', (item) => (item.title === 'Calculator' ? 10 : 0));
    expect(boosted[0]?.item.title).toBe('Calculator');
  });

  it('matches long content by words, not scattered letters', () => {
    const notes = [
      { title: 'Groceries', keywords: ['Groceries\n- oat milk\n- sourdough bread from the bakery on the corner'] },
      { title: 'Trip', keywords: ['Pack a hat, sunscreen and the travel adapter for the long weekend away'] },
    ];
    expect(rankItems(notes, 'cal').map((r) => r.item.title)).toEqual([]);
    expect(rankItems(notes, 'oat milk').map((r) => r.item.title)).toEqual(['Groceries']);
    expect(rankItems(notes, 'adapter hat').map((r) => r.item.title)).toEqual(['Trip']);
  });

  it('drops items that do not match', () => {
    expect(titles('zzz')).toEqual([]);
  });
});

describe('scoreItem', () => {
  it('returns title positions for highlighting', () => {
    expect(scoreItem('gc', { title: 'Google Chrome' })?.titlePositions).toEqual([0, 7]);
  });

  it('returns no title positions for keyword matches', () => {
    expect(scoreItem('browser', { title: 'Google Chrome', keywords: ['browser'] })?.titlePositions).toEqual([]);
  });
});
