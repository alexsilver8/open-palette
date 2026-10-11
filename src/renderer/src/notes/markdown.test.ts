import { type JSONContent, resolveExtensions } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import { describe, expect, it } from 'vitest';
import {
  applyNoteStyle,
  escapeBlockStarts,
  escapeText,
  MARKED_OPTIONS,
  noteExtensions,
  showsFaithfully,
} from './markdown';

function manager(): MarkdownManager {
  const markdown = new MarkdownManager({
    extensions: resolveExtensions(noteExtensions({ onLinkShortcut: () => {} })),
    markedOptions: MARKED_OPTIONS,
  });
  applyNoteStyle(markdown);
  return markdown;
}

const roundTrip = (text: string) => {
  const m = manager();
  return m.serialize(m.parse(text));
};

const paragraph = (text: string): JSONContent => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

describe('note Markdown', () => {
  it('leaves notes as they were written', () => {
    for (const text of [
      '# Launch plan\n\nShip **v1.3** with the *glass* look.\n\n- [ ] Record a demo\n- [x] Settings window',
      'Groceries\noat milk\ncoffee beans',
      'see https://example.com/a?b=1 now',
      'www.example.com and alex@example.com',
      'R&D, 2 < 3 and snake_case',
      'Read [the docs](https://electronjs.org) first',
      '#### four\n\n###### six',
      '- a\n  - nested\n- b',
      '- [ ] a\n  - [x] b',
      '> quoted\n> more',
      '```js\nconst x = `<b>` && y_z;\n```',
      '1. one\n2. two',
      'Some `code` and ~~strike~~',
      'a\n\n\n\nb',
      'Code keeps `[https://x.com](https://x.com)` as typed',
      '```\n[https://x.com](https://x.com)\n```',
      '[www.example.com](https://www.example.com) keeps its https',
      '[sbb.ch](https://sbb.ch)',
    ]) {
      expect(roundTrip(text)).toBe(text);
    }
  });

  it('keeps typed text from turning into formatting when the note is opened again', () => {
    const m = manager();
    for (const text of [
      '1. not a list',
      '- not a bullet',
      '# not a heading',
      '> not a quote',
      '---',
      '*literal* [x]',
    ]) {
      const saved = m.serialize(paragraph(text));
      const reopened = m.parse(saved);
      expect(reopened.content?.[0]?.type).toBe('paragraph');
      expect(m.serialize(reopened)).toBe(saved);
    }
  });

  it('escapes only what Markdown would misread', () => {
    expect(escapeText('R&D, 2 < 3, snake_case')).toBe('R&D, 2 < 3, snake_case');
    expect(escapeText('&amp; <b> _edge_ *star* [x] `code` ~')).toBe(
      '&amp;amp; &lt;b> \\_edge\\_ \\*star\\* \\[x\\] \\`code\\` \\~',
    );
    expect(escapeBlockStarts('1. one\n- two\n# three\n> four\n***\nplain')).toBe(
      '1\\. one\n\\- two\n\\# three\n\\> four\n\\***\nplain',
    );
  });

  it('shows a note formatted only when nothing would be lost by saving it', () => {
    const m = manager();
    expect(showsFaithfully(m, '# Plan\n\n- [ ] one\n\nhttps://example.com R&D')).toBe(true);
    expect(showsFaithfully(m, '')).toBe(true);
    expect(showsFaithfully(m, '| a | b |\n|---|---|\n| 1 | 2 |')).toBe(false);
    expect(showsFaithfully(m, '![cat](cat.png)')).toBe(false);
    expect(showsFaithfully(m, '---\ntitle: x\n---\n\nbody')).toBe(false);
    expect(showsFaithfully(m, '[x][1]\n\n[1]: https://example.com')).toBe(false);
  });
});
