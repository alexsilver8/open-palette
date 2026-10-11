/**
 * The code editors and terminals on this computer, and how to open a folder in each. Apps are
 * found where they install, not on PATH: an app started from the Dock or Start menu gets a
 * short PATH that rarely includes them.
 */
import { execFile, spawn } from 'node:child_process';
import { accessSync, constants, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';

/**
 * @typedef {object} Opener
 * @property {string} id
 * @property {string} name
 * @property {(dir: string) => Promise<void>} open
 */

/**
 * @param {string} file
 * @param {string[]} args
 * @param {{ cwd?: string }} [options]
 * @returns {Promise<void>}
 */
function launch(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { ...options, detached: true, stdio: 'ignore', windowsHide: false });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

/**
 * `open -a App folder` on macOS, which waits only until the app has the folder.
 * @param {string} app
 * @param {string} dir
 * @returns {Promise<void>}
 */
function openWithMacApp(app, dir) {
  return new Promise((resolve, reject) => {
    execFile('open', ['-a', app, dir], { timeout: 8000 }, (error) => (error ? reject(error) : resolve()));
  });
}

/** @param {string} name */
function macApp(name) {
  return [
    join('/Applications', `${name}.app`),
    join(homedir(), 'Applications', `${name}.app`),
    join('/System/Applications/Utilities', `${name}.app`),
  ].find((path) => existsSync(path));
}

/** @param {string} name */
function onPath(name) {
  const dirs = [
    ...(process.env.PATH ?? '').split(delimiter),
    '/usr/local/bin',
    '/snap/bin',
    join(homedir(), '.local/bin'),
  ];
  for (const dir of dirs) {
    if (!dir) continue;
    const file = join(dir, name);
    try {
      accessSync(file, constants.X_OK);
      return file;
    } catch {
      // Not here.
    }
  }
  return undefined;
}

/** @type {Array<[string, string]>} id, macOS app name */
const MAC_EDITORS = [
  ['vscode', 'Visual Studio Code'],
  ['cursor', 'Cursor'],
  ['windsurf', 'Windsurf'],
  ['zed', 'Zed'],
  ['sublime', 'Sublime Text'],
  ['nova', 'Nova'],
  ['webstorm', 'WebStorm'],
  ['idea', 'IntelliJ IDEA'],
  ['idea-ce', 'IntelliJ IDEA CE'],
  ['pycharm', 'PyCharm'],
  ['pycharm-ce', 'PyCharm CE'],
  ['xcode', 'Xcode'],
];

/** @type {Array<[string, string, string]>} id, name, command */
const LINUX_EDITORS = [
  ['vscode', 'Visual Studio Code', 'code'],
  ['cursor', 'Cursor', 'cursor'],
  ['windsurf', 'Windsurf', 'windsurf'],
  ['zed', 'Zed', 'zed'],
  ['sublime', 'Sublime Text', 'subl'],
  ['webstorm', 'WebStorm', 'webstorm'],
  ['idea', 'IntelliJ IDEA', 'idea'],
  ['pycharm', 'PyCharm', 'pycharm'],
];

/** @returns {Array<[string, string, string[]]>} id, name, places the program installs */
function windowsEditors() {
  const local = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local');
  const programs = process.env.ProgramFiles ?? 'C:\\Program Files';
  return [
    [
      'vscode',
      'Visual Studio Code',
      [join(local, 'Programs', 'Microsoft VS Code', 'Code.exe'), join(programs, 'Microsoft VS Code', 'Code.exe')],
    ],
    ['cursor', 'Cursor', [join(local, 'Programs', 'cursor', 'Cursor.exe')]],
    ['windsurf', 'Windsurf', [join(local, 'Programs', 'Windsurf', 'Windsurf.exe')]],
    ['zed', 'Zed', [join(local, 'Programs', 'Zed', 'Zed.exe')]],
    ['sublime', 'Sublime Text', [join(programs, 'Sublime Text', 'sublime_text.exe')]],
  ];
}

/**
 * Every editor installed here, in a sensible order.
 * @param {NodeJS.Platform} platform
 * @returns {Opener[]}
 */
export function findEditors(platform) {
  if (platform === 'darwin') {
    return MAC_EDITORS.flatMap(([id, name]) => {
      const app = macApp(name);
      return app ? [{ id, name, open: (/** @type {string} */ dir) => openWithMacApp(app, dir) }] : [];
    });
  }
  if (platform === 'win32') {
    return windowsEditors().flatMap(([id, name, places]) => {
      const exe = places.find((place) => existsSync(place));
      return exe ? [{ id, name, open: (/** @type {string} */ dir) => launch(exe, [dir]) }] : [];
    });
  }
  return LINUX_EDITORS.flatMap(([id, name, command]) => {
    const file = onPath(command);
    return file ? [{ id, name, open: (/** @type {string} */ dir) => launch(file, [dir]) }] : [];
  });
}

/**
 * The terminal to open a folder in.
 * @param {NodeJS.Platform} platform
 * @returns {Opener | undefined}
 */
export function findTerminal(platform) {
  if (platform === 'darwin') {
    for (const name of ['iTerm', 'Warp', 'Terminal']) {
      const app = macApp(name);
      if (app) return { id: name.toLowerCase(), name, open: (dir) => openWithMacApp(app, dir) };
    }
    return undefined;
  }
  if (platform === 'win32') {
    const local = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local');
    const wt = join(local, 'Microsoft', 'WindowsApps', 'wt.exe');
    if (existsSync(wt)) return { id: 'wt', name: 'Windows Terminal', open: (dir) => launch(wt, ['-d', dir]) };
    // `start` opens a new console window; it starts in the folder given as the working directory.
    return {
      id: 'cmd',
      name: 'Command Prompt',
      open: (dir) => launch('cmd.exe', ['/c', 'start', 'cmd.exe'], { cwd: dir }),
    };
  }
  /** @type {Array<[string, string, (dir: string) => string[]]>} */
  const terminals = [
    ['gnome-terminal', 'GNOME Terminal', (dir) => [`--working-directory=${dir}`]],
    ['konsole', 'Konsole', (dir) => ['--workdir', dir]],
    ['xfce4-terminal', 'Xfce Terminal', (dir) => [`--working-directory=${dir}`]],
    ['kitty', 'kitty', (dir) => ['--directory', dir]],
    ['alacritty', 'Alacritty', (dir) => ['--working-directory', dir]],
    ['x-terminal-emulator', 'Terminal', () => []],
  ];
  for (const [command, name, args] of terminals) {
    const file = onPath(command);
    if (file) return { id: command, name, open: (dir) => launch(file, args(dir), { cwd: dir }) };
  }
  return undefined;
}
