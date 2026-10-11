import { describe, expect, it } from 'vitest';
import { checkCommit, formatCommit, gitCommitCommand, guessType, parseCommit, releaseOf } from './commits.js';

describe('parseCommit', () => {
  it('reads type, scope, breaking mark and description', () => {
    expect(parseCommit('feat(auth)!: drop the old tokens')).toEqual({
      type: 'feat',
      scope: 'auth',
      breaking: true,
      description: 'drop the old tokens',
    });
    expect(parseCommit('fix: crash')).toEqual({ type: 'fix', breaking: false, description: 'crash' });
    expect(parseCommit('Fix:no space')).toEqual({ type: 'fix', breaking: false, description: 'no space' });
    expect(parseCommit('just some words')).toBeUndefined();
  });

  it('formats it back', () => {
    expect(formatCommit({ type: 'feat', scope: 'ui', breaking: true, description: 'x' })).toBe('feat(ui)!: x');
    expect(formatCommit({ type: 'docs', breaking: false, description: 'readme' })).toBe('docs: readme');
  });
});

describe('checkCommit', () => {
  const failing = (text) => {
    const commit = parseCommit(text);
    return commit
      ? checkCommit(commit)
          .filter((check) => !check.ok)
          .map((check) => check.text)
      : ['not a commit'];
  };

  it('passes a good header', () => {
    expect(failing('feat(search): find notes by their content')).toEqual([]);
  });

  it('says what to change', () => {
    expect(failing('feature: Add things.')).toEqual([
      expect.stringContaining('Use a known type: feat, fix'),
      'Start the description with a lowercase letter',
      'Drop the full stop at the end',
    ]);
    expect(failing('fix: ')).toEqual(['Describe the change after the colon']);
    expect(failing(`fix: ${'x'.repeat(80)}`)).toEqual(['Shorten it to 72 characters (now 85)']);
    expect(failing('fix(My Scope): thing')).toEqual(['Make the scope one lowercase word, like ui or auth']);
  });
});

describe('releaseOf', () => {
  it('follows semantic versioning', () => {
    expect(releaseOf({ type: 'feat', breaking: false, description: '' })).toBe('minor');
    expect(releaseOf({ type: 'fix', breaking: false, description: '' })).toBe('patch');
    expect(releaseOf({ type: 'docs', breaking: false, description: '' })).toBeNull();
    expect(releaseOf({ type: 'chore', breaking: true, description: '' })).toBe('major');
  });
});

describe('guessType', () => {
  it('reads the description for a hint', () => {
    expect(guessType('fix the crash on start')).toBe('fix');
    expect(guessType('update the README')).toBe('docs');
    expect(guessType('add tests for paste')).toBe('test');
    expect(guessType('rename the registry options')).toBe('refactor');
    expect(guessType('bump electron to 44')).toBe('build');
    expect(guessType('make search faster')).toBe('perf');
    expect(guessType('add a skin tone picker')).toBe('feat');
  });
});

describe('gitCommitCommand', () => {
  it('quotes for the shell', () => {
    expect(gitCommitCommand("fix: don't crash", 'darwin')).toBe(`git commit -m 'fix: don'\\''t crash'`);
    expect(gitCommitCommand('fix: say "hi" & $home\'s', 'win32')).toBe(`git commit -m 'fix: say "hi" & $home''s'`);
  });
});
