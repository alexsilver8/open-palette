import { describe, expect, it } from 'vitest';
import { countWords, isOpenableLink, normalizeLink, notePreview, noteTitle, readableMarkdown } from './notes';

describe('noteTitle', () => {
  it('uses the first non-empty line without Markdown markers', () => {
    expect(noteTitle('\n\n# Groceries\n- oat milk')).toBe('Groceries');
    expect(noteTitle('- [ ] **call** the bank')).toBe('call the bank');
    expect(noteTitle('> quoted idea')).toBe('quoted idea');
  });

  it('reads formatted notes as text', () => {
    expect(noteTitle('Read [the docs](https://electronjs.org) first')).toBe('Read the docs first');
    expect(noteTitle('```js\nconst a = 1;\n```')).toBe('const a = 1;');
    expect(noteTitle('> - [x] quoted task')).toBe('quoted task');
    expect(noteTitle('## **Plan** for ~~Monday~~ Tuesday')).toBe('Plan for Monday Tuesday');
  });

  it('reads what the editor escapes as plain text', () => {
    expect(noteTitle('R&amp;D plan')).toBe('R&D plan');
    expect(noteTitle('fix snake\\_case and \\*stars\\*')).toBe('fix snake_case and *stars*');
    expect(noteTitle('snake_case _emphasis_')).toBe('snake_case emphasis');
    expect(noteTitle('1\\. Not a list')).toBe('1. Not a list');
    expect(noteTitle('&nbsp;\n\n&nbsp;\n\nReal title')).toBe('Real title');
    expect(notePreview('Title\n\n&nbsp;\n\nBody &lt;b&gt;')).toBe('Body <b>');
    expect(countWords('one\n\n&nbsp;\n\ntwo')).toBe(2);
  });

  it('falls back to Untitled', () => {
    expect(noteTitle('')).toBe('Untitled');
    expect(noteTitle('   \n#  \n')).toBe('Untitled');
  });

  it('shortens long titles', () => {
    expect(noteTitle('x'.repeat(200))).toHaveLength(80);
  });
});

describe('notePreview', () => {
  it('uses the second meaningful line', () => {
    expect(notePreview('# Groceries\n\n- oat milk\n- bread')).toBe('oat milk');
    expect(notePreview('Just one line')).toBe('');
  });
});

describe('countWords', () => {
  it('counts whitespace-separated words', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('  one two\nthree  ')).toBe(3);
  });

  it("doesn't count Markdown markers as words", () => {
    expect(countWords('# Plan\n\n- [ ] Record a demo\n- [x] Ship\n\n```\ncode\n```')).toBe(6);
    expect(countWords('See [the docs](https://example.com)')).toBe(3);
  });
});

describe('isOpenableLink', () => {
  it('allows web and mail links only', () => {
    expect(isOpenableLink('https://example.com/a?b=1')).toBe(true);
    expect(isOpenableLink('mailto:alex@example.com')).toBe(true);
    expect(isOpenableLink('file:///etc/passwd')).toBe(false);
    expect(isOpenableLink('javascript:alert(1)')).toBe(false);
    expect(isOpenableLink('https://')).toBe(false);
  });
});

describe('normalizeLink', () => {
  it('turns what was typed into an address', () => {
    expect(normalizeLink('example.com')).toBe('https://example.com');
    expect(normalizeLink('localhost:5173')).toBe('https://localhost:5173');
    expect(normalizeLink('example.com:8080/a?b=1')).toBe('https://example.com:8080/a?b=1');
    expect(normalizeLink('http://example.com')).toBe('http://example.com');
    expect(normalizeLink('alex@example.com')).toBe('mailto:alex@example.com');
    expect(normalizeLink('mailto:alex@example.com')).toBe('mailto:alex@example.com');
    expect(normalizeLink('  ')).toBe('');
  });

  it('refuses addresses it would not open', () => {
    expect(normalizeLink('javascript:alert(1)')).toBeNull();
    expect(normalizeLink('file:///etc/passwd')).toBeNull();
    expect(normalizeLink('ftp://example.com')).toBeNull();
    expect(normalizeLink('two words')).toBeNull();
  });
});

describe('readableMarkdown', () => {
  it('decodes entities and escapes but keeps structure', () => {
    expect(readableMarkdown('# R&amp;D\n\n- [ ] snake\\_case\n\n&nbsp;')).toBe('# R&D\n\n- [ ] snake_case\n\n ');
  });
});
