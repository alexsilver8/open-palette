// Checks messages against Conventional Commits, which `pnpm release` reads to pick the version:
//   type(optional scope)!: description     e.g. "feat(notes): add a word count", "fix: close the launcher on Escape"
// The description starts with a lowercase letter.
//
//   node scripts/check-commits.mjs --title "feat: …"   one pull request title (what CI checks: PRs are squash-merged
//                                                     with their title as the commit subject)
//   node scripts/check-commits.mjs [<range>]          the commit subjects in a range, origin/main..HEAD by default
import { execFileSync } from 'node:child_process';

export const types = ['feat', 'fix', 'perf', 'refactor', 'docs', 'style', 'test', 'build', 'ci', 'chore', 'revert'];
export const pattern = new RegExp(`^(${types.join('|')})(\\([^)]+\\))?!?: (?![A-Z])\\S`);

const example =
  'For example: "feat: add a calculator", "fix(notes): keep the cursor on save", "feat!: rename the extension API".';
const releases =
  "feat: makes a minor release, fix: and perf: a patch, ! or BREAKING CHANGE: a major one; the others don't release.";
const rule = `type(scope): description, with type one of ${types.join(', ')}, and the description starting with a lowercase letter`;

const titleIndex = process.argv.indexOf('--title');
if (titleIndex !== -1) {
  const title = (process.argv[titleIndex + 1] ?? '').trim();
  if (!pattern.test(title)) {
    console.error(`✗ "${title}" doesn't follow the convention: ${rule}.\n\n${example}\n${releases}`);
    process.exit(1);
  }
  console.log(`✓ "${title}" follows the convention.`);
  process.exit(0);
}

const range = process.argv[2] ?? 'origin/main..HEAD';
const subjects = execFileSync('git', ['log', '--format=%h %s', '--no-merges', range], { encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter(Boolean);
const bad = subjects.filter((line) => !pattern.test(line.slice(line.indexOf(' ') + 1)));

if (bad.length) {
  console.error(`These commits don't follow the convention (${rule}):\n`);
  for (const line of bad) console.error(`  ${line}`);
  console.error(`\n${example}`);
  process.exit(1);
}
console.log(`${subjects.length} commit${subjects.length === 1 ? '' : 's'} follow the convention.`);
