/**
 * Fuzzy matching in the style of fzy (https://github.com/jhawthorn/fzy): the query's
 * characters must appear in order, and the best-scoring alignment wins. Matches at word
 * starts and runs of consecutive characters score higher; gaps cost a little.
 */

export interface FuzzyMatch {
  score: number;
  /** Indices in the text that matched the query, for highlighting. */
  positions: number[];
}

const SCORE_GAP_LEADING = -0.005;
const SCORE_GAP_TRAILING = -0.005;
const SCORE_GAP_INNER = -0.01;
const SCORE_MATCH_CONSECUTIVE = 1.0;
const SCORE_MATCH_SLASH = 0.9;
const SCORE_MATCH_WORD = 0.8;
const SCORE_MATCH_CAPITAL = 0.7;
const SCORE_MATCH_DOT = 0.6;

/** Longer texts are matched by plain substring search to keep the DP cheap. */
const MAX_DP_LENGTH = 256;

function isLower(ch: string): boolean {
  return ch !== ch.toUpperCase() && ch === ch.toLowerCase();
}

function isUpper(ch: string): boolean {
  return ch !== ch.toLowerCase() && ch === ch.toUpperCase();
}

function bonusFor(prev: string, ch: string): number {
  if (prev === '/' || prev === '\\') return SCORE_MATCH_SLASH;
  if (prev === ' ' || prev === '-' || prev === '_' || prev === '(' || prev === '[') return SCORE_MATCH_WORD;
  if (prev === '.') return SCORE_MATCH_DOT;
  if (isLower(prev) && isUpper(ch)) return SCORE_MATCH_CAPITAL;
  return 0;
}

function precomputeBonus(text: string): number[] {
  const bonus: number[] = new Array(text.length);
  let prev = '/'; // the start of the text counts as a word start
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    bonus[i] = bonusFor(prev, ch);
    prev = ch;
  }
  return bonus;
}

function isSubsequence(needle: string, haystack: string): boolean {
  let j = 0;
  for (let i = 0; i < haystack.length && j < needle.length; i++) {
    if (haystack[i] === needle[j]) j++;
  }
  return j === needle.length;
}

/**
 * Lowercases code unit by code unit, so indices still line up with the original text
 * ("İ".toLowerCase() is two code units long).
 */
function lowerSameLength(text: string): string {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    const lower = ch.toLowerCase();
    result += lower.length === 1 ? lower : ch;
  }
  return result;
}

/** Returns `null` when `query` does not match `text`. Matching is case-insensitive. */
export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
  const needle = lowerSameLength(query);
  const haystack = lowerSameLength(text);
  const n = needle.length;
  const m = haystack.length;

  if (n === 0) return { score: 0, positions: [] };
  if (n > m || !isSubsequence(needle, haystack)) return null;

  if (n === m) {
    // Same length and a subsequence means equal (ignoring case): better than any partial match.
    return { score: n * SCORE_MATCH_CONSECUTIVE + 1, positions: Array.from({ length: n }, (_, i) => i) };
  }

  if (m > MAX_DP_LENGTH) {
    const index = haystack.indexOf(needle);
    if (index === -1) return null;
    return { score: SCORE_MATCH_CONSECUTIVE * (n - 1), positions: Array.from({ length: n }, (_, i) => index + i) };
  }

  const bonus = precomputeBonus(text);
  // D[i][j]: best score with needle[i] matched exactly at haystack[j] (ending in a match).
  // M[i][j]: best score for needle[0..i] within haystack[0..j].
  const D: Float64Array[] = [];
  const M: Float64Array[] = [];

  for (let i = 0; i < n; i++) {
    const d = new Float64Array(m).fill(Number.NEGATIVE_INFINITY);
    const mm = new Float64Array(m).fill(Number.NEGATIVE_INFINITY);
    const gapScore = i === n - 1 ? SCORE_GAP_TRAILING : SCORE_GAP_INNER;
    let prevScore = Number.NEGATIVE_INFINITY;

    for (let j = 0; j < m; j++) {
      if (needle[i] === haystack[j]) {
        let score = Number.NEGATIVE_INFINITY;
        if (i === 0) {
          score = j * SCORE_GAP_LEADING + (bonus[j] as number);
        } else if (j > 0) {
          const prevM = M[i - 1] as Float64Array;
          const prevD = D[i - 1] as Float64Array;
          score = Math.max(
            (prevM[j - 1] as number) + (bonus[j] as number),
            (prevD[j - 1] as number) + SCORE_MATCH_CONSECUTIVE,
          );
        }
        d[j] = score;
        prevScore = Math.max(score, prevScore + gapScore);
      } else {
        prevScore = prevScore + gapScore;
      }
      mm[j] = prevScore;
    }
    D.push(d);
    M.push(mm);
  }

  // Walk back through the matrices to recover the matched positions.
  const positions: number[] = new Array(n);
  let matchRequired = false;
  for (let i = n - 1, j = m - 1; i >= 0; i--) {
    const d = D[i] as Float64Array;
    const mm = M[i] as Float64Array;
    for (; j >= 0; j--) {
      const dj = d[j] as number;
      if (dj !== Number.NEGATIVE_INFINITY && (matchRequired || dj === mm[j])) {
        // If this match continues a consecutive run, the previous char must match too.
        matchRequired =
          i > 0 && j > 0 && dj === ((D[i - 1] as Float64Array)[j - 1] as number) + SCORE_MATCH_CONSECUTIVE;
        positions[i] = j;
        j--;
        break;
      }
    }
  }

  return { score: (M[n - 1] as Float64Array)[m - 1] as number, positions };
}
