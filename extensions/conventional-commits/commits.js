/**
 * Conventional Commits (https://www.conventionalcommits.org): `type(scope)!: description`.
 */

/**
 * @typedef {'major' | 'minor' | 'patch' | null} Release
 * @typedef {{ type: string, title: string, description: string, release: Release, gitmoji: string, example: string }} CommitType
 */

/** @type {CommitType[]} */
export const TYPES = [
  {
    type: 'feat',
    title: 'Feature',
    description: 'Adds something new for the people using it.',
    release: 'minor',
    gitmoji: '✨',
    example: 'feat(search): find notes by their content',
  },
  {
    type: 'fix',
    title: 'Bug fix',
    description: 'Fixes something that was broken.',
    release: 'patch',
    gitmoji: '🐛',
    example: 'fix: stop the launcher crashing on empty searches',
  },
  {
    type: 'docs',
    title: 'Documentation',
    description: 'Changes documentation only.',
    release: null,
    gitmoji: '📝',
    example: 'docs: explain how to write an extension',
  },
  {
    type: 'style',
    title: 'Style',
    description: "Formatting and white space that don't change what the code does.",
    release: null,
    gitmoji: '🎨',
    example: 'style: format with the new line width',
  },
  {
    type: 'refactor',
    title: 'Refactor',
    description: 'Restructures code without fixing a bug or adding a feature.',
    release: null,
    gitmoji: '♻️',
    example: 'refactor(registry): split loading from discovery',
  },
  {
    type: 'perf',
    title: 'Performance',
    description: 'Makes something faster or lighter.',
    release: 'patch',
    gitmoji: '⚡️',
    example: 'perf: cache the notes list while watching',
  },
  {
    type: 'test',
    title: 'Tests',
    description: 'Adds or corrects tests.',
    release: null,
    gitmoji: '✅',
    example: 'test: cover pasting into other apps',
  },
  {
    type: 'build',
    title: 'Build',
    description: 'Changes the build or the dependencies.',
    release: null,
    gitmoji: '📦️',
    example: 'build(deps): update electron to 44',
  },
  {
    type: 'ci',
    title: 'Continuous integration',
    description: 'Changes CI configuration and scripts.',
    release: null,
    gitmoji: '👷',
    example: 'ci: run the end-to-end tests on Windows',
  },
  {
    type: 'chore',
    title: 'Chore',
    description: "Anything else that doesn't change the code or tests.",
    release: null,
    gitmoji: '🔧',
    example: 'chore: tidy the gitignore',
  },
  {
    type: 'revert',
    title: 'Revert',
    description: 'Undoes an earlier commit.',
    release: null,
    gitmoji: '⏪️',
    example: 'revert: let us never speak of the dark theme again',
  },
];

const BY_TYPE = new Map(TYPES.map((type) => [type.type, type]));

/** @param {string} type */
export function commitType(type) {
  return BY_TYPE.get(type);
}

/**
 * @typedef {object} Commit
 * @property {string} type
 * @property {string} [scope]
 * @property {boolean} breaking
 * @property {string} description
 */

const HEADER = /^([a-z][\w-]*)(?:\(([^()]*)\))?(!)?:\s*(.*)$/i;

/**
 * Reads `type(scope)!: description`, or undefined if the text doesn't start with a type.
 * @param {string} text
 * @returns {Commit | undefined}
 */
export function parseCommit(text) {
  const match = HEADER.exec(text.trim());
  if (!match) return undefined;
  const [, type = '', scope, bang, description = ''] = match;
  return {
    type: type.toLowerCase(),
    ...(scope?.trim() ? { scope: scope.trim() } : {}),
    breaking: bang === '!',
    description: description.trim(),
  };
}

/**
 * The commit's first line.
 * @param {Commit} commit
 */
export function formatCommit(commit) {
  return `${commit.type}${commit.scope ? `(${commit.scope})` : ''}${commit.breaking ? '!' : ''}: ${commit.description}`;
}

/** The longest first line most tools show in full. */
export const MAX_HEADER = 72;

/**
 * How the header does against the convention: each check says what's right, or what to change.
 * @param {Commit} commit
 * @returns {Array<{ ok: boolean, text: string }>}
 */
export function checkCommit(commit) {
  const header = formatCommit(commit);
  const first = commit.description.charAt(0);
  const known = BY_TYPE.has(commit.type);
  const lowercase = !first || first === first.toLowerCase();
  const stop = /[.!?。]$/.test(commit.description);
  const checks = [
    known
      ? { ok: true, text: `${commit.type} is a known type` }
      : { ok: false, text: `Use a known type: ${TYPES.map((t) => t.type).join(', ')}` },
    commit.description
      ? { ok: true, text: 'Has a description' }
      : { ok: false, text: 'Describe the change after the colon' },
    header.length <= MAX_HEADER
      ? { ok: true, text: `${header.length} of ${MAX_HEADER} characters` }
      : { ok: false, text: `Shorten it to ${MAX_HEADER} characters (now ${header.length})` },
    lowercase
      ? { ok: true, text: 'Starts with a lowercase letter' }
      : { ok: false, text: 'Start the description with a lowercase letter' },
    stop ? { ok: false, text: 'Drop the full stop at the end' } : { ok: true, text: 'No full stop at the end' },
  ];
  if (commit.scope) {
    checks.push(
      /^[a-z0-9][a-z0-9._/-]*$/.test(commit.scope)
        ? { ok: true, text: `${commit.scope} is a tidy scope` }
        : { ok: false, text: 'Make the scope one lowercase word, like ui or auth' },
    );
  }
  return checks;
}

/**
 * What releasing the commit does to the version, e.g. 1.4.2 → 1.5.0 for a feature.
 * @param {Commit} commit
 * @returns {Release}
 */
export function releaseOf(commit) {
  if (commit.breaking) return 'major';
  return commitType(commit.type)?.release ?? null;
}

/** Words that hint at a type, checked in order; a feature when nothing matches. */
const HINTS = /** @type {const} */ ([
  ['revert', /^revert\b/],
  ['fix', /\b(fix(e[sd])?|bug|crash(es|ed)?|broken|error|issue|regression|wrong|typo)\b/],
  ['docs', /\b(docs?|documentation|readme|changelog|comments?|jsdoc)\b/],
  ['test', /\b(tests?|specs?|coverage|e2e|unit)\b/],
  ['perf', /\b(perf(ormance)?|faster|speed( up)?|slow|optimi[sz]e[sd]?|cache)\b/],
  [
    'refactor',
    /\b(refactor(ed|s)?|rename[sd]?|move[sd]?|extract(ed|s)?|restructure[sd]?|simplif(y|ie[sd])|clean ?up)\b/,
  ],
  ['style', /\b(format(ting)?|lint|whitespace|indent(ation)?|prettier)\b/],
  ['ci', /\b(ci|workflows?|pipelines?|github actions?)\b/],
  ['build', /\b(build|deps|dependenc(y|ies)|bump(s|ed)?|upgrade[sd]?|package\.json|lockfile|webpack|vite)\b/],
  ['chore', /\b(chore|release|version|gitignore|config)\b/],
]);

/**
 * The type a description most likely needs: "fix the crash on start" → fix.
 * @param {string} description
 */
export function guessType(description) {
  const text = description.toLowerCase();
  return HINTS.find(([, pattern]) => pattern.test(text))?.[0] ?? 'feat';
}

/**
 * `git commit -m '…'`, quoted so the shell takes the message literally: POSIX shells on macOS
 * and Linux, PowerShell on Windows (where a quote inside is doubled).
 * @param {string} message
 * @param {NodeJS.Platform} platform
 */
export function gitCommitCommand(message, platform) {
  if (platform === 'win32') return `git commit -m '${message.replace(/'/g, "''")}'`;
  return `git commit -m '${message.replace(/'/g, `'\\''`)}'`;
}
