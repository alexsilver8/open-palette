// An example Waypoint extension: UUIDs, npm search and a to-do list.
// See docs/extensions.md for the full API.
//
// Each command named in package.json is implemented here. `view` commands return a list,
// `no-view` commands just do something, and `onAction` handles the "callback" actions
// that a command's items offer.
import { randomUUID } from 'node:crypto';

/** @typedef {import('../../../src/shared/extension-api').Extension} Extension */
/** @typedef {import('../../../src/shared/extension-api').ExtensionContext} Context */
/** @typedef {import('../../../src/shared/extension-api').ListItem} ListItem */
/** @typedef {import('../../../src/shared/extension-api').ListView} ListView */
/** @typedef {import('../../../src/shared/extension-api').Action} Action */

/**
 * @param {Context} ctx
 * @returns {ListView}
 */
function uuidView(ctx) {
  const uuids = Array.from({ length: 5 }, () =>
    ctx.query.toLowerCase().includes('upper') ? randomUUID().toUpperCase() : randomUUID(),
  );
  return {
    type: 'list',
    title: 'Generate UUID',
    searchPlaceholder: 'Type "upper" for uppercase…',
    // The list is generated from the query, so don't let the launcher filter it.
    filtering: false,
    sections: [
      {
        title: 'Fresh UUIDs',
        items: uuids.map((uuid) => ({
          id: uuid,
          title: uuid,
          icon: { emoji: '🎲' },
          actions: [
            { type: 'copy', text: uuid, title: 'Copy UUID' },
            {
              type: 'callback',
              id: 'regenerate',
              title: 'Generate New Ones',
              shortcut: { key: 'r', modifiers: ['mod'] },
            },
          ],
        })),
      },
    ],
  };
}

/**
 * @param {Context} ctx
 * @returns {Promise<ListView>}
 */
async function npmView(ctx) {
  const query = (ctx.query || ctx.argument || '').trim();
  if (!query) {
    return {
      type: 'list',
      title: 'npm',
      filtering: false,
      searchPlaceholder: 'Search npm packages…',
      sections: [],
      emptyText: 'Type to search the npm registry.',
    };
  }
  const response = await fetch(`https://registry.npmjs.org/-/v1/search?size=20&text=${encodeURIComponent(query)}`);
  if (!response.ok) throw new Error(`npm responded with ${response.status}`);
  const { objects } =
    /** @type {{ objects: Array<{ package: { name: string, version: string, description?: string, links: { npm: string, repository?: string } } }> }} */ (
      await response.json()
    );
  return {
    type: 'list',
    title: 'npm',
    searchPlaceholder: 'Search npm packages…',
    filtering: false,
    sections: [
      {
        title: `Results for “${query}”`,
        items: objects.map(({ package: pkg }) => ({
          id: pkg.name,
          title: pkg.name,
          subtitle: pkg.description,
          accessory: `v${pkg.version}`,
          icon: { emoji: '📦' },
          actions: [
            { type: 'open-url', url: pkg.links.npm, title: 'Open on npmjs.com' },
            { type: 'copy', text: `npm install ${pkg.name}`, title: 'Copy Install Command' },
            .../** @type {Action[]} */ (
              pkg.links.repository ? [{ type: 'open-url', url: pkg.links.repository, title: 'Open Repository' }] : []
            ),
          ],
        })),
      },
    ],
    emptyText: 'No packages found.',
  };
}

/**
 * @param {Context} ctx
 * @returns {Array<{ id: string, text: string, done: boolean }>}
 */
function readTodos(ctx) {
  return /** @type {any} */ (ctx.storage.get('todos')) ?? [];
}

/**
 * @param {Context} ctx
 * @returns {ListView}
 */
function todosView(ctx) {
  const todos = readTodos(ctx);
  const query = ctx.query.trim();
  const matching = todos.filter((todo) => todo.text.toLowerCase().includes(query.toLowerCase()));
  /** @param {{ id: string, text: string, done: boolean }} todo @returns {ListItem} */
  const toItem = (todo) => ({
    id: todo.id,
    title: todo.text,
    icon: { emoji: todo.done ? '✅' : '⬜️' },
    actions: [
      { type: 'callback', id: 'toggle', title: todo.done ? 'Mark as Not Done' : 'Mark as Done', payload: todo.id },
      { type: 'copy', text: todo.text, title: 'Copy Text' },
      {
        type: 'callback',
        id: 'delete',
        title: 'Delete To-do',
        payload: todo.id,
        style: 'destructive',
        shortcut: { key: 'Backspace', modifiers: ['mod'] },
      },
    ],
  });
  return {
    type: 'list',
    title: 'To-dos',
    searchPlaceholder: 'Type to search, or to add a to-do…',
    // The "Add" row depends on the search text, so this command filters by itself.
    filtering: false,
    sections: [
      {
        items: query
          ? [
              {
                id: 'add',
                title: `Add “${query}”`,
                icon: { emoji: '➕' },
                actions: [{ type: 'callback', id: 'add', title: 'Add To-do', payload: query }],
              },
            ]
          : [],
      },
      { title: 'To do', items: matching.filter((todo) => !todo.done).map(toItem) },
      { title: 'Done', items: matching.filter((todo) => todo.done).map(toItem) },
    ],
    emptyText: 'Nothing to do. Type something and press ↵ to add it.',
  };
}

/** @type {Extension} */
export default {
  commands: {
    uuid: {
      view: uuidView,
      onAction: (id, _payload, ctx) => (id === 'regenerate' ? { replace: uuidView(ctx) } : undefined),
    },
    'npm-search': { view: npmView },
    todos: {
      view: todosView,
      onAction(id, payload, ctx) {
        const todos = readTodos(ctx);
        if (id === 'add' && typeof payload === 'string') {
          ctx.storage.set('todos', [{ id: randomUUID(), text: payload, done: false }, ...todos]);
          return { replace: todosView({ ...ctx, query: '' }), clearSearch: true, toast: 'To-do added' };
        }
        if (id === 'toggle') {
          ctx.storage.set(
            'todos',
            todos.map((todo) => (todo.id === payload ? { ...todo, done: !todo.done } : todo)),
          );
          return { replace: todosView(ctx) };
        }
        if (id === 'delete') {
          ctx.storage.set(
            'todos',
            todos.filter((todo) => todo.id !== payload),
          );
          return { replace: todosView(ctx), toast: 'To-do deleted' };
        }
        return undefined;
      },
    },
  },
};
