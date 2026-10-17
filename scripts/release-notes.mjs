// The release notes, in one place: `pnpm release` turns commits into a release with `notesFromCommits` and writes it
// into CHANGELOG.md with `renderRelease`. The release workflow copies each version's section into its GitHub release,
// so both show the same notes.
//
// A release in the changelog:
//
//   ## 1.9.0 (2026-10-18)
//
//   1 feature and 1 fix.
//
//   ### Features
//
//   - rename the app to Waypoint ([#39](https://github.com/alexsilver8/waypoint/pull/39), [3d9e93e](…/commit/…))
//
//   ### Fixes
//
//   - **notes:** never give two new notes the same file ([#27](…), [6e91871](…))

export const repository = 'https://github.com/alexsilver8/waypoint';

/** The groups a release's notes fall into, in the order they're shown. */
export const groups = [
  { key: 'breaking', title: 'Breaking changes' },
  { key: 'features', title: 'Features' },
  { key: 'fixes', title: 'Fixes' },
  { key: 'performance', title: 'Performance' },
  { key: 'other', title: 'Other changes' },
];

/** One note from a commit: "add X (#55)" → { group, text, pr, hash, scope }. */
export function noteFrom({ type, scope, description, breaking, hash }) {
  const pr = /\s*\(#(\d+)\)$/.exec(description);
  const text = pr ? description.slice(0, pr.index) : description;
  const note = {
    group: 'other',
    text,
    ...(hash ? { hash } : {}),
    ...(pr ? { pr: Number(pr[1]) } : {}),
    ...(scope ? { scope } : {}),
  };
  if (breaking) return { ...note, group: 'breaking' };
  if (type === 'feat') return { ...note, group: 'features' };
  if (type === 'fix') return { ...note, group: 'fixes' };
  if (type === 'perf') return { ...note, group: 'performance' };
  return note;
}

/** The notes of a release, from its commits as release.mjs reads them. */
export const notesFromCommits = (commits) => commits.map(noteFrom);

const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** "2 features and 1 fix.", or "" when there's nothing but other changes. */
export function summaryOf(notes) {
  const count = (group) => notes.filter((note) => note.group === group).length;
  const parts = [
    count('breaking') && plural(count('breaking'), 'breaking change'),
    count('features') && plural(count('features'), 'feature'),
    count('fixes') && plural(count('fixes'), 'fix', 'fixes'),
    count('performance') && plural(count('performance'), 'performance change'),
  ].filter(Boolean);
  if (!parts.length) return '';
  const last = parts.pop();
  return `${parts.length ? `${parts.join(', ')} and ${last}` : last}.`;
}

function renderNote(note) {
  const refs = [
    note.pr ? `[#${note.pr}](${repository}/pull/${note.pr})` : '',
    note.hash ? `[${note.hash.slice(0, 7)}](${repository}/commit/${note.hash})` : '',
  ].filter(Boolean);
  const lead = note.scope ? `**${note.scope}:** ` : '';
  return `- ${lead}${note.text}${refs.length ? ` (${refs.join(', ')})` : ''}`;
}

/** A release as its changelog section: heading, summary, then each group's notes. */
export function renderRelease({ version, date, notes }) {
  const summary = summaryOf(notes);
  const body = groups
    .map(({ key, title }) => [title, notes.filter((note) => note.group === key)])
    .filter(([, list]) => list.length)
    .map(([title, list]) => `### ${title}\n\n${list.map(renderNote).join('\n')}`)
    .join('\n\n');
  return `## ${version}${date ? ` (${date})` : ''}\n\n${summary ? `${summary}\n\n` : ''}${body || 'Maintenance only.'}\n`;
}

export const changelogHeading =
  '# Changelog\n\nEvery release of Waypoint. `pnpm release` writes it from the commits, and each GitHub release shows its section.\n\n';

export const renderChangelog = (releases) => `${changelogHeading}${releases.map(renderRelease).join('\n')}`;

// Group headings from this file's format and from release-please's, which wrote the releases up to 1.8.0.
const headings = {
  'Breaking changes': 'breaking',
  '⚠ BREAKING CHANGES': 'breaking',
  Features: 'features',
  Fixes: 'fixes',
  'Bug Fixes': 'fixes',
  Performance: 'performance',
  'Other changes': 'other',
  Documentation: 'other',
  Reverts: 'other',
};

const trailingRefs = /\s*\(((?:\[[^\]]+\]\([^)]+\)(?:, )?)+)\)$/;

/**
 * One list item back into a note. Reads this file's format, "- text ([#55](…/pull/55), [abc1234](…/commit/<full>))",
 * and release-please's, "* text ([#55](…/issues/55)) ([abc1234](…/commit/<full>))".
 */
function parseNote(line, groupTitle) {
  let rest = line.replace(/^[-*] /, '');
  let pr;
  let hash;
  // The trailing links, in one pair of brackets or two, read from the end.
  let refs = trailingRefs.exec(rest);
  while (refs) {
    rest = rest.slice(0, refs.index);
    for (const [, label, url] of refs[1].matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)) {
      if (label.startsWith('#')) pr ??= Number(label.slice(1));
      else hash ??= /\/commit\/([0-9a-f]+)/.exec(url)?.[1] ?? label;
    }
    refs = trailingRefs.exec(rest);
  }
  const scoped = /^\*\*([^*]+):\*\* /.exec(rest);
  const text = scoped ? rest.slice(scoped[0].length) : rest;
  return {
    group: headings[groupTitle] ?? 'other',
    text,
    ...(hash ? { hash } : {}),
    ...(pr ? { pr } : {}),
    ...(scoped ? { scope: scoped[1] } : {}),
  };
}

/** CHANGELOG.md as releases, newest first: { version, date, notes }. */
export function parseChangelog(markdown) {
  return markdown
    .split(/^## /m)
    .slice(1)
    .map((section) => {
      const [heading, ...lines] = section.split('\n');
      // "1.9.0 (2026-10-18)", or release-please's "[1.8.0](…/compare/v1.7.1...v1.8.0) (2026-10-11)".
      const [, version, date] = /^\[?(\d+\.\d+\.\d+)\]?(?:\([^)]*\))?(?: \((\d{4}-\d{2}-\d{2})\))?/.exec(heading) ?? [];
      if (!version) return undefined;
      const notes = [];
      let groupTitle;
      for (const line of lines) {
        if (line.startsWith('### ')) groupTitle = line.slice(4).trim();
        else if (/^[-*] /.test(line) && groupTitle) notes.push(parseNote(line, groupTitle));
      }
      return { version, date: date ?? '', notes };
    })
    .filter(Boolean);
}
