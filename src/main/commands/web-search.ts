import { shell } from 'electron';
import type { BuiltinExtension } from './types';

const engines = {
  google: { title: 'Google', home: 'https://www.google.com', search: 'https://www.google.com/search?q=' },
  duckduckgo: { title: 'DuckDuckGo', home: 'https://duckduckgo.com', search: 'https://duckduckgo.com/?q=' },
} as const;

function searchCommand(engine: keyof typeof engines) {
  return {
    async run(ctx: { argument?: string }) {
      const { home, search } = engines[engine];
      const query = ctx.argument?.trim();
      await shell.openExternal(query ? search + encodeURIComponent(query) : home);
      return { hide: true };
    },
  };
}

export const webSearch: BuiltinExtension = {
  manifest: {
    name: 'web-search',
    title: 'Web Search',
    icon: { builtin: 'globe', tint: 'blue' },
    commands: [
      { name: 'google', title: 'Search Google', mode: 'no-view', fallback: true, keywords: ['web'] },
      {
        name: 'duckduckgo',
        title: 'Search DuckDuckGo',
        mode: 'no-view',
        fallback: true,
        keywords: ['web', 'ddg'],
        icon: { builtin: 'search', tint: 'orange' },
      },
    ],
  },
  commands: {
    google: searchCommand('google'),
    duckduckgo: searchCommand('duckduckgo'),
  },
};
