/**
 * Talking to the GitHub REST API and turning what it returns into something to list.
 */

export const API = 'https://api.github.com';

/** Where to make a token with the scopes this extension needs. */
export const NEW_TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=repo,read:org&description=Open%20Palette';

/**
 * Whether the text is shaped like a GitHub token (classic `ghp_…`, fine-grained `github_pat_…`,
 * or one from `gh`: `gho_…`).
 * @param {string} text
 */
export function looksLikeToken(text) {
  return /^(gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})$/.test(text.trim());
}

/** @param {string} token */
export function headers(token) {
  return {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'x-github-api-version': '2022-11-28',
    'user-agent': 'open-palette',
  };
}

/**
 * Why GitHub said no, in words.
 * @param {number} status
 * @param {{ get(name: string): string | null }} responseHeaders
 * @param {number} now
 */
export function refusal(status, responseHeaders, now) {
  if (status === 401) return 'GitHub refused your token. It may have expired or been revoked.';
  if ((status === 403 || status === 429) && responseHeaders.get('x-ratelimit-remaining') === '0') {
    const reset = Number(responseHeaders.get('x-ratelimit-reset')) * 1000;
    const minutes = Number.isFinite(reset) ? Math.max(1, Math.ceil((reset - now) / 60_000)) : undefined;
    return minutes
      ? `GitHub's rate limit was reached. Try again in ${minutes} min.`
      : "GitHub's rate limit was reached. Try again soon.";
  }
  if (status === 403) return "GitHub didn't allow that. Your token may be missing the repo scope.";
  return `GitHub answered ${status}.`;
}

/** @param {unknown} value */
const str = (value) => (typeof value === 'string' ? value : '');
/** @param {unknown} value */
const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

/**
 * @typedef {object} Issue
 * @property {number} id
 * @property {number} number
 * @property {string} title
 * @property {string} url
 * @property {string} repo `owner/name`
 * @property {string} author
 * @property {string} state
 * @property {boolean} pullRequest
 * @property {boolean} draft
 * @property {string[]} labels
 * @property {number} comments
 * @property {string} updated ISO date
 * @property {string} body
 */

/**
 * One result of `GET /search/issues`.
 * @param {unknown} raw
 * @returns {Issue | undefined}
 */
export function toIssue(raw) {
  if (!raw || typeof raw !== 'object') return undefined;
  const item = /** @type {Record<string, any>} */ (raw);
  const url = str(item.html_url);
  const repo = /^https:\/\/[^/]+\/repos\/(.+)$/.exec(str(item.repository_url))?.[1] ?? '';
  if (!url || !repo || !item.number) return undefined;
  return {
    id: num(item.id),
    number: num(item.number),
    title: str(item.title),
    url,
    repo,
    author: str(item.user?.login),
    state: str(item.state),
    pullRequest: Boolean(item.pull_request),
    draft: item.draft === true,
    labels: Array.isArray(item.labels)
      ? item.labels.map((/** @type {any} */ label) => str(label?.name)).filter(Boolean)
      : [],
    comments: num(item.comments),
    updated: str(item.updated_at),
    body: str(item.body),
  };
}

/**
 * @typedef {object} Repository
 * @property {number} id
 * @property {string} name
 * @property {string} fullName
 * @property {string} owner
 * @property {string} url
 * @property {string} description
 * @property {boolean} private
 * @property {boolean} fork
 * @property {boolean} archived
 * @property {string} language
 * @property {number} stars
 * @property {number} forks
 * @property {number} openIssues
 * @property {string} defaultBranch
 * @property {string} pushed ISO date
 * @property {string} sshUrl
 * @property {string} cloneUrl
 */

/**
 * One result of `GET /user/repos`.
 * @param {unknown} raw
 * @returns {Repository | undefined}
 */
export function toRepository(raw) {
  if (!raw || typeof raw !== 'object') return undefined;
  const item = /** @type {Record<string, any>} */ (raw);
  const fullName = str(item.full_name);
  const url = str(item.html_url);
  if (!fullName || !url) return undefined;
  return {
    id: num(item.id),
    name: str(item.name),
    fullName,
    owner: str(item.owner?.login),
    url,
    description: str(item.description),
    private: item.private === true,
    fork: item.fork === true,
    archived: item.archived === true,
    language: str(item.language),
    stars: num(item.stargazers_count),
    forks: num(item.forks_count),
    openIssues: num(item.open_issues_count),
    defaultBranch: str(item.default_branch),
    pushed: str(item.pushed_at),
    sshUrl: str(item.ssh_url),
    cloneUrl: str(item.clone_url),
  };
}

/**
 * What each command lists: a section title and a search.
 * @type {Record<'pull-requests' | 'issues', Array<{ title: string, q: string }>>}
 */
export const SEARCHES = {
  'pull-requests': [
    { title: 'Waiting for your review', q: 'is:open is:pr review-requested:@me archived:false' },
    { title: 'Yours', q: 'is:open is:pr author:@me archived:false' },
    { title: 'Assigned to you', q: 'is:open is:pr assignee:@me archived:false' },
  ],
  issues: [
    { title: 'Assigned to you', q: 'is:open is:issue assignee:@me archived:false' },
    { title: 'Opened by you', q: 'is:open is:issue author:@me archived:false' },
    { title: 'Mentioning you', q: 'is:open is:issue mentions:@me archived:false' },
  ],
};

/**
 * Leaves each issue only in the first section it appears in.
 * @template {{ id: number }} T
 * @param {Array<{ title: string, items: T[] }>} sections
 */
export function dedupe(sections) {
  const seen = new Set();
  return sections.map((section) => ({
    title: section.title,
    items: section.items.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    }),
  }));
}

/**
 * "just now", "5 min ago", "3 hours ago", "yesterday", "4 days ago", then the date.
 * @param {string} iso
 * @param {number} now
 */
export function ago(iso, now) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
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

/**
 * An issue's description cut to a readable length for the preview, without HTML comments
 * (pull request templates are full of them). Markdown headings and bullets become the
 * preview's own.
 * @param {string} body
 */
export function preview(body) {
  let uncommented = body;
  // Again until none are left, so a comment split around another can't survive.
  for (let previous = ''; previous !== uncommented; ) {
    previous = uncommented;
    uncommented = uncommented.replace(/<!--[\s\S]*?-->/g, '');
  }
  const text = uncommented
    .replace(/\r\n/g, '\n')
    .replace(/^#{1,6}\s+/gm, '# ')
    .replace(/^(\s*)[*+]\s+/gm, '$1- ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.length > 2000 ? `${text.slice(0, 2000).trimEnd()}…` : text;
}
