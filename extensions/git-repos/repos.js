/**
 * Finding git repositories under a few folders and reading what's useful about each (branch,
 * remote, when it last changed) straight from `.git`, without running git.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, isAbsolute, join, resolve } from 'node:path';

/** Folders where people usually keep code, relative to their home folder. */
export const USUAL_FOLDERS = [
  'Developer',
  'Projects',
  'projects',
  'Code',
  'code',
  'src',
  'dev',
  'repos',
  'Repos',
  'git',
  'GitHub',
  'workspace',
  'Workspace',
  'Documents/GitHub',
  'Documents/Projects',
  'source/repos',
];

/** Never worth looking inside. */
const SKIP = new Set([
  'node_modules',
  'Library',
  'Applications',
  'Pictures',
  'Music',
  'Movies',
  'vendor',
  'target',
  'dist',
  'build',
  'out',
  'venv',
  '__pycache__',
]);

/**
 * `~/code` → `/Users/alex/code`.
 * @param {string} path
 * @param {string} home
 */
export function expandHome(path, home) {
  const trimmed = path.trim();
  if (trimmed === '~') return home;
  if (/^~[\\/]/.test(trimmed)) return join(home, trimmed.slice(2));
  return isAbsolute(trimmed) ? resolve(trimmed) : trimmed;
}

/**
 * Whether what was typed looks like a folder path rather than a search.
 * @param {string} text
 */
export function looksLikePath(text) {
  return /^(~([\\/]|$)|\/|[A-Za-z]:[\\/])/.test(text.trim());
}

/**
 * `ref: refs/heads/main` → `main`; a detached HEAD → its short commit.
 * @param {string} head
 * @returns {string | undefined}
 */
export function branchFromHead(head) {
  const text = head.trim();
  const ref = /^ref:\s*refs\/heads\/(.+)$/.exec(text);
  if (ref?.[1]) return ref[1];
  return /^[0-9a-f]{40,64}$/.test(text) ? `detached at ${text.slice(0, 7)}` : undefined;
}

/**
 * The URL of `origin` (or else the first remote) in a `.git/config`.
 * @param {string} config
 * @returns {string | undefined}
 */
export function remoteUrl(config) {
  /** @type {Map<string, string>} */
  const remotes = new Map();
  let current = '';
  for (const line of config.split(/\r?\n/)) {
    const section = /^\s*\[remote\s+"([^"]+)"\]/.exec(line);
    if (section?.[1]) {
      current = section[1];
      continue;
    }
    if (/^\s*\[/.test(line)) {
      current = '';
      continue;
    }
    const url = /^\s*url\s*=\s*(.+?)\s*$/.exec(line);
    if (current && url?.[1] && !remotes.has(current)) remotes.set(current, url[1]);
  }
  return remotes.get('origin') ?? remotes.values().next().value;
}

/**
 * The web page for a remote on GitHub, GitLab, Bitbucket and the like:
 * `git@github.com:alex/app.git` → `https://github.com/alex/app`.
 * @param {string | undefined} remote
 * @returns {string | undefined}
 */
export function webUrlOf(remote) {
  if (!remote) return undefined;
  const scp = /^[\w.-]+@([\w.-]+):(.+?)(?:\.git)?\/?$/.exec(remote);
  if (scp) return `https://${scp[1]}/${scp[2]}`;
  try {
    const url = new URL(remote);
    if (!['https:', 'http:', 'ssh:', 'git:'].includes(url.protocol)) return undefined;
    const path = url.pathname.replace(/\.git\/?$/, '').replace(/\/$/, '');
    return path.length > 1 ? `https://${url.hostname}${path}` : undefined;
  } catch {
    return undefined;
  }
}

/**
 * @typedef {object} Repo
 * @property {string} path
 * @property {string} name
 * @property {string} root The folder it was found under.
 * @property {string} [branch]
 * @property {string} [remote]
 * @property {string} [webUrl]
 * @property {number} changed When its index or HEAD last changed, in ms.
 */

/**
 * Where a repository's git data lives: `.git` is usually a folder, but a file pointing elsewhere
 * in worktrees and submodules.
 * @param {string} dir
 */
async function gitDirOf(dir) {
  const dotGit = join(dir, '.git');
  const info = await stat(dotGit);
  if (info.isDirectory()) return dotGit;
  const pointer = /^gitdir:\s*(.+)$/m.exec(await readFile(dotGit, 'utf8'))?.[1]?.trim();
  return pointer ? resolve(dir, pointer) : dotGit;
}

/**
 * @param {string} dir
 * @param {string} root
 * @returns {Promise<Repo>}
 */
export async function readRepo(dir, root) {
  const gitDir = await gitDirOf(dir);
  const [head, config, changed] = await Promise.all([
    readFile(join(gitDir, 'HEAD'), 'utf8').catch(() => ''),
    // A worktree's config is shared with the main repository, two levels up.
    readFile(join(gitDir, 'config'), 'utf8').catch(() =>
      readFile(join(gitDir, '..', '..', 'config'), 'utf8').catch(() => ''),
    ),
    Promise.any([stat(join(gitDir, 'index')), stat(join(gitDir, 'HEAD'))])
      .then((info) => info.mtimeMs)
      .catch(() => 0),
  ]);
  const remote = remoteUrl(config);
  const webUrl = webUrlOf(remote);
  return {
    path: dir,
    name: basename(dir),
    root,
    changed,
    ...(branchFromHead(head) ? { branch: branchFromHead(head) } : {}),
    ...(remote ? { remote } : {}),
    ...(webUrl ? { webUrl } : {}),
  };
}

/**
 * Repositories under each root, a few levels deep, without looking inside one once found.
 * @param {string[]} roots
 * @param {{ depth?: number, maxFolders?: number }} [limits]
 * @returns {Promise<Repo[]>}
 */
export async function findRepos(roots, { depth = 4, maxFolders = 20_000 } = {}) {
  /** @type {Array<{ dir: string, root: string }>} */
  const found = [];
  const seen = new Set();
  let budget = maxFolders;

  /**
   * @param {string} dir
   * @param {string} root
   * @param {number} level
   */
  async function walk(dir, root, level) {
    if (budget-- <= 0 || seen.has(dir)) return;
    seen.add(dir);
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (entries.some((entry) => entry.name === '.git')) {
      found.push({ dir, root });
      return;
    }
    if (level >= depth) return;
    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && !SKIP.has(entry.name))
        .map((entry) => walk(join(dir, entry.name), root, level + 1)),
    );
  }

  await Promise.all(roots.map((root) => walk(root, root, 0)));

  // A few at a time: apps opened from the Dock may only have 256 files open at once.
  /** @type {Repo[]} */
  const repos = [];
  for (let i = 0; i < found.length; i += 16) {
    const batch = await Promise.all(
      found.slice(i, i + 16).map(({ dir, root }) => readRepo(dir, root).catch(() => undefined)),
    );
    for (const repo of batch) if (repo) repos.push(repo);
  }
  return repos.sort((a, b) => b.changed - a.changed || a.name.localeCompare(b.name));
}

/**
 * The repositories matching what was typed, best first: every word must appear in the name,
 * path or branch, and a match on the name beats one elsewhere. Ties keep their order (most
 * recently changed first).
 * @param {Repo[]} repos
 * @param {string} query
 * @returns {Repo[]}
 */
export function matchRepos(repos, query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return repos;
  const whole = words.join(' ');
  /** @param {Repo} repo */
  const rank = (repo) => {
    const name = repo.name.toLowerCase();
    if (name === whole) return 0;
    if (name.startsWith(whole)) return 1;
    if (name.includes(whole)) return 2;
    return words.every((word) => name.includes(word)) ? 3 : 4;
  };
  return repos
    .filter((repo) => {
      const text = `${repo.name} ${repo.path} ${repo.branch ?? ''}`.toLowerCase();
      return words.every((word) => text.includes(word));
    })
    .map((repo, index) => ({ repo, index, rank: rank(repo) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ repo }) => repo);
}

/**
 * Where a remote's web page is, in words: "GitHub", "GitLab", or the host's name.
 * @param {string} webUrl
 */
export function hostLabel(webUrl) {
  const host = new URL(webUrl).hostname.replace(/^www\./, '');
  if (host === 'github.com') return 'GitHub';
  if (host === 'gitlab.com') return 'GitLab';
  if (host === 'bitbucket.org') return 'Bitbucket';
  if (host === 'codeberg.org') return 'Codeberg';
  return host;
}

/**
 * "just now", "5 min ago", "3 hours ago", "yesterday", "4 days ago", then the date.
 * @param {number} ms
 * @param {number} now
 */
export function timeAgo(ms, now) {
  const seconds = Math.max(0, (now - ms) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400) {
    const hours = Math.floor(seconds / 3600);
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  }
  const days = Math.floor(seconds / 86_400);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
