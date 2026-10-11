// Regenerates the data of the bundled Gitmoji and Emoji extensions from their sources,
// which are pinned dev dependencies: `pnpm run extensions:data`. The extensions load the
// generated files directly, so they need nothing installed at runtime.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { gitmojis } from 'gitmojis';

const require = createRequire(import.meta.url);
const version = (name) =>
  JSON.parse(readFileSync(new URL(`../node_modules/${name}/package.json`, import.meta.url), 'utf8')).version;

// ── Gitmoji ──────────────────────────────────────────────────

writeFileSync(
  new URL('../extensions/gitmoji/gitmojis.json', import.meta.url),
  `${JSON.stringify(
    {
      source: `gitmojis ${version('gitmojis')} (MIT, Carlos Cuesta)`,
      gitmojis: gitmojis.map(({ emoji, code, description, name, semver }) => ({
        emoji,
        code,
        description,
        name,
        semver,
      })),
    },
    null,
    2,
  )}\n`,
);

// ── Emoji ────────────────────────────────────────────────────

const emojis = require('emojibase-data/en/compact.json');
const { groups } = require('emojibase-data/en/messages.json');
const shortcodes = require('emojibase-data/en/shortcodes/github.json');

// Skin tone swatches and hair styles are building blocks, not emoji you'd pick.
const COMPONENT = groups.find((group) => group.key === 'component').order;
const groupNames = groups
  .filter((group) => group.order !== COMPONENT)
  .sort((a, b) => a.order - b.order)
  .map((group) =>
    group.message.replace(/^\w/, (c) => c.toUpperCase()).replace(/ & (\w)/, (_, c) => ` & ${c.toUpperCase()}`),
  );
const groupIndex = new Map(
  groups
    .filter((group) => group.order !== COMPONENT)
    .sort((a, b) => a.order - b.order)
    .map((g, i) => [g.order, i]),
);

const TONES = ['1F3FB', '1F3FC', '1F3FD', '1F3FE', '1F3FF'];

/** The five variants with one skin tone throughout (light to dark), or undefined if there aren't five. */
function skinTones(skins) {
  const byTone = new Map();
  for (const skin of skins) {
    const modifiers = skin.hexcode.split('-').filter((part) => TONES.includes(part));
    if (modifiers.length === 0 || new Set(modifiers).size !== 1) continue;
    const tone = TONES.indexOf(modifiers[0]);
    if (!byTone.has(tone)) byTone.set(tone, skin.unicode);
  }
  return byTone.size === 5 ? [0, 1, 2, 3, 4].map((tone) => byTone.get(tone)) : undefined;
}

/** `[emoji, name, group, extra search words, GitHub shortcode, skin tones 1–5]`, short to keep the file small. */
const rows = emojis
  .filter((emoji) => emoji.group !== undefined && emoji.group !== COMPONENT)
  .sort((a, b) => a.order - b.order)
  .map((emoji) => {
    const nameWords = new Set(emoji.label.toLowerCase().split(/[^\p{L}\p{N}]+/u));
    const tags = (emoji.tags ?? []).filter((tag) => !nameWords.has(tag.toLowerCase()));
    const code = [shortcodes[emoji.hexcode]].flat()[0] ?? '';
    const row = [emoji.unicode, emoji.label, groupIndex.get(emoji.group), tags.join(' '), code];
    const tones = skinTones(emoji.skins ?? []);
    if (tones) row.push(tones);
    return row;
  });

writeFileSync(
  new URL('../extensions/emoji/emojis.json', import.meta.url),
  `${JSON.stringify({ source: `emojibase-data ${version('emojibase-data')} (MIT, Miles Johnson)`, groups: groupNames, emojis: rows })}\n`,
);

console.log(`${gitmojis.length} gitmojis, ${rows.length} emoji in ${groupNames.length} groups`);
