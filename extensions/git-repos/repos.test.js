import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  branchFromHead,
  expandHome,
  findRepos,
  hostLabel,
  looksLikePath,
  matchRepos,
  remoteUrl,
  timeAgo,
  webUrlOf,
} from './repos.js';

describe('branchFromHead', () => {
  it('reads the branch, or the commit when HEAD is detached', () => {
    expect(branchFromHead('ref: refs/heads/main\n')).toBe('main');
    expect(branchFromHead('ref: refs/heads/feat/notes')).toBe('feat/notes');
    expect(branchFromHead('3f786850e387550fdab836ed7e6dc881de23001b\n')).toBe('detached at 3f78685');
    expect(branchFromHead('')).toBeUndefined();
  });
});

describe('remoteUrl', () => {
  it('prefers origin, else takes the first remote', () => {
    const config = [
      '[core]',
      '\turl = not-a-remote',
      '[remote "upstream"]',
      '\turl = https://github.com/team/app.git',
      '[remote "origin"]',
      '\tfetch = +refs/heads/*:refs/remotes/origin/*',
      '\turl = git@github.com:alex/app.git',
    ].join('\n');
    expect(remoteUrl(config)).toBe('git@github.com:alex/app.git');
    expect(remoteUrl('[remote "fork"]\n  url = https://gitlab.com/a/b\n')).toBe('https://gitlab.com/a/b');
    expect(remoteUrl('[core]\n\tbare = false\n')).toBeUndefined();
  });
});

describe('webUrlOf', () => {
  it('turns SSH and HTTPS remotes into web pages', () => {
    expect(webUrlOf('git@github.com:alex/app.git')).toBe('https://github.com/alex/app');
    expect(webUrlOf('https://github.com/alex/app.git')).toBe('https://github.com/alex/app');
    expect(webUrlOf('https://alex@bitbucket.org/team/app.git')).toBe('https://bitbucket.org/team/app');
    expect(webUrlOf('ssh://git@gitlab.com/group/sub/app.git')).toBe('https://gitlab.com/group/sub/app');
    expect(webUrlOf('/Users/alex/backup/app.git')).toBeUndefined();
    expect(webUrlOf(undefined)).toBeUndefined();
  });
});

describe('hostLabel', () => {
  it('names well-known hosts', () => {
    expect(hostLabel('https://github.com/alex/app')).toBe('GitHub');
    expect(hostLabel('https://gitlab.com/a/b')).toBe('GitLab');
    expect(hostLabel('https://git.example.com/a/b')).toBe('git.example.com');
  });
});

describe('paths', () => {
  it('expands ~ and tells paths from searches', () => {
    expect(expandHome('~', '/home/alex')).toBe('/home/alex');
    expect(expandHome('~/work ', '/home/alex')).toBe(join('/home/alex', 'work'));
    expect(looksLikePath('~/work')).toBe(true);
    expect(looksLikePath('/srv/code')).toBe(true);
    expect(looksLikePath('C:\\code')).toBe(true);
    expect(looksLikePath('open-palette')).toBe(false);
  });
});

describe('matchRepos', () => {
  const repo = (/** @type {string} */ name, /** @type {string} */ path, branch = 'main') => ({
    name,
    path,
    root: '/code',
    branch,
    changed: 0,
  });
  const repos = [
    repo('website', '/code/palette/website'),
    repo('open-palette', '/code/open-palette', 'feat/notes'),
    repo('palette', '/code/palette'),
  ];

  it('puts name matches first and keeps the rest in order', () => {
    expect(matchRepos(repos, 'palette').map((r) => r.name)).toEqual(['palette', 'open-palette', 'website']);
    expect(matchRepos(repos, 'notes').map((r) => r.name)).toEqual(['open-palette']);
    expect(matchRepos(repos, 'pal web').map((r) => r.name)).toEqual(['website']);
    expect(matchRepos(repos, '')).toBe(repos);
  });
});

describe('timeAgo', () => {
  it('says roughly how long ago', () => {
    const now = Date.UTC(2026, 9, 11, 12);
    expect(timeAgo(now - 20_000, now)).toBe('just now');
    expect(timeAgo(now - 5 * 60_000, now)).toBe('5 min ago');
    expect(timeAgo(now - 3600_000, now)).toBe('1 hour ago');
    expect(timeAgo(now - 30 * 3600_000, now)).toBe('yesterday');
    expect(timeAgo(now - 4 * 86_400_000, now)).toBe('4 days ago');
  });
});

describe('findRepos', () => {
  const root = mkdtempSync(join(tmpdir(), 'op-repos-'));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  /**
   * @param {string} dir
   * @param {string} head
   * @param {string} [config]
   */
  function makeRepo(dir, head, config = '') {
    mkdirSync(join(root, dir, '.git'), { recursive: true });
    writeFileSync(join(root, dir, '.git', 'HEAD'), head);
    writeFileSync(join(root, dir, '.git', 'config'), config);
  }

  makeRepo('app', 'ref: refs/heads/main\n', '[remote "origin"]\n\turl = git@github.com:alex/app.git\n');
  makeRepo('clients/acme/site', 'ref: refs/heads/dev\n');
  makeRepo('app/packages/inner', 'ref: refs/heads/main\n');
  makeRepo('node_modules/dep', 'ref: refs/heads/main\n');
  makeRepo('.hidden/secret', 'ref: refs/heads/main\n');
  makeRepo('a/b/c/d/e/too-deep', 'ref: refs/heads/main\n');
  // A worktree: `.git` is a file pointing at the main repository's data.
  mkdirSync(join(root, 'app', '.git', 'worktrees', 'fix'), { recursive: true });
  writeFileSync(join(root, 'app', '.git', 'worktrees', 'fix', 'HEAD'), 'ref: refs/heads/fix\n');
  mkdirSync(join(root, 'app-fix'));
  writeFileSync(join(root, 'app-fix', '.git'), `gitdir: ${join(root, 'app', '.git', 'worktrees', 'fix')}\n`);

  it('finds repositories, skipping hidden, dependency and nested ones', async () => {
    const repos = await findRepos([root]);
    const byName = Object.fromEntries(repos.map((repo) => [repo.name, repo]));
    expect(Object.keys(byName).sort()).toEqual(['app', 'app-fix', 'site']);
    expect(byName.app).toMatchObject({
      branch: 'main',
      remote: 'git@github.com:alex/app.git',
      webUrl: 'https://github.com/alex/app',
      root,
    });
    expect(byName.site?.branch).toBe('dev');
    expect(byName['app-fix']).toMatchObject({ branch: 'fix', webUrl: 'https://github.com/alex/app' });
  });

  it('stops after the folder budget', async () => {
    expect((await findRepos([root], { maxFolders: 1 })).length).toBe(0);
  });
});
