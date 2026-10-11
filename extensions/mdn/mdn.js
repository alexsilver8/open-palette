/**
 * MDN's public search API (the one developer.mozilla.org's own search box uses) and turning its
 * results into something the list can show.
 */

export const MDN = 'https://developer.mozilla.org';

/**
 * @param {string} query
 * @param {string} [locale]
 */
export function searchUrl(query, locale = 'en-US') {
  const params = new URLSearchParams({ q: query.trim(), locale, size: '20' });
  return `${MDN}/api/v1/search?${params}`;
}

/**
 * @typedef {object} Doc
 * @property {string} title
 * @property {string} url Absolute.
 * @property {string} summary
 * @property {string} area "JavaScript › Reference › Global Objects"
 */

/** Section names in MDN's slugs, as people know them. */
/** @type {Record<string, string>} */
const AREAS = {
  web: '',
  javascript: 'JavaScript',
  css: 'CSS',
  html: 'HTML',
  api: 'Web APIs',
  http: 'HTTP',
  svg: 'SVG',
  accessibility: 'Accessibility',
  learn_web_development: 'Learn',
  glossary: 'Glossary',
  webassembly: 'WebAssembly',
  mathml: 'MathML',
  mozilla: 'Mozilla',
};

/**
 * Where a page sits, from its URL: `/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map`
 * → `JavaScript › Reference › Global Objects › Array`.
 * @param {string} path
 */
export function areaOf(path) {
  const parts = path.split('/docs/')[1]?.split('/') ?? [];
  return parts
    .slice(0, -1)
    .map((part) => {
      const known = AREAS[part.toLowerCase()];
      return known ?? part.replace(/_/g, ' ');
    })
    .filter(Boolean)
    .join(' › ');
}

/** @param {string} text */
function plain(text) {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {unknown} json
 * @returns {Doc[]}
 */
export function parseResults(json) {
  if (typeof json !== 'object' || json === null || !Array.isArray(/** @type {any} */ (json).documents)) return [];
  /** @type {unknown[]} */
  const documents = /** @type {any} */ (json).documents;
  return documents.flatMap((doc) => {
    if (typeof doc !== 'object' || doc === null) return [];
    const { title, mdn_url: path, summary } = /** @type {Record<string, unknown>} */ (doc);
    if (typeof title !== 'string' || typeof path !== 'string' || !path.startsWith('/')) return [];
    return [
      {
        title: plain(title),
        url: `${MDN}${path}`,
        summary: typeof summary === 'string' ? plain(summary) : '',
        area: areaOf(path),
      },
    ];
  });
}
