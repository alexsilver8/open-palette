import { describe, expect, it } from 'vitest';
import { countWords, notePreview, noteTitle } from './notes';

describe('noteTitle', () => {
  it('uses the first non-empty line without Markdown markers', () => {
    expect(noteTitle('\n\n# Groceries\n- oat milk')).toBe('Groceries');
    expect(noteTitle('- [ ] **call** the bank')).toBe('call the bank');
    expect(noteTitle('> quoted idea')).toBe('quoted idea');
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
});
