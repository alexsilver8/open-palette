/**
 * Encodings, decodings and hashes of a piece of text. Every decoder returns `undefined` when
 * the text isn't in that form, so the list only offers what makes sense.
 */
import { createHash } from 'node:crypto';

const STRICT_UTF8 = new TextDecoder('utf-8', { fatal: true });

/**
 * Text people can read: no control characters other than tabs and line breaks, and no
 * replacement characters.
 * @param {string} text
 */
export function isReadable(text) {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what this looks for
  return text.length > 0 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f�]/.test(text);
}

/** @param {string} text */
export function base64Encode(text) {
  return Buffer.from(text, 'utf8').toString('base64');
}

/** @param {string} text */
export function base64UrlEncode(text) {
  return Buffer.from(text, 'utf8').toString('base64url');
}

/**
 * Standard or URL-safe Base64, with or without padding, back to text.
 * @param {string} text
 * @returns {string | undefined}
 */
export function base64Decode(text) {
  const compact = text.replace(/\s+/g, '');
  if (compact.length < 4 || compact.length % 4 === 1) return undefined;
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(compact)) return undefined;
  const urlSafe = /[-_]/.test(compact);
  if (urlSafe && /[+/]/.test(compact)) return undefined;
  let decoded;
  try {
    decoded = STRICT_UTF8.decode(Buffer.from(compact, urlSafe ? 'base64url' : 'base64'));
  } catch {
    return undefined;
  }
  return isReadable(decoded) && decoded !== text ? decoded : undefined;
}

/** @param {string} text */
export function urlEncode(text) {
  return encodeURIComponent(text);
}

/**
 * Percent-encoded text (and `+` for spaces, as in query strings) back to text.
 * @param {string} text
 * @returns {string | undefined}
 */
export function urlDecode(text) {
  if (!/%[0-9A-Fa-f]{2}/.test(text) && !(/\+/.test(text) && !/\s/.test(text))) return undefined;
  try {
    const decoded = decodeURIComponent(text.replace(/\+/g, ' '));
    return decoded !== text && isReadable(decoded) ? decoded : undefined;
  } catch {
    return undefined;
  }
}

/** @type {Record<string, string>} */
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', hellip: '…' };

/** @param {string} text */
export function htmlEncode(text) {
  return text.replace(/[&<>"']/g, (char) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot', "'": '#39' }[char]};`);
}

/**
 * Named and numeric HTML entities back to characters.
 * @param {string} text
 * @returns {string | undefined}
 */
export function htmlDecode(text) {
  const decoded = text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name) => {
    const lower = name.toLowerCase();
    if (lower.startsWith('#')) {
      const code = lower.startsWith('#x') ? Number.parseInt(lower.slice(2), 16) : Number(lower.slice(1));
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    }
    return ENTITIES[lower] ?? entity;
  });
  return decoded !== text ? decoded : undefined;
}

/**
 * @typedef {object} Jwt
 * @property {Record<string, unknown>} header
 * @property {Record<string, unknown>} payload
 */

/**
 * A JSON Web Token's header and claims. The signature isn't checked: that needs the key.
 * @param {string} text
 * @returns {Jwt | undefined}
 */
export function decodeJwt(text) {
  const token = text.trim().replace(/^Bearer\s+/i, '');
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !/^[\w-]+\.[\w-]+\.[\w-]*$/.test(token)) return undefined;
  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (!isObject(header) || !isObject(payload) || typeof header.alg !== 'string') return undefined;
    return { header, payload };
  } catch {
    return undefined;
  }
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The registered time claims of a JWT, as dates.
 * @param {Record<string, unknown>} payload
 * @returns {Array<{ claim: string, label: string, date: Date }>}
 */
export function jwtTimes(payload) {
  /** @type {Array<[string, string]>} */
  const claims = [
    ['iat', 'Issued'],
    ['nbf', 'Valid from'],
    ['exp', 'Expires'],
  ];
  return claims.flatMap(([claim, label]) => {
    const seconds = payload[claim];
    return typeof seconds === 'number' && Number.isFinite(seconds)
      ? [{ claim, label, date: new Date(seconds * 1000) }]
      : [];
  });
}

/**
 * Hex digests of the text's UTF-8 bytes.
 * @param {string} text
 * @returns {Array<{ name: string, value: string }>}
 */
export function hashes(text) {
  /** @type {Array<[string, string]>} */
  const algorithms = [
    ['SHA-256', 'sha256'],
    ['SHA-1', 'sha1'],
    ['SHA-512', 'sha512'],
    ['MD5', 'md5'],
  ];
  return algorithms.map(([name, algorithm]) => ({
    name,
    value: createHash(algorithm).update(text, 'utf8').digest('hex'),
  }));
}
