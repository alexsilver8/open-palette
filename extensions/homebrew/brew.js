/**
 * Finding brew, reading what it prints, and searching package names.
 */
import { accessSync, constants } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';

/**
 * The full path of brew, or undefined when Homebrew isn't installed. Apps opened from the Dock
 * get a short PATH without Homebrew's folder, so its usual places are checked too.
 * @returns {string | undefined}
 */
export function findBrew() {
  const dirs = [
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/home/linuxbrew/.linuxbrew/bin',
    join(homedir(), '.linuxbrew', 'bin'),
    ...(process.env.PATH ?? '').split(delimiter),
  ];
  for (const dir of dirs) {
    if (!dir) continue;
    try {
      accessSync(join(dir, 'brew'), constants.X_OK);
      return join(dir, 'brew');
    } catch {
      // Not here.
    }
  }
  return undefined;
}

/**
 * Formula names look like `node`, `node@20`, `gst-plugins-base` or `mongodb/brew/mongodb-community`;
 * casks like `visual-studio-code`. Anything else is never passed to a shell.
 * @param {unknown} name
 * @returns {name is string}
 */
export function isPackageName(name) {
  return (
    typeof name === 'string' &&
    name.length <= 120 &&
    /^[a-z0-9][a-z0-9@._+-]*(\/[a-z0-9][a-z0-9@._+-]*){0,2}$/i.test(name)
  );
}

/** @typedef {'formula' | 'cask'} Kind */

/**
 * @typedef {object} Package
 * @property {string} name
 * @property {Kind} kind
 * @property {string} [title] A cask's app name, e.g. "Visual Studio Code".
 * @property {string} [desc]
 * @property {string} [homepage]
 * @property {string} [version] The installed version.
 * @property {string} [latest] The newest version Homebrew knows of.
 * @property {boolean} outdated
 * @property {boolean} onRequest Installed because you asked, not as something else's dependency.
 * @property {boolean} pinned
 */

/** @param {unknown} value */
const str = (value) => (typeof value === 'string' && value ? value : undefined);

/**
 * What `brew info --json=v2 --installed` prints, as packages.
 * @param {string} output
 * @returns {Package[]}
 */
export function parseInstalled(output) {
  /** @type {{ formulae?: unknown[], casks?: unknown[] }} */
  const data = JSON.parse(output);
  /** @type {Package[]} */
  const packages = [];
  for (const raw of data.formulae ?? []) {
    const formula = /** @type {Record<string, any>} */ (raw);
    const name = str(formula.full_name) ?? str(formula.name);
    if (!name) continue;
    const installed = Array.isArray(formula.installed) ? formula.installed : [];
    const latestInstall = installed[installed.length - 1];
    packages.push({
      name,
      kind: 'formula',
      ...(str(formula.desc) ? { desc: formula.desc } : {}),
      ...(str(formula.homepage) ? { homepage: formula.homepage } : {}),
      ...(str(latestInstall?.version) ? { version: latestInstall.version } : {}),
      ...(str(formula.versions?.stable) ? { latest: formula.versions.stable } : {}),
      outdated: formula.outdated === true,
      onRequest: installed.some((/** @type {any} */ item) => item?.installed_on_request === true),
      pinned: formula.pinned === true,
    });
  }
  for (const raw of data.casks ?? []) {
    const cask = /** @type {Record<string, any>} */ (raw);
    const name = str(cask.full_token) ?? str(cask.token);
    if (!name) continue;
    const title = Array.isArray(cask.name) ? str(cask.name[0]) : undefined;
    packages.push({
      name,
      kind: 'cask',
      ...(title ? { title } : {}),
      ...(str(cask.desc) ? { desc: cask.desc } : {}),
      ...(str(cask.homepage) ? { homepage: cask.homepage } : {}),
      ...(str(cask.installed) ? { version: cask.installed } : {}),
      ...(str(cask.version) ? { latest: cask.version } : {}),
      outdated: cask.outdated === true,
      onRequest: true,
      pinned: false,
    });
  }
  return packages.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * One name per line, as `brew formulae` and `brew casks` print them.
 * @param {string} output
 * @returns {string[]}
 */
export function parseNames(output) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => isPackageName(line));
}

/**
 * The names matching what was typed, best first: exact, then starting with it, then containing
 * it; shorter names first within each.
 * @param {Array<{ name: string, kind: Kind }>} names
 * @param {string} query
 * @param {number} limit
 */
export function searchNames(names, query, limit) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const whole = words.join('-');
  /** @param {string} name */
  const rank = (name) => {
    const short = name.slice(name.lastIndexOf('/') + 1);
    if (short === whole) return 0;
    if (short.startsWith(whole)) return 1;
    if (short.includes(whole)) return 2;
    return 3;
  };
  return names
    .filter(({ name }) => words.every((word) => name.toLowerCase().includes(word)))
    .map((entry) => ({ entry, rank: rank(entry.name.toLowerCase()) }))
    .sort(
      (a, b) =>
        a.rank - b.rank || a.entry.name.length - b.entry.name.length || a.entry.name.localeCompare(b.entry.name),
    )
    .slice(0, limit)
    .map(({ entry }) => entry);
}

/**
 * The package's page on formulae.brew.sh (only for Homebrew's own taps).
 * @param {string} name
 * @param {Kind} kind
 * @returns {string | undefined}
 */
export function pageUrl(name, kind) {
  if (name.includes('/')) return undefined;
  return `https://formulae.brew.sh/${kind}/${encodeURIComponent(name)}`;
}

/**
 * The brew command for an action, as you'd type it.
 * @param {'install' | 'upgrade' | 'uninstall'} verb
 * @param {string} [name] Every outdated package when left out (upgrade only).
 * @param {Kind} [kind]
 */
export function brewCommand(verb, name, kind) {
  return ['brew', verb, ...(kind === 'cask' ? ['--cask'] : []), ...(name ? [name] : [])].join(' ');
}
