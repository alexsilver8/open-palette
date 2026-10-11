/**
 * Reading a CSS colour (hex, rgb(), hsl(), oklch() or a name) and writing it in each of those
 * forms. Colours are kept as sRGB channels from 0 to 255 plus alpha from 0 to 1.
 */
import { NAMED_COLORS } from './names.js';

/** @typedef {{ r: number, g: number, b: number, a: number }} Color */

const NUMBER = String.raw`[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?`;

/** @param {number} value @param {number} min @param {number} max */
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Rounds to `places` decimals and drops trailing zeros. */
const round = (/** @type {number} */ value, places = 0) => Number(value.toFixed(places));

/**
 * The parts inside `name(…)`: `rgb(255, 0, 0)`, `rgb(255 0 0 / 50%)`.
 * @param {string} text
 * @param {string} names
 * @returns {{ values: string[], alpha?: string } | undefined}
 */
function functionArgs(text, names) {
  const match = new RegExp(`^(?:${names})\\(\\s*([^)]*)\\)$`).exec(text);
  if (!match?.[1]) return undefined;
  const [main = '', alpha] = match[1].split('/').map((part) => part.trim());
  const values = main.split(/[\s,]+/).filter(Boolean);
  if (values.length === 4 && alpha === undefined) return { values: values.slice(0, 3), alpha: values[3] };
  return values.length === 3 ? { values, alpha } : undefined;
}

/**
 * `50%`, `0.5` or `none`.
 * @param {string | undefined} value
 * @param {number} percentOf what 100% means
 * @returns {number | undefined}
 */
function amount(value, percentOf) {
  if (value === undefined) return undefined;
  if (value === 'none') return 0;
  const match = new RegExp(`^(${NUMBER})(%?)$`).exec(value);
  if (!match) return undefined;
  const number = Number(match[1]);
  return match[2] ? (number / 100) * percentOf : number;
}

/**
 * Hue in degrees from `120`, `120deg`, `0.5turn`, `2rad`, `100grad`.
 * @param {string | undefined} value
 */
function hue(value) {
  if (value === 'none') return 0;
  const match = value && new RegExp(`^(${NUMBER})(deg|turn|rad|grad)?$`).exec(value);
  if (!match) return undefined;
  const number = Number(match[1]);
  const degrees = { turn: number * 360, rad: (number * 180) / Math.PI, grad: number * 0.9 }[match[2] ?? ''] ?? number;
  return ((degrees % 360) + 360) % 360;
}

/** @param {string | undefined} value */
function alphaOf(value) {
  if (value === undefined) return 1;
  const alpha = amount(value, 1);
  return alpha === undefined ? undefined : clamp(alpha, 0, 1);
}

/**
 * @param {string} input
 * @returns {Color | undefined}
 */
export function parseColor(input) {
  const text = input.trim().toLowerCase().replace(/;$/, '');
  if (!text) return undefined;
  if (text === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const named = NAMED_COLORS[text];
  if (named) return parseColor(named);

  // Three or four hex digits need the #, so words like "bad" or "cafe" aren't read as colours.
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$|^([0-9a-f]{6}|[0-9a-f]{8})$/.exec(text);
  if (hex) {
    let digits = hex[1] ?? hex[2] ?? '';
    if (digits.length <= 4) digits = [...digits].map((digit) => digit + digit).join('');
    const channel = (/** @type {number} */ at) => Number.parseInt(digits.slice(at, at + 2), 16);
    return { r: channel(0), g: channel(2), b: channel(4), a: digits.length === 8 ? round(channel(6) / 255, 3) : 1 };
  }

  const rgb = functionArgs(text, 'rgba?');
  if (rgb) {
    const [r, g, b] = rgb.values.map((value) => amount(value, 255));
    const a = alphaOf(rgb.alpha);
    if (r === undefined || g === undefined || b === undefined || a === undefined) return undefined;
    return { r: clamp(r, 0, 255), g: clamp(g, 0, 255), b: clamp(b, 0, 255), a };
  }

  const hsl = functionArgs(text, 'hsla?');
  if (hsl) {
    const h = hue(hsl.values[0]);
    const s = amount(hsl.values[1]?.endsWith('%') ? hsl.values[1] : `${hsl.values[1]}%`, 1);
    const l = amount(hsl.values[2]?.endsWith('%') ? hsl.values[2] : `${hsl.values[2]}%`, 1);
    const a = alphaOf(hsl.alpha);
    if (h === undefined || s === undefined || l === undefined || a === undefined) return undefined;
    return { ...hslToRgb(h, clamp(s, 0, 1), clamp(l, 0, 1)), a };
  }

  const oklch = functionArgs(text, 'oklch');
  if (oklch) {
    const l = amount(oklch.values[0], 1);
    const c = amount(oklch.values[1], 0.4);
    const h = hue(oklch.values[2]);
    const a = alphaOf(oklch.alpha);
    if (l === undefined || c === undefined || h === undefined || a === undefined) return undefined;
    return { ...oklchToRgb(clamp(l, 0, 1), Math.max(0, c), h), a };
  }
  return undefined;
}

/**
 * @param {number} h degrees
 * @param {number} s 0–1
 * @param {number} l 0–1
 */
function hslToRgb(h, s, l) {
  const k = (/** @type {number} */ n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (/** @type {number} */ n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return { r: f(0) * 255, g: f(8) * 255, b: f(4) * 255 };
}

/** sRGB channel (0–1) to linear light, and back. */
const toLinear = (/** @type {number} */ c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (/** @type {number} */ c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/**
 * OKLCH to sRGB, through OKLab (Björn Ottosson's matrices). Colours outside sRGB are clipped.
 * @param {number} l 0–1
 * @param {number} c
 * @param {number} h degrees
 */
function oklchToRgb(l, c, h) {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const channel = (/** @type {number} */ linear) => clamp(fromLinear(linear), 0, 1) * 255;
  return {
    r: channel(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_),
    g: channel(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_),
    b: channel(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_),
  };
}

/** @param {Color} color */
export function toOklch(color) {
  const r = toLinear(color.r / 255);
  const g = toLinear(color.g / 255);
  const b = toLinear(color.b / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const chroma = Math.hypot(a, bb);
  const h = chroma < 0.0002 ? 0 : ((((Math.atan2(bb, a) * 180) / Math.PI) % 360) + 360) % 360;
  return { l: lightness, c: chroma, h };
}

/** @param {Color} color */
export function toHsl(color) {
  const [r, g, b] = [color.r / 255, color.g / 255, color.b / 255];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: (((h * 60) % 360) + 360) % 360, s, l };
}

/** @param {number} value 0–255 */
const hex2 = (value) =>
  Math.round(clamp(value, 0, 255))
    .toString(16)
    .padStart(2, '0');

/** @param {number} a */
const alphaSuffix = (a) => (a < 1 ? ` / ${round(a, 3)}` : '');

/**
 * The colour in each CSS form.
 * @param {Color} color
 * @returns {Array<{ id: string, label: string, value: string }>}
 */
export function formatColor(color) {
  const hex = `#${hex2(color.r)}${hex2(color.g)}${hex2(color.b)}${color.a < 1 ? hex2(color.a * 255) : ''}`;
  const rgb = `rgb(${[color.r, color.g, color.b].map((value) => Math.round(value)).join(' ')}${alphaSuffix(color.a)})`;
  const hsl = toHsl(color);
  const oklch = toOklch(color);
  /** @type {Array<{ id: string, label: string, value: string }>} */
  const forms = [
    { id: 'hex', label: 'HEX', value: hex },
    { id: 'rgb', label: 'RGB', value: rgb },
    {
      id: 'hsl',
      label: 'HSL',
      value: `hsl(${round(hsl.h, 1)} ${round(hsl.s * 100, 1)}% ${round(hsl.l * 100, 1)}%${alphaSuffix(color.a)})`,
    },
    {
      id: 'oklch',
      label: 'OKLCH',
      value: `oklch(${round(oklch.l * 100, 2)}% ${round(oklch.c, 4)} ${round(oklch.h, 2)}${alphaSuffix(color.a)})`,
    },
  ];
  const name = nameOf(color);
  if (name) forms.push({ id: 'name', label: 'CSS name', value: name });
  return forms;
}

/**
 * The CSS name for exactly this colour, if it has one.
 * @param {Color} color
 */
export function nameOf(color) {
  if (color.a < 1) return color.a === 0 ? 'transparent' : undefined;
  const hex = `#${hex2(color.r)}${hex2(color.g)}${hex2(color.b)}`;
  return Object.entries(NAMED_COLORS).find(([, value]) => value === hex)?.[0];
}

/**
 * WCAG 2 contrast ratio between two opaque colours, from 1 to 21.
 * @param {Color} a
 * @param {Color} b
 */
export function contrast(a, b) {
  const luminance = (/** @type {Color} */ color) => {
    return 0.2126 * toLinear(color.r / 255) + 0.7152 * toLinear(color.g / 255) + 0.0722 * toLinear(color.b / 255);
  };
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return round(((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05), 2);
}
