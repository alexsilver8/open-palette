# Open Palette

[![CI](https://github.com/alexsilver8/open-palette/actions/workflows/ci.yml/badge.svg)](https://github.com/alexsilver8/open-palette/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/alexsilver8/open-palette?sort=semver)](https://github.com/alexsilver8/open-palette/releases)
[![License](https://img.shields.io/github/license/alexsilver8/open-palette)](./LICENSE)
[![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-fe5196.svg)](https://www.conventionalcommits.org)

An open-source, keyboard-first launcher for macOS, Windows and Linux, in the spirit of Raycast. Press <kbd>⌥</kbd> <kbd>Space</kbd>, type a few letters, press <kbd>↵</kbd>.

Website: [alexsilver8.github.io/open-palette](https://alexsilver8.github.io/open-palette/)

![Open Palette finding a note, with its preview beside the results](docs/images/launcher.png)

## What it does

- **Finds everything from one box** — apps, commands, notes and copied text all show up as you type. <kbd>⇥</kbd> narrows the list to Apps, Commands, Notes or Clipboard, and a preview beside the results shows the note or copied text you've selected.
- **Opens apps** — finds installed applications on every platform.
- **Keeps notes, as many as you want** — a floating Notes window with search, autosave and a pin to keep it on top. Every note is a plain Markdown file, so you can sync, back up or edit them with anything. There's no limit on how many you keep.
- **Calculates as you type** — `1200 * 1.077 + 2^5` shows `1,324.4`; <kbd>↵</kbd> copies it.
- **Remembers your clipboard** — searchable history of copied text, skipping anything password managers mark as private.
- **Searches the web** — anything that doesn't match falls back to Google, DuckDuckGo or any extension that offers itself.
- **Learns what you use** — frequently used items rise to the top.
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

In the Notes window: <kbd>⌘</kbd> <kbd>N</kbd> new note, <kbd>⌘</kbd> <kbd>P</kbd> find a note, <kbd>⌘</kbd> <kbd>\</kbd> show or hide the list, <kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>⌫</kbd> move the note to the Trash.

On Windows and Linux, use <kbd>Ctrl</kbd> wherever you see <kbd>⌘</kbd>.

On Linux under Wayland, global shortcuts may not reach the app. Bind a shortcut in your desktop settings to run `open-palette` instead: launching it again opens the running instance.

## Notes

![The Notes window](docs/images/notes.png)

Run **Create Note** to start writing, or **Open Notes** to bring the window back. Notes show up in the launcher's search as you type, matching anything in them, not just the title; press <kbd>⇥</kbd> to see only notes, newest first, with a preview of the one you've selected. **Search Notes** lists them all on their own. **Create Note** also appears under **Use “…” with** for anything you type, so you can type a thought into the launcher and save it straight away.

Notes are saved as you type, one `.md` file per note. Set `notesDirectory` to a synced folder (Dropbox, iCloud Drive, a git repo) to have them everywhere; Markdown files already in that folder show up as notes too. Notes you delete go to the system Trash.

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
- `website` — the landing page: plain HTML, CSS and JavaScript with no build step. Serve the folder to preview it (`npx serve website`); pushes to `main` publish it to GitHub Pages.

Built-in commands implement the same interface as extensions, so anything a built-in can do, an extension can too.

## Roadmap

- Form views and full Markdown detail views for extensions
- An `@open-palette/api` package with types and helpers
- Markdown preview and checklists in Notes
- Quicklinks and snippets
- Window management
- Code-signed, auto-updating releases

Ideas and bug reports are welcome in [Issues](https://github.com/alexsilver8/open-palette/issues).

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request.

## License

[MIT](./LICENSE)
