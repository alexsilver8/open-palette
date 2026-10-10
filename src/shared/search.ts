import { fuzzyMatch } from './fuzzy';

export interface Searchable {
  title: string;
  keywords?: string[];
}

export interface Ranked<T> {
  item: T;
  score: number;
  /** Matched indices in `item.title`, for highlighting. */
  titlePositions: number[];
}

const EXACT_BONUS = 4;
const PREFIX_BONUS = 2;
const KEYWORD_WEIGHT = 0.8;
const MULTI_WORD_WEIGHT = 0.9;

interface TextScore {
  score: number;
  positions: number[];
}

function scoreText(query: string, text: string): TextScore | null {
  const match = fuzzyMatch(query, text);
  if (!match) return null;
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let score = match.score;
  if (lowerText === lowerQuery) score += EXACT_BONUS;
  else if (lowerText.startsWith(lowerQuery)) score += PREFIX_BONUS;
  return { score, positions: match.positions };
}

function bestKeywordScore(query: string, keywords: readonly string[]): number | null {
  let best: number | null = null;
  for (const keyword of keywords) {
    const result = scoreText(query, keyword);
    if (result && (best === null || result.score * KEYWORD_WEIGHT > best)) best = result.score * KEYWORD_WEIGHT;
  }
  return best;
}

/** Scores one item against the query, or returns `null` if it doesn't match. */
export function scoreItem(query: string, item: Searchable): { score: number; titlePositions: number[] } | null {
  const q = query.trim();
  if (!q) return { score: 0, titlePositions: [] };
  const keywords = item.keywords ?? [];

  const title = scoreText(q, item.title);
  const keyword = bestKeywordScore(q, keywords);
  if (title && (keyword === null || title.score >= keyword)) {
    return { score: title.score, titlePositions: title.positions };
  }
  if (keyword !== null) return { score: keyword, titlePositions: [] };

  // "chrome google" should still find "Google Chrome": every word has to match the
  // title or a keyword, in any order.
  const words = q.split(/\s+/);
  if (words.length < 2) return null;
  let total = 0;
  const positions = new Set<number>();
  for (const word of words) {
    const wordTitle = scoreText(word, item.title);
    const wordKeyword = bestKeywordScore(word, keywords);
    if (!wordTitle && wordKeyword === null) return null;
    if (wordTitle && (wordKeyword === null || wordTitle.score >= wordKeyword)) {
      total += wordTitle.score;
      for (const p of wordTitle.positions) positions.add(p);
    } else {
      total += wordKeyword as number;
    }
  }
  return { score: total * MULTI_WORD_WEIGHT, titlePositions: [...positions].sort((a, b) => a - b) };
}

/**
 * Filters and sorts items by how well they match the query. `boost` adds to an item's
 * score, e.g. to favour frequently used items. With an empty query every item is kept
 * in its original order.
 */
export function rankItems<T extends Searchable>(
  items: readonly T[],
  query: string,
  boost?: (item: T) => number,
): Ranked<T>[] {
  if (!query.trim()) return items.map((item) => ({ item, score: 0, titlePositions: [] }));

  const ranked: Ranked<T>[] = [];
  for (const item of items) {
    const result = scoreItem(query, item);
    if (result)
      ranked.push({ item, score: result.score + (boost?.(item) ?? 0), titlePositions: result.titlePositions });
  }
  ranked.sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title));
  return ranked;
}
