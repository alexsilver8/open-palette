/**
 * One emoji as stored in emojis.json: `[emoji, name, group, extra search words, GitHub
 * shortcode, skin tones 1–5]`, kept short because there are nearly two thousand of them.
 * @typedef {[string, string, number, string, string, string[]?]} Row
 */

/**
 * @typedef {object} Emoji
 * @property {string} emoji
 * @property {string} name
 * @property {number} group
 * @property {string} code GitHub shortcode without colons, or ''.
 * @property {string[] | undefined} skins Light to dark.
 * @property {string[]} nameWords
 * @property {string[]} tags
 * @property {number} order
 */

/**
 * The words of some text, lowercased. `+1` and `-1` stay words, as in the `:+1:` shortcode.
 * @param {string} text
 */
export function words(text) {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}+-]+/u)
    .filter((word) => word && word !== '-' && word !== '+');
}

/** @param {{ emojis: Row[] }} data @returns {Emoji[]} */
export function loadEmojis(data) {
  return data.emojis.map(([emoji, name, group, tags, code, skins], order) => ({
    emoji,
    name,
    group,
    code,
    skins,
    nameWords: words(name),
    tags: words(tags),
    order,
  }));
}

/** Variation selectors and skin tones don't change which emoji it is. */
const bare = (/** @type {string} */ text) => text.replace(/[︎️]|\uD83C[\uDFFB-\uDFFF]/g, '');

/**
 * How well an emoji matches every word of a query, or 0 if one doesn't match.
 * @param {Emoji} emoji
 * @param {string[]} terms
 */
function score(emoji, terms) {
  let total = 0;
  for (const term of terms) {
    if (emoji.code === term || emoji.nameWords.includes(term)) total += 8;
    else if (emoji.nameWords.some((word) => word.startsWith(term))) total += 6;
    else if (emoji.code.startsWith(term)) total += 5;
    else if (emoji.tags.includes(term)) total += 4;
    else if (emoji.tags.some((tag) => tag.startsWith(term))) total += 3;
    else if (emoji.name.toLowerCase().includes(term)) total += 1;
    else return 0;
  }
  // Prefer the emoji whose name is just the search, then shorter names.
  if (emoji.nameWords.join(' ') === terms.join(' ')) total += 10;
  return total - emoji.nameWords.length * 0.1;
}

/**
 * The emoji matching every word of the query, best first; or the emoji itself if one was
 * typed or pasted.
 * @param {Emoji[]} emojis
 * @param {string} query
 * @param {number} [limit]
 */
export function searchEmojis(emojis, query, limit = 150) {
  const trimmed = query.trim().replace(/^:|:$/g, '');
  if (!trimmed) return [];
  const terms = words(trimmed);
  if (terms.length === 0) return emojis.filter((emoji) => bare(emoji.emoji) === bare(trimmed)).slice(0, limit);
  return emojis
    .map((emoji) => ({ emoji, score: score(emoji, terms) }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || a.emoji.order - b.emoji.order)
    .slice(0, limit)
    .map((match) => match.emoji);
}

/**
 * The emoji in a skin tone: 0 is the default yellow, 1–5 light to dark.
 * @param {Emoji} emoji
 * @param {number} tone
 */
export function inTone(emoji, tone) {
  return (tone > 0 && emoji.skins?.[tone - 1]) || emoji.emoji;
}

/**
 * Code points as people write them: `U+1F44B U+1F3FD`.
 * @param {string} text
 */
export function codePoints(text) {
  return [...text]
    .map((char) => `U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`)
    .join(' ');
}

/**
 * A name as a title: "flag: Switzerland" → "Flag: Switzerland", "grinning face" → "Grinning face".
 * @param {string} name
 */
export function asTitle(name) {
  return name.charAt(0).toUpperCase() + name.slice(1);
}
