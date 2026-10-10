# Writing extensions

An extension adds commands to Open Palette. It's a folder with a `package.json` and a JavaScript module, and it runs in its own process (Electron's [utility process](https://www.electronjs.org/docs/latest/api/utility-process)), so a slow or crashing extension can't freeze the launcher.

The quickest way to start is to copy [`examples/extensions/developer-utilities`](../examples/extensions/developer-utilities) into your extensions folder and change it. Run **Open Extensions Folder** from the launcher to find that folder, then **Reload Extensions** after each change.

> Extensions have full Node.js access, like a package you `npm install`. Only install extensions you trust.

## Where extensions are loaded from

- The `extensions` folder inside Open Palette's data folder (run **Open Extensions Folder**).
- Every path in `extensionDirectories` in your [settings](../README.md#settings). Each path can be one extension, or a folder of them — handy for working on an extension in its own repo.
- `examples/extensions` when running from source with `pnpm dev`.

**Manage Extensions** lists everything that loaded, and why anything didn't.

## package.json

```json
{
  "name": "developer-utilities",
  "type": "module",
  "main": "index.js",
  "openPalette": {
    "title": "Developer Utilities",
    "icon": "🧰",
    "commands": [
      { "name": "uuid", "title": "Generate UUID", "mode": "view", "keywords": ["guid"] },
      { "name": "npm-search", "title": "Search npm Packages", "mode": "view", "fallback": true }
    ]
  }
}
```

| Field | |
| --- | --- |
| `name` | Lowercase letters, digits and dashes; unique across your extensions. An npm scope (`@you/`) is ignored. |
| `main` | The module to load. Defaults to `index.js`. ES modules and CommonJS both work. |
| `openPalette.title` | Shown as the subtitle of every command. |
| `openPalette.icon` | An emoji, or a path to an image relative to the extension folder. |
| `openPalette.commands[]` | See below. |

Each command:

| Field | |
| --- | --- |
| `name` | Lowercase letters, digits and dashes; the key of the command in your module. |
| `title` | What people search for. |
| `mode` | `"view"` shows a list. `"no-view"` just runs and closes the launcher. |
| `subtitle`, `icon`, `keywords` | Optional. Keywords are matched by the search too. |
| `fallback` | `true` offers the command under **Use “…” with** for any search, and passes the search text as `ctx.argument`. |
| `platforms` | Limit to some of `"darwin"`, `"win32"`, `"linux"`. |

## The module

Export your commands, keyed by name:

```js
export default {
  commands: {
    uuid: {
      view(ctx) {
        return { type: 'list', items: [/* … */] };
      },
    },
  },
};
```

Types for editors live in [`src/shared/extension-api.ts`](../src/shared/extension-api.ts); the example shows how to use them from plain JavaScript with JSDoc.

A command can implement:

- **`view(ctx)`** — required for `view` commands. Returns a list (see below). May be `async`.
- **`run(ctx)`** — required for `no-view` commands. Returns nothing (the launcher closes) or an [action result](#action-results).
- **`onAction(id, payload, ctx)`** — called when someone picks one of your `callback` actions. Returns an action result.

Calls time out after 10 seconds.

### Context

| `ctx.` | |
| --- | --- |
| `query` | The text in the search field of your view (`""` when it opens). |
| `argument` | The root search text, when opened as a fallback. |
| `platform` | `"darwin"`, `"win32"` or `"linux"`. |
| `storage` | `get(key)`, `set(key, value)`, `remove(key)` — JSON values, kept between runs. |
| `supportPath` | A folder you may write to. |
| `extension` | `{ name, path }`. |

## Lists

```js
{
  type: 'list',
  title: 'Bookmarks',                    // shown next to the search field
  searchPlaceholder: 'Search bookmarks…',
  filtering: true,                       // false: you filter, and view() is called again on every keystroke
  emptyText: 'No bookmarks yet.',
  sections: [
    {
      title: 'Reading list',
      items: [
        {
          id: 'electron-docs',           // unique within the view
          title: 'Electron documentation',
          subtitle: 'electronjs.org',
          accessory: 'Today',            // right-aligned
          icon: '🔖',                    // emoji, image path, or { builtin: 'globe', tint: 'blue' }
          keywords: ['docs'],
          actions: [/* … */],
        },
      ],
    },
  ],
}
```

`items: [...]` at the top level is a shortcut for a single untitled section.

Built-in icons: `alert`, `app`, `calculator`, `clipboard`, `copy`, `extension`, `file`, `folder`, `globe`, `link`, `lock`, `moon`, `note`, `power`, `refresh`, `search`, `settings`, `sparkles`, `terminal`, `text`, `trash`. Tints: `red`, `orange`, `yellow`, `green`, `teal`, `blue`, `purple`, `pink`, `gray`.

## Actions

The first action of an item runs on <kbd>↵</kbd>, the second on <kbd>⌘</kbd><kbd>↵</kbd> (<kbd>Ctrl</kbd><kbd>Enter</kbd> on Windows and Linux), and all of them are listed in the action panel (<kbd>⌘</kbd><kbd>K</kbd>).

| `type` | Fields | Does |
| --- | --- | --- |
| `copy` | `text` | Copies the text and closes the launcher. |
| `open-url` | `url` | Opens the URL in the default browser or app. |
| `open-path` | `path` (absolute) | Opens a file, folder or app. |
| `reveal-path` | `path` (absolute) | Shows the file in Finder / Explorer. |
| `open-command` | `ref: { extension, command }`, `argument?` | Opens another command. |
| `callback` | `id`, `title`, `payload?`, `style?: 'destructive'` | Calls your `onAction(id, payload, ctx)`. |

Every action takes an optional `title` and `shortcut`, e.g. `{ key: 'Backspace', modifiers: ['mod'] }`, where `mod` is <kbd>⌘</kbd> on macOS and <kbd>Ctrl</kbd> elsewhere.

## Action results

`run()` and `onAction()` can return:

| Field | |
| --- | --- |
| `hide: true` | Close the launcher. |
| `toast`, `toastStyle` | A short message in the footer; `'success'` (default) or `'failure'`. |
| `push: view` | Open a new list on top. |
| `replace: view` | Replace the current list, e.g. after deleting an item. |
| `pop: true` | Go back. |
| `clearSearch: true` | Empty the search field. |

If your code throws, the error message is shown as a failure toast.

## Debugging

Run Open Palette from source with `pnpm dev`: `console.log` from extensions shows up in that terminal. **Reload Extensions** restarts the extension process, so your latest code is loaded.
