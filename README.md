# Open Palette

[![CI](https://github.com/alexsilver8/open-palette/actions/workflows/ci.yml/badge.svg)](https://github.com/alexsilver8/open-palette/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/alexsilver8/open-palette?sort=semver)](https://github.com/alexsilver8/open-palette/releases)
[![License](https://img.shields.io/github/license/alexsilver8/open-palette)](./LICENSE)
[![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-fe5196.svg)](https://www.conventionalcommits.org)

An open-source, keyboard-first launcher for macOS, Windows and Linux, in the spirit of Raycast. Press <kbd>⌥</kbd> <kbd>Space</kbd>, type a few letters, press <kbd>↵</kbd>.

Website: [openpalette.alexsilver.dev](https://openpalette.alexsilver.dev/)

![Open Palette finding a note, with its preview beside the results](docs/images/launcher.png)

## What it does

- **Finds everything from one box** — apps, commands, notes and copied text all show up as you type. <kbd>⇥</kbd> narrows the list to Apps, Commands, Notes or Clipboard, and a preview beside the results shows the note or copied text you've selected.
- **Opens apps** — finds installed applications on every platform.
- **Keeps notes, as many as you want** — a floating Notes window with headings, checklists, links and code, plus search, autosave and a pin to keep it on top. Every note is a plain Markdown file, so you can sync, back up or edit them with anything. There's no limit on how many you keep.
- **Calculates as you type** — `1200 * 1.077 + 2^5` shows `1,324.4`; <kbd>↵</kbd> copies it.
- **Remembers your clipboard** — searchable history of copied text, skipping anything password managers mark as private.
- **Searches the web** — anything that doesn't match falls back to Google, DuckDuckGo or any extension that offers itself.
- **Learns what you use** — frequently used items rise to the top.
- **Comes with extensions** — Port Manager, Gitmoji, Emoji and Conventional Commits, described [below](#included-extensions).
- **Runs extensions** — commands written in JavaScript, each extension in a separate process. See [Writing extensions](docs/extensions.md).
- **Everything has actions** — <kbd>⌘</kbd> <kbd>K</kbd> lists what you can do with the selected item.
- **Looks at home on your desktop** — liquid-glass windows that blur what's behind them on macOS and Windows 11, in light or dark, with the search field, preview and action bar floating on brighter panes. Linux gets the same design on a solid background, since it has no system blur.

## Install

Download the latest build for your system from [Releases](https://github.com/alexsilver8/open-palette/releases).

Builds aren't code-signed yet, so your system will warn you the first time you open one. On macOS, allow it under **System Settings → Privacy & Security → Open Anyway**. On Windows, choose **More info → Run anyway**.

## Use

| Keys | |
| --- | --- |
| <kbd>⌥</kbd> <kbd>Space</kbd> (<kbd>Alt</kbd> <kbd>Space</kbd>) | Open or close the launcher |
| <kbd>↑</kbd> <kbd>↓</kbd> | Move through results (also <kbd>Ctrl</kbd> <kbd>N</kbd> / <kbd>Ctrl</kbd> <kbd>P</kbd>) |
| <kbd>⇥</kbd> / <kbd>⇧</kbd> <kbd>⇥</kbd> | Switch between All, Apps, Commands, Notes and Clipboard |
| <kbd>↵</kbd> | Run the primary action |
| <kbd>⌘</kbd> <kbd>↵</kbd> | Run the secondary action |
| <kbd>⌘</kbd> <kbd>1</kbd> … <kbd>9</kbd> | Run one of the first nine results (hold <kbd>⌘</kbd> to see the numbers) |
| <kbd>⌘</kbd> <kbd>K</kbd> | Show all actions |
| <kbd>Esc</kbd> | Go back, clear the search, return to All, then close |
| <kbd>⌘</kbd> <kbd>,</kbd> | Open settings |

In the Notes window: <kbd>⌘</kbd> <kbd>N</kbd> new note, <kbd>⌘</kbd> <kbd>P</kbd> find a note, <kbd>⌘</kbd> <kbd>\</kbd> show or hide the list, <kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>⌫</kbd> move the note to the Trash. Formatting shortcuts are listed in the [Notes](#notes) section.

On Windows and Linux, use <kbd>Ctrl</kbd> wherever you see <kbd>⌘</kbd>.

On Linux under Wayland, global shortcuts may not reach the app. Bind a shortcut in your desktop settings to run `open-palette` instead: launching it again opens the running instance.

## Notes

![The Notes window](docs/images/notes.png)

Run **Create Note** to start writing, or **Open Notes** to bring the window back. Notes show up in the launcher's search as you type, matching anything in them, not just the title; press <kbd>⇥</kbd> to see only notes, newest first, with a preview of the one you've selected. **Search Notes** lists them all on their own. **Create Note** also appears under **Use “…” with** for anything you type, so you can type a thought into the launcher and save it straight away.

### Formatting

The toolbar at the bottom of the window formats the selection or the line you're on, and Markdown you type turns into formatting as you go: `# ` starts a heading, `- ` a list, `[ ] ` a checklist, `> ` a quote and ` ``` ` a code block.

| Keys | |
| --- | --- |
| <kbd>⌘</kbd> <kbd>⌥</kbd> <kbd>1</kbd>–<kbd>3</kbd>, <kbd>⌘</kbd> <kbd>⌥</kbd> <kbd>0</kbd> | Heading 1–3, back to text |
| <kbd>⌘</kbd> <kbd>B</kbd>, <kbd>⌘</kbd> <kbd>I</kbd>, <kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>S</kbd> | Bold, italic, strikethrough |
| <kbd>⌘</kbd> <kbd>K</kbd> | Add or edit a link; <kbd>⌘</kbd>-click a link to open it |
| <kbd>⌘</kbd> <kbd>E</kbd>, <kbd>⌘</kbd> <kbd>⌥</kbd> <kbd>C</kbd> | Inline code, code block |
| <kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>B</kbd> | Quote |
| <kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>8</kbd>, <kbd>7</kbd>, <kbd>9</kbd> | Bulleted list, numbered list, checklist |

Notes are saved as you type, one `.md` file per note, and what you see is what's in the file: the formatting is Markdown, so it reads the same in any editor. A note is only rewritten when you change it, and then in a tidy form (for example `*` bullets become `-`). Notes with Markdown the editor can't show yet, like tables, images or front matter, open as plain Markdown instead, so nothing in them is lost. Set `notesDirectory` to a synced folder (Dropbox, iCloud Drive, a git repo) to have them everywhere; Markdown files already in that folder show up as notes too. Notes you delete go to the system Trash.

## Included extensions

These come with Open Palette and are written with the same [extension API](docs/extensions.md) as any other, in [`extensions/`](extensions).

| Command | |
| --- | --- |
| **Open Ports** | Every program listening on a port, with its command line and whether other devices can reach it. <kbd>↵</kbd> stops it, <kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>⌫</kbd> forces it, <kbd>⌘</kbd> <kbd>O</kbd> opens it in the browser. |
| **Search Gitmoji** | The [gitmoji](https://gitmoji.dev) list by name or meaning. <kbd>↵</kbd> pastes the emoji, <kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>C</kbd> copies its `:code:`. Recently used come first. |
| **Search Emoji** | Every emoji by name, keyword or `:shortcode:`, recently used first. <kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>T</kbd> picks the skin tone for all of them. |
| **Write Commit Message** | A [Conventional Commits](https://www.conventionalcommits.org) message, checked as you type, with what it does to the version. Pick a type, or just describe the change: it suggests the type, also from the launcher's **Use “…” with**. |

<kbd>↵</kbd> in Gitmoji, Emoji and Commit Message pastes into the app you were in. The first time on macOS, allow Open Palette under **System Settings → Privacy & Security → Accessibility** (and **Automation** for System Events). On Linux, pasting needs `xdotool` (X11) or `wtype` (Wayland); without them the text is copied instead. Turn off **Paste into the app you were in** in Settings to always copy.

## Settings

Open **Settings** with <kbd>⌘</kbd> <kbd>,</kbd> in the launcher, the **Open Settings** command, or **Settings…** in the tray menu. There you can record a new shortcut, pick light or dark, choose how much clipboard history to keep, move your notes folder and manage extensions.

Everything is also saved in `settings.json` (**Settings → About → Edit settings.json**), and changes you make there apply as soon as you save:

```jsonc
{
  "hotkey": "Alt+Space",              // any Electron accelerator, e.g. "CommandOrControl+Shift+Space"
  "hideOnBlur": true,                 // close when you click elsewhere
  "launchAtLogin": false,             // macOS and Windows
  "theme": "system",                  // "light" or "dark"
  "clipboardHistory": { "enabled": true, "maxItems": 200 },
  "extensionDirectories": [],         // more places to load extensions from
  "notesDirectory": ""                // where notes are saved; empty means the app's data folder
}
```

## Develop

You need Node.js 22.12 or later and pnpm (`corepack enable` sets up the right version).

```sh
pnpm install
pnpm dev          # run with hot reload; also loads examples/extensions
pnpm test         # unit tests
pnpm test:e2e     # build, then drive the app with Playwright
pnpm lint         # Biome
pnpm typecheck
pnpm dist         # installers for your OS in release/
```

`pnpm install` also downloads the Electron binary for your platform.

### How it fits together

```
┌──────────────────────┐  IPC   ┌────────────────────────────┐  messages  ┌─────────────────────┐
│ Renderer (React)     │◀──────▶│ Main process               │◀──────────▶│ Extension host      │
│ search, ranking,     │        │ window, hotkey, tray,      │            │ (utility process)   │
│ calculator, actions  │        │ apps, clipboard, built-in  │            │ third-party         │
│                      │        │ commands, command registry │            │ extensions          │
└──────────────────────┘        └────────────────────────────┘            └─────────────────────┘
```

- `src/main` — app lifecycle, the launcher window, built-in commands (`commands/`), app indexing (`apps/`), clipboard history, notes (`notes/`) and the command registry that routes every action.
- `src/extension-host` — loads extensions and runs their commands in a separate process.
- `src/renderer` — the launcher and Notes windows. Root search and the calculator run here, so typing never waits on IPC.
- `src/shared` — types, fuzzy matching and the calculator, shared by all three.
- `extensions` — the extensions that come with Open Palette, in plain JavaScript checked through JSDoc. `pnpm extensions:data` refreshes the gitmoji and emoji lists from their packages.
- `website` — the landing page: plain HTML, CSS and JavaScript with no build step. Serve the folder to preview it (`npx serve website`); pushes to `main` publish it to GitHub Pages.

Built-in commands implement the same interface as extensions, so anything a built-in can do, an extension can too.

## Roadmap

- Form views and full Markdown detail views for extensions
- An `@open-palette/api` package with types and helpers
- Quicklinks and snippets
- Window management
- Code-signed, auto-updating releases

Ideas and bug reports are welcome in [Issues](https://github.com/alexsilver8/open-palette/issues).

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request.

## License

[MIT](./LICENSE)
