// `pnpm release`: pulls main, works out the next version from the commits since the last release, checks
// everything, writes the changelog, then commits, tags and pushes. The tag starts .github/workflows/release.yml, which
// makes the GitHub release and attaches the installers for each OS.
//
// The version follows the Conventional Commits in the subjects:
//   feat: …                         a minor release (1.8.0 → 1.9.0)
//   fix: … / perf: …                a patch release (1.8.0 → 1.8.1)
//   feat!: … or "BREAKING CHANGE:"  a major release (1.8.0 → 2.0.0)
//   chore:, docs:, refactor:, test:, ci:, build:, style:  no release on their own
//
//   pnpm release                    the version the commits call for
//   pnpm release --dry-run          shows the version and the notes, and changes nothing
//   pnpm release minor              forces patch, minor, major or an exact version such as 2.0.0
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { styleText } from 'node:util';

import { groups, notesFromCommits, parseChangelog, renderChangelog, repository, summaryOf } from './release-notes.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const forced = args.find((arg) => !arg.startsWith('--'));

// The terminal output. Colours come from Node itself (no dependency) and switch off by themselves when the output
// isn't a terminal or NO_COLOR is set.
const paint = (style, text) => styleText(style, String(text));
const bold = (text) => paint('bold', text);
const dim = (text) => paint('dim', text);
const say = (text = '') => console.log(text);
const done = (text) => say(`  ${paint('green', '✓')} ${text}`);
const live = process.stdout.isTTY;

const git = (...command) => execFileSync('git', command, { cwd: root, encoding: 'utf8' }).trim();
const fail = (message, hint) => {
  console.error(`\n  ${paint(['bold', 'red'], '✗')} ${bold(message)}${hint ? `\n    ${dim(hint)}` : ''}\n`);
  process.exit(1);
};
/** One step as one line: its name while it runs, then a tick and how long it took. Its output shows only if it fails. */
function step(label, command, commandArgs) {
  const started = Date.now();
  if (live) process.stdout.write(`  ${dim('•')} ${label}${dim('…')}`);
  try {
    execFileSync(command, commandArgs, {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    if (live) process.stdout.write('\r\x1b[2K');
    console.error(`  ${paint('red', '✗')} ${label}\n`);
    console.error([error.stdout, error.stderr].filter(Boolean).join('\n').trim().replace(/^/gm, '    '));
    fail(`${label} failed, so nothing was released.`, 'Fix it, commit, and run pnpm release again.');
  }
  if (live) process.stdout.write('\r\x1b[2K');
  done(`${label} ${dim(`${((Date.now() - started) / 1000).toFixed(1)}s`)}`);
}

const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const write = (file, text) => fs.writeFileSync(path.join(root, file), text);

// 1. The tree is clean and on main, and has everything origin has: it pulls it.
if (!dryRun) {
  say(`\n  ${bold('Waypoint release')}\n`);
  if (git('status', '--porcelain')) fail('There are uncommitted changes.', 'Commit or stash them first.');
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  if (branch !== 'main') fail(`Releases go out from main, and this is ${branch}.`, 'git checkout main');
  // Pull first, so a merged pull request is in the release without a separate git pull. Fast-forward only: if
  // main has commits of its own that origin doesn't, pulling would mean a merge, which is for a person to do.
  const before = git('rev-parse', 'HEAD');
  try {
    execFileSync('git', ['pull', '--ff-only', '--quiet', '--tags', 'origin', 'main'], { cwd: root, stdio: 'pipe' });
  } catch {
    fail(
      'main and origin/main have both moved on, so pulling would need a merge.',
      'git pull --rebase, check the result, then pnpm release again',
    );
  }
  const pulled = Number(git('rev-list', '--count', `${before}..HEAD`));
  const ahead = Number(git('rev-list', '--count', 'origin/main..HEAD'));
  const extras = [
    pulled > 0 ? `pulled ${pulled} commit${pulled === 1 ? '' : 's'}` : '',
    ahead > 0 ? `${ahead} unpushed commit${ahead === 1 ? '' : 's'}, which the release pushes too` : '',
  ].filter(Boolean);
  done(`On main, clean, and up to date with origin${extras.length ? dim(` (${extras.join('; ')})`) : ''}`);
}

// 2. The last release: the newest v* tag, or before the first tag, the newest release commit.
const pkg = JSON.parse(read('package.json'));
const current = pkg.version;
const tags = git('tag', '--list', 'v*', '--sort=-v:refname').split('\n').filter(Boolean);
// Release commits: this script's "chore(release): 1.9.0", and release-please's "chore(main): release 1.8.0" before it.
const releaseCommit = /^(chore\(release\): |chore\(main\): release |Release )v?\d+\.\d+\.\d+/;
let base = tags[0];
if (!base) {
  base = git('log', '--format=%H %s')
    .split('\n')
    .find((line) => releaseCommit.test(line.slice(line.indexOf(' ') + 1)))
    ?.split(' ')[0];
}
const range = base ? `${base}..HEAD` : 'HEAD';
const since = tags[0] ?? (base ? `release commit ${base.slice(0, 7)}` : 'the start');

// 3. The commits since then, read as Conventional Commits.
const separator = '\u001e';
const raw = git('log', range, `--format=%H%x1f%s%x1f%b${separator}`);
const commits = raw
  .split(separator)
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((entry) => {
    const [hash, subject, body = ''] = entry.split('\u001f');
    const match = /^(\w+)(?:\(([^)]+)\))?(!)?: (.+)$/.exec(subject);
    return {
      hash,
      subject,
      type: match?.[1].toLowerCase(),
      scope: match?.[2],
      description: match?.[4] ?? subject,
      breaking: Boolean(match?.[3]) || /^BREAKING[ -]CHANGE:/m.test(body),
    };
  })
  .filter((commit) => !releaseCommit.test(commit.subject));

if (!commits.length) fail(`Nothing has changed since ${since}.`);
if (dryRun) say(`\n  ${bold('Waypoint release')} ${dim('(dry run: nothing changes)')}`);

// 4. The next version.
const [major, minor, patch] = current.split('.').map(Number);
const bumps = { major: `${major + 1}.0.0`, minor: `${major}.${minor + 1}.0`, patch: `${major}.${minor}.${patch + 1}` };
let level;
if (commits.some((commit) => commit.breaking)) level = major >= 1 ? 'major' : 'minor';
else if (commits.some((commit) => commit.type === 'feat')) level = 'minor';
else if (commits.some((commit) => commit.type === 'fix' || commit.type === 'perf')) level = 'patch';

let next;
if (forced) {
  if (bumps[forced]) next = bumps[forced];
  else if (/^\d+\.\d+\.\d+$/.test(forced)) next = forced;
  else fail(`"${forced}" isn't patch, minor, major or a version like 1.2.3.`);
} else if (level) {
  next = bumps[level];
} else {
  const listed = commits.map((commit) => `    ${dim(commit.hash.slice(0, 7))} ${commit.subject}`).join('\n');
  fail(
    `None of the ${commits.length} commits since ${since} is a feat, fix, perf or breaking change, so there's nothing to release:\n${listed}`,
    'To release anyway: pnpm release patch (or minor, major)',
  );
}
const order = (version) =>
  version
    .split('.')
    .map(Number)
    .reduce((sum, part) => sum * 10000 + part, 0);
if (order(next) <= order(current)) fail(`${next} isn't after the current version, ${current}.`);

// 5. The release notes: breaking changes, features, fixes, performance, then everything else
// (scripts/release-notes.mjs has the template).
const notes = notesFromCommits(commits);
const today = new Date().toISOString().slice(0, 10);
const release = { version: next, date: today, notes };

const reason = forced ? `forced: ${forced}` : `a ${level} release, from the commits`;
say(
  `\n  ${dim(current)} ${paint('cyan', '→')} ${paint(['bold', 'green'], next)}  ${dim(`${reason}; ${commits.length} commit${commits.length === 1 ? '' : 's'} since ${since}`)}\n`,
);
// The notes as the changelog will have them, readable in the terminal: headings in colour, hashes dimmed.
const tones = { breaking: 'red', features: 'green', fixes: 'yellow', performance: 'magenta', other: 'blue' };
const summary = summaryOf(notes);
if (summary) say(`  ${summary}\n`);
for (const { key, title } of groups) {
  const list = notes.filter((note) => note.group === key);
  if (!list.length) continue;
  say(`  ${paint(['bold', tones[key]], title)}`);
  for (const note of list) {
    const lead = note.scope ? `${bold(`${note.scope}:`)} ` : '';
    say(
      `    ${dim('•')} ${lead}${note.text} ${dim([note.pr ? `#${note.pr}` : '', note.hash.slice(0, 7)].filter(Boolean).join(' '))}`,
    );
  }
  say();
}
if (dryRun) {
  say(`  ${dim('Dry run: nothing was changed. Run pnpm release to release it.')}\n`);
  process.exit(0);
}

// 6. Everything CI checks, here first, so a bad release never gets a tag.
say(`  ${bold('Checking')}`);
step('Lint', 'pnpm', ['run', 'lint']);
step('Types', 'pnpm', ['run', 'typecheck']);
step('Unit tests', 'pnpm', ['run', 'test']);
step('Build', 'pnpm', ['run', 'build']);

// 7. The new version everywhere: package.json, the website's version badge (shown until it fetches the latest
// release) and the changelog.
say(`\n  ${bold(`Releasing ${next}`)}`);
pkg.version = next;
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
done('Version in package.json');

const site = read('website/index.html');
const badge = /(<span data-version>)v\d+\.\d+\.\d+(<\/span>)/;
if (!badge.test(site)) fail("The website's version badge (<span data-version>) is missing from website/index.html.");
write('website/index.html', site.replace(badge, `$1v${next}$2`));
done('Version on the website');

// The earlier releases are read back and written again in the same template, so the file stays in one format.
const previous = fs.existsSync(path.join(root, 'CHANGELOG.md')) ? parseChangelog(read('CHANGELOG.md')) : [];
write('CHANGELOG.md', renderChangelog([release, ...previous]));
done('CHANGELOG.md');

// 8. Commit, tag and push, all at once so main and the tag can't disagree.
const tag = `v${next}`;
git('add', 'package.json', 'website/index.html', 'CHANGELOG.md');
git('commit', '--quiet', '-m', `chore(release): ${next}`);
git('tag', '-a', tag, '-m', `Release ${next}`);
done(`Committed and tagged ${tag}`);
git('push', '--atomic', 'origin', 'main', tag);
done('Pushed main and the tag');

say(
  `\n  ${paint(['bold', 'green'], `✓ ${tag} is on its way.`)} GitHub Actions now makes the GitHub release and builds the installers:`,
);
say(`    ${paint('cyan', `${repository}/actions`)}\n`);
