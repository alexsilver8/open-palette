import { calculate, formatResult } from '../../shared/calculator';
import { rankItems } from '../../shared/search';
import type { RootItem } from '../../shared/types';
import type { DisplayItem, DisplaySection } from './model';

const MAX_SUGGESTIONS = 5;
const MAX_RESULTS = 60;

const URL_WITH_SCHEME = /^https?:\/\/\S+$/i;
const BARE_DOMAIN =
  /^(www\.)?[\w-]+(\.[\w-]+)*\.(com|org|net|io|dev|app|ai|co|so|gg|me|sh|xyz|edu|gov|ch|de|uk|ie|fr|es|it|nl|br|jp|ca|au)(:\d+)?(\/\S*)?$/i;

/** Returns a URL to open if the query looks like one. */
export function asUrl(query: string): string | null {
  if (URL_WITH_SCHEME.test(query)) return query;
  if (BARE_DOMAIN.test(query)) return `https://${query}`;
  return null;
}

/** Frequently used items get a bonus that can lift them a few places, but not past much better matches. */
function usageBoost(item: RootItem): number {
  return Math.min(2, Math.log2(1 + item.frecency));
}

function quote(query: string): string {
  return query.length > 32 ? `${query.slice(0, 31)}…` : query;
}

/** Builds the root list: suggestions and commands when empty, ranked results when searching. */
export function buildRootSections(items: readonly RootItem[], rawQuery: string): DisplaySection[] {
  const query = rawQuery.trim();
  const sections: DisplaySection[] = [];

  if (!query) {
    const suggestions = items
      .filter((item) => item.frecency > 0)
      .sort((a, b) => b.frecency - a.frecency)
      .slice(0, MAX_SUGGESTIONS);
    const suggested = new Set(suggestions.map((item) => item.id));
    const commands = items
      .filter((item) => item.kind === 'command' && !suggested.has(item.id))
      .sort((a, b) => a.title.localeCompare(b.title));
    if (suggestions.length > 0) sections.push({ title: 'Suggestions', items: suggestions.map(asRootRow) });
    if (commands.length > 0) sections.push({ title: 'Commands', items: commands.map(asRootRow) });
    return sections;
  }

  const value = calculate(query);
  if (value !== null) {
    const result = formatResult(value);
    sections.push({
      title: 'Calculator',
      items: [
        {
          id: 'calculator',
          title: result,
          subtitle: query,
          calculator: { expression: query, result },
          actions: [
            { type: 'copy', text: String(value), title: 'Copy Answer' },
            { type: 'copy', text: `${query} = ${result}`, title: 'Copy Calculation' },
          ],
        },
      ],
    });
  }

  const url = asUrl(query);
  if (url) {
    sections.push({
      title: 'Link',
      items: [
        {
          id: 'open-link',
          title: `Open ${url.replace(/^https?:\/\//, '')}`,
          icon: { builtin: 'link', tint: 'blue' },
          actions: [
            { type: 'open-url', url, title: 'Open in Browser' },
            { type: 'copy', text: url, title: 'Copy Link' },
          ],
        },
      ],
    });
  }

  const results = rankItems(items, query, usageBoost)
    .slice(0, MAX_RESULTS)
    .map(({ item, titlePositions }) => ({ ...asRootRow(item), titlePositions }));
  if (results.length > 0) sections.push({ title: 'Results', items: results });

  const fallbacks: DisplayItem[] = items
    .filter((item) => item.fallback)
    .map((item) => ({
      ...asRootRow(item),
      id: `fallback:${item.id}`,
      actions: [
        {
          type: 'open-command',
          ref: item.fallback as NonNullable<RootItem['fallback']>,
          argument: query,
          title: item.title,
        },
      ],
    }));
  if (fallbacks.length > 0) sections.push({ title: `Use “${quote(query)}” with…`, items: fallbacks });

  return sections;
}

function asRootRow(item: RootItem): DisplayItem {
  const { kind: _kind, frecency: _frecency, fallback: _fallback, ...row } = item;
  return { ...row, rootItemId: item.id };
}
