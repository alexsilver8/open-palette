/**
 * @typedef {{ emoji: string, code: string, description: string, name: string, semver: string | null }} Gitmoji
 */

/**
 * The words of some text, lowercased.
 * @param {string} text
 */
export function words(text) {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}+]+/u)
    .filter(Boolean);
}

/**
 * The gitmoji that match every word of the query, best first: a match on the name (`bug`,
 * `:sparkles:`) beats one on the description ("Fix a bug."). An empty query matches them all.
 * @param {Gitmoji[]} gitmojis
 * @param {string} query
 * @returns {Gitmoji[]}
 */
export function searchGitmojis(gitmojis, query) {
  const trimmed = query.trim();
  if (!trimmed) return gitmojis;
  const byEmoji = gitmojis.filter((gitmoji) => gitmoji.emoji.replace(/️/g, '') === trimmed.replace(/️/g, ''));
  if (byEmoji.length > 0) return byEmoji;

  const terms = words(trimmed.replace(/:/g, ' '));
  /** @type {Array<{ gitmoji: Gitmoji, score: number, index: number }>} */
  const scored = [];
  gitmojis.forEach((gitmoji, index) => {
    const name = gitmoji.name.toLowerCase();
    const description = words(gitmoji.description);
    let score = 0;
    for (const term of terms) {
      if (name === term) score += 10;
      else if (name.startsWith(term)) score += 6;
      else if (description.includes(term)) score += 4;
      else if (description.some((word) => word.startsWith(term))) score += 3;
      else if (name.includes(term)) score += 2;
      else if (gitmoji.semver === term) score += 1;
      else return;
    }
    scored.push({ gitmoji, score, index });
  });
  return scored.sort((a, b) => b.score - a.score || a.index - b.index).map(({ gitmoji }) => gitmoji);
}

/**
 * A description as a title: "Fix a bug." → "Fix a bug".
 * @param {string} description
 */
export function asTitle(description) {
  return description.trim().replace(/\.$/, '');
}
