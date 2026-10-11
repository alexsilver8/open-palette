import { afterEach, describe, expect, it, vi } from 'vitest';
import { ago, dedupe, looksLikeToken, preview, refusal, toIssue, toRepository } from './github.js';
import extension from './index.js';

const ISSUE = {
  id: 3010,
  number: 22,
  title: 'docs: move the site to openpalette.alexsilver.dev',
  html_url: 'https://github.com/alexsilver8/open-palette/pull/22',
  repository_url: 'https://api.github.com/repos/alexsilver8/open-palette',
  user: { login: 'alexsilver8' },
  state: 'open',
  pull_request: { url: 'https://api.github.com/repos/alexsilver8/open-palette/pulls/22' },
  draft: false,
  labels: [{ name: 'docs' }],
  comments: 2,
  updated_at: '2026-10-11T13:00:00Z',
  body: '<!-- template -->\r\n## What & why\r\n\r\n* Moves the site\r\n',
};

const REPO = {
  id: 1413456704,
  name: 'open-palette',
  full_name: 'alexsilver8/open-palette',
  owner: { login: 'alexsilver8' },
  html_url: 'https://github.com/alexsilver8/open-palette',
  description: null,
  private: false,
  fork: false,
  archived: false,
  language: 'TypeScript',
  stargazers_count: 3,
  forks_count: 0,
  open_issues_count: 1,
  default_branch: 'main',
  pushed_at: '2026-10-11T13:34:00Z',
  ssh_url: 'git@github.com:alexsilver8/open-palette.git',
  clone_url: 'https://github.com/alexsilver8/open-palette.git',
};

describe('toIssue', () => {
  it('reads a search result', () => {
    expect(toIssue(ISSUE)).toEqual({
      id: 3010,
      number: 22,
      title: 'docs: move the site to openpalette.alexsilver.dev',
      url: 'https://github.com/alexsilver8/open-palette/pull/22',
      repo: 'alexsilver8/open-palette',
      author: 'alexsilver8',
      state: 'open',
      pullRequest: true,
      draft: false,
      labels: ['docs'],
      comments: 2,
      updated: '2026-10-11T13:00:00Z',
      body: ISSUE.body,
    });
    expect(toIssue({ ...ISSUE, pull_request: undefined })?.pullRequest).toBe(false);
    expect(toIssue({ title: 'broken' })).toBeUndefined();
  });
});

describe('toRepository', () => {
  it('reads a repository', () => {
    expect(toRepository(REPO)).toMatchObject({
      fullName: 'alexsilver8/open-palette',
      owner: 'alexsilver8',
      description: '',
      language: 'TypeScript',
      stars: 3,
      private: false,
      sshUrl: 'git@github.com:alexsilver8/open-palette.git',
    });
    expect(toRepository(null)).toBeUndefined();
  });
});

describe('helpers', () => {
  it('recognises tokens', () => {
    expect(looksLikeToken(`ghp_${'a1'.repeat(18)}`)).toBe(true);
    expect(looksLikeToken(` github_pat_${'A_1b'.repeat(15)} `)).toBe(true);
    expect(looksLikeToken('ghp_short')).toBe(false);
    expect(looksLikeToken('open palette')).toBe(false);
  });

  it('explains refusals', () => {
    const none = { get: () => null };
    expect(refusal(401, none, 0)).toMatch(/refused your token/);
    const limited = { get: (/** @type {string} */ name) => (name === 'x-ratelimit-remaining' ? '0' : '600') };
    expect(refusal(403, limited, 0)).toBe("GitHub's rate limit was reached. Try again in 10 min.");
    expect(refusal(403, none, 0)).toMatch(/repo scope/);
    expect(refusal(502, none, 0)).toBe('GitHub answered 502.');
  });

  it('keeps each item in its first section only', () => {
    const sections = dedupe([
      { title: 'A', items: [{ id: 1 }, { id: 2 }] },
      { title: 'B', items: [{ id: 2 }, { id: 3 }] },
    ]);
    expect(sections.map((section) => section.items.map((item) => item.id))).toEqual([[1, 2], [3]]);
  });

  it('tidies descriptions for the preview', () => {
    expect(preview(ISSUE.body)).toBe('# What & why\n\n- Moves the site');
    expect(preview('x'.repeat(2500))).toHaveLength(2001);
  });

  it('says how long ago', () => {
    const now = Date.parse('2026-10-11T14:00:00Z');
    expect(ago('2026-10-11T13:00:00Z', now)).toBe('1 hour ago');
    expect(ago('2026-10-09T13:00:00Z', now)).toBe('2 days ago');
    expect(ago('', now)).toBe('');
  });
});

describe('commands', () => {
  afterEach(() => vi.unstubAllGlobals());

  /** @param {Record<string, unknown>} [stored] */
  function context(stored = { token: `ghp_${'x'.repeat(36)}` }) {
    const store = new Map(Object.entries(stored));
    return {
      query: '',
      platform: /** @type {const} */ ('linux'),
      supportPath: '/tmp',
      extension: { name: 'github', path: '' },
      storage: {
        get: (/** @type {string} */ key) => store.get(key),
        set: (/** @type {string} */ key, /** @type {any} */ value) => store.set(key, value),
        remove: (/** @type {string} */ key) => store.delete(key),
      },
      store,
    };
  }

  it('lists pull requests by section, each once', async () => {
    const calls = /** @type {string[]} */ ([]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (/** @type {string} */ url, /** @type {RequestInit} */ init) => {
        calls.push(url);
        expect(/** @type {Record<string, string>} */ (init.headers).authorization).toMatch(/^Bearer ghp_/);
        const q = new URL(url).searchParams.get('q') ?? '';
        const items = q.includes('review-requested') ? [] : [ISSUE];
        return new Response(JSON.stringify({ items }), { status: 200 });
      }),
    );
    const view = await extension.commands['pull-requests']?.view?.(context());
    expect(calls).toHaveLength(3);
    expect(view?.sections.map((section) => [section.title, section.items.map((item) => item.subtitle)])).toEqual([
      ['Yours', ['alexsilver8/open-palette#22']],
    ]);
    expect(view?.sections[0]?.items[0]?.actions[0]).toEqual({
      type: 'open-url',
      url: ISSUE.html_url,
      title: 'Open in Browser',
    });
  });

  it('asks you to sign in again when the token is refused, and saves a pasted one', async () => {
    const ctx = context({ token: `ghp_${'old0'.repeat(9)}` });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (/** @type {string} */ url, /** @type {RequestInit} */ init) => {
        const auth = /** @type {Record<string, string>} */ (init.headers).authorization ?? '';
        if (auth.includes('old0')) return new Response('{}', { status: 401 });
        if (url.endsWith('/user')) return new Response(JSON.stringify({ login: 'alexsilver8' }), { status: 200 });
        return new Response(JSON.stringify([REPO]), { status: 200 });
      }),
    );
    const repos = extension.commands.repos;
    const refused = await repos?.view?.(ctx);
    expect(refused?.filtering).toBe(false);
    expect(refused?.sections[0]?.title).toMatch(/refused your token/);

    const token = `ghp_${'new1'.repeat(9)}`;
    ctx.query = token;
    const typed = await repos?.view?.(ctx);
    const save = typed?.sections[0]?.items[0];
    expect(save?.title).toBe('Save This Token');

    const result = await repos?.onAction?.('save-token', token, ctx);
    expect(ctx.store.get('token')).toBe(token);
    expect(result).toMatchObject({ clearSearch: true, toast: 'Signed in as alexsilver8' });
    expect(result?.replace?.sections[0]?.items.map((item) => item.title)).toEqual(['open-palette']);

    const signedOut = await repos?.onAction?.('sign-out', undefined, ctx);
    expect(ctx.store.has('token')).toBe(false);
    expect(signedOut?.toast).toBe('Forgot your GitHub token');
  });
});
