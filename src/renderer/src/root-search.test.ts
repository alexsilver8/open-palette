import { describe, expect, it } from 'vitest';
import type { RootItem } from '../../shared/types';
import { asUrl, buildRootSections, countRootMatches } from './root-search';

const command = (title: string, extra: Partial<RootItem> = {}): RootItem => ({
  id: `command:x/${title}`,
  kind: 'command',
  title,
  frecency: 0,
  actions: [{ type: 'open-command', ref: { extension: 'x', command: title } }],
  ...extra,
});
const app = (title: string, frecency = 0): RootItem => ({
  id: `app:/Applications/${title}.app`,
  kind: 'application',
  title,
  frecency,
  actions: [{ type: 'open-path', path: `/Applications/${title}.app` }],
});

const note = (title: string, body: string): RootItem => ({
  id: `note:${title}`,
  kind: 'note',
  title,
  keywords: [`${title}\n${body}`],
  frecency: 0,
  detail: { body },
  actions: [{ type: 'open-command', ref: { extension: 'notes', command: 'open' }, argument: title }],
});
const copied = (text: string): RootItem => ({
  id: `clipboard:${text}`,
  kind: 'clipboard',
  title: text,
  keywords: [text],
  frecency: 0,
  actions: [{ type: 'copy', text }],
});

const items: RootItem[] = [
  command('Clipboard History', { frecency: 3 }),
  command('Search Google', { fallback: { extension: 'web-search', command: 'google' } }),
  command('Quit Open Palette'),
  app('Safari', 1),
  app('Calendar'),
  app('Calculator'),
  note('Groceries', '- oat milk\n- sourdough'),
  note('Trip to Lisbon', 'pack the safari hat'),
  copied('oat milk barista edition'),
];

const titles = (query: string) =>
  buildRootSections(items, query).map((s) => [s.title, s.items.map((i) => i.title)] as const);

describe('buildRootSections', () => {
  it('shows suggestions by usage, then the remaining commands, when the query is empty', () => {
    expect(titles('')).toEqual([
      ['Suggestions', ['Clipboard History', 'Safari']],
      ['Commands', ['Quit Open Palette', 'Search Google']],
    ]);
  });

  it('ranks results and offers fallbacks with the query as argument', () => {
    const sections = buildRootSections(items, 'cal');
    expect(sections.map((s) => s.title)).toEqual(['Results', 'Use “cal” with…']);
    expect(sections[0]?.items.map((i) => i.title)).toEqual(['Calendar', 'Calculator']);
    expect(sections[1]?.items[0]?.actions[0]).toEqual({
      type: 'open-command',
      ref: { extension: 'web-search', command: 'google' },
      argument: 'cal',
      title: 'Search Google',
    });
  });

  it('puts a calculator row first for arithmetic', () => {
    const [first] = buildRootSections(items, '12 * 7');
    expect(first?.title).toBe('Calculator');
    expect(first?.items[0]?.calculator).toEqual({ expression: '12 * 7', result: '84' });
    expect(first?.items[0]?.actions[0]).toEqual({ type: 'copy', text: '84', title: 'Copy Answer' });
  });

  it('offers to open things that look like links', () => {
    const [first] = buildRootSections(items, 'github.com/alexsilver8');
    expect(first?.title).toBe('Link');
    expect(first?.items[0]?.actions[0]).toMatchObject({ type: 'open-url', url: 'https://github.com/alexsilver8' });
  });

  it('remembers which root item a row came from', () => {
    const [results] = buildRootSections(items, 'safari');
    expect(results?.items[0]?.rootItemId).toBe('app:/Applications/Safari.app');
  });
});

describe('asUrl', () => {
  it.each([
    ['https://example.com/a?b=c', 'https://example.com/a?b=c'],
    ['example.com', 'https://example.com'],
    ['www.example.io/path', 'https://www.example.io/path'],
    ['notes.txt', null],
    ['hello world', null],
    ['2+2', null],
  ])('%s → %s', (query, expected) => {
    expect(asUrl(query)).toBe(expected);
  });
});

describe('filter tabs', () => {
  it('keeps notes and clipboard out of the empty root', () => {
    const shown = buildRootSections(items, '').flatMap((s) => s.items.map((i) => i.title));
    expect(shown).not.toContain('Groceries');
    expect(shown).not.toContain('oat milk barista edition');
  });

  it('adds a taste of matching notes and clipboard entries to All', () => {
    const sections = buildRootSections(items, 'oat milk');
    expect(sections.map((s) => s.title)).toEqual(['Notes', 'Clipboard', 'Use “oat milk” with…']);
    expect(sections[0]?.items[0]?.title).toBe('Groceries');
    expect(sections[0]?.items[0]?.detail).toEqual({ body: '- oat milk\n- sourdough' });
  });

  it('lists everything of one kind in its tab, newest first when empty', () => {
    expect(titles2(buildRootSections(items, '', 'note'))).toEqual([['Recent notes', ['Groceries', 'Trip to Lisbon']]]);
    expect(titles2(buildRootSections(items, '', 'application'))).toEqual([
      ['Applications', ['Calculator', 'Calendar', 'Safari']],
    ]);
    expect(titles2(buildRootSections(items, 'safari', 'note'))).toEqual([['Notes', ['Trip to Lisbon']]]);
  });

  it('only records usage for apps and commands', () => {
    const [notes] = buildRootSections(items, '', 'note');
    expect(notes?.items[0]?.rootItemId).toBeUndefined();
    const [apps] = buildRootSections(items, '', 'application');
    expect(apps?.items[0]?.rootItemId).toBe('app:/Applications/Calculator.app');
  });

  it('counts matches per tab', () => {
    expect(countRootMatches(items, 'safari')).toEqual({ all: 2, application: 1, command: 0, note: 1, clipboard: 0 });
    expect(countRootMatches(items, '').all).toBe(items.length);
  });
});

function titles2(sections: ReturnType<typeof buildRootSections>) {
  return sections.map((s) => [s.title, s.items.map((i) => i.title)] as const);
}
