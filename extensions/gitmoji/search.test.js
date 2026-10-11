import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { asTitle, searchGitmojis } from './search.js';

const { gitmojis } = JSON.parse(readFileSync(new URL('./gitmojis.json', import.meta.url), 'utf8'));
const names = (query) => searchGitmojis(gitmojis, query).map((gitmoji) => gitmoji.name);

describe('searchGitmojis', () => {
  it('lists every gitmoji for an empty search', () => {
    expect(searchGitmojis(gitmojis, '  ')).toHaveLength(gitmojis.length);
  });

  it('puts a name match first, then description matches', () => {
    expect(names('bug')[0]).toBe('bug');
    expect(names(':sparkles:')[0]).toBe('sparkles');
    expect(names('feature')).toContain('sparkles');
    expect(names('doc')[0]).toBe('memo');
  });

  it('needs every word to match', () => {
    expect(names('fix bug')).toContain('bug');
    expect(names('fix nothingmatches')).toEqual([]);
  });

  it('finds a gitmoji by its emoji', () => {
    expect(names('✨')).toEqual(['sparkles']);
  });
});

describe('asTitle', () => {
  it('drops the full stop', () => {
    expect(asTitle('Introduce new features.')).toBe('Introduce new features');
  });
});
