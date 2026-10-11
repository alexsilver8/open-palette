import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { asTitle, codePoints, inTone, loadEmojis, searchEmojis } from './search.js';

const emojis = loadEmojis(JSON.parse(readFileSync(new URL('./emojis.json', import.meta.url), 'utf8')));
const find = (query) => searchEmojis(emojis, query).map((emoji) => emoji.emoji);
const byName = (name) => emojis.find((emoji) => emoji.name === name);

describe('searchEmojis', () => {
  it('finds emoji by name, keyword and shortcode', () => {
    expect(find('grinning face')[0]).toBe('😀');
    expect(find('pizza')[0]).toBe('🍕');
    expect(find(':+1:')[0]).toBe(byName('thumbs up')?.emoji);
    expect(find('hello')).toContain('👋');
    expect(find('switzerland')).toContain('🇨🇭');
  });

  it('needs every word to match', () => {
    expect(find('red heart')[0]).toBe('❤️');
    expect(find('heart xylophonezzz')).toEqual([]);
  });

  it('finds a pasted emoji, whatever its skin tone', () => {
    expect(find('👋🏽')).toEqual(['👋']);
  });

  it('is empty for an empty search', () => {
    expect(find('  ')).toEqual([]);
  });
});

describe('skin tones', () => {
  it('applies to emoji that have them', () => {
    const wave = byName('waving hand');
    expect(wave && inTone(wave, 0)).toBe('👋');
    expect(wave && inTone(wave, 3)).toBe('👋🏽');
    const pizza = byName('pizza');
    expect(pizza && inTone(pizza, 3)).toBe('🍕');
  });
});

describe('formatting', () => {
  it('writes code points and titles', () => {
    expect(codePoints('👋🏽')).toBe('U+1F44B U+1F3FD');
    expect(codePoints('©')).toBe('U+00A9');
    expect(asTitle('flag: Switzerland')).toBe('Flag: Switzerland');
  });
});
