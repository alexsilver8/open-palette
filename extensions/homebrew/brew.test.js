import { describe, expect, it } from 'vitest';
import { brewCommand, isPackageName, pageUrl, parseInstalled, parseNames, searchNames } from './brew.js';

const INFO = JSON.stringify({
  formulae: [
    {
      name: 'node',
      full_name: 'node',
      desc: 'Open-source, cross-platform JavaScript runtime environment',
      homepage: 'https://nodejs.org/',
      installed: [{ version: '24.1.0', installed_on_request: true }],
      outdated: true,
      pinned: false,
      versions: { stable: '24.2.0' },
    },
    {
      name: 'libuv',
      full_name: 'libuv',
      desc: 'Multi-platform support library with a focus on asynchronous I/O',
      installed: [{ version: '1.51.0', installed_on_request: false }],
      outdated: false,
      pinned: false,
      versions: { stable: '1.51.0' },
    },
    {
      name: 'mongodb-community',
      full_name: 'mongodb/brew/mongodb-community',
      installed: [{ version: '8.0.4', installed_on_request: true }],
      outdated: false,
      pinned: true,
      versions: { stable: '8.0.4' },
    },
  ],
  casks: [
    {
      token: 'visual-studio-code',
      full_token: 'visual-studio-code',
      name: ['Microsoft Visual Studio Code', 'VS Code'],
      desc: 'Open-source code editor',
      homepage: 'https://code.visualstudio.com/',
      installed: '1.101.0',
      version: '1.101.1',
      outdated: true,
    },
  ],
});

describe('parseInstalled', () => {
  it('reads formulae and casks, with what they are and whether they need upgrading', () => {
    const packages = parseInstalled(INFO);
    expect(packages.map((pkg) => pkg.name)).toEqual([
      'libuv',
      'mongodb/brew/mongodb-community',
      'node',
      'visual-studio-code',
    ]);
    expect(packages.find((pkg) => pkg.name === 'node')).toEqual({
      name: 'node',
      kind: 'formula',
      desc: 'Open-source, cross-platform JavaScript runtime environment',
      homepage: 'https://nodejs.org/',
      version: '24.1.0',
      latest: '24.2.0',
      outdated: true,
      onRequest: true,
      pinned: false,
    });
    expect(packages.find((pkg) => pkg.name === 'libuv')?.onRequest).toBe(false);
    expect(packages.find((pkg) => pkg.name.startsWith('mongodb'))?.pinned).toBe(true);
    expect(packages.find((pkg) => pkg.kind === 'cask')).toMatchObject({
      name: 'visual-studio-code',
      title: 'Microsoft Visual Studio Code',
      version: '1.101.0',
      latest: '1.101.1',
      outdated: true,
    });
  });
});

describe('parseNames + searchNames', () => {
  const names = [
    ...parseNames('node\nnode@20\nnodenv\nlibnode\nnot a name!\n\n').map((name) => ({
      name,
      kind: /** @type {const} */ ('formula'),
    })),
    { name: 'node', kind: /** @type {const} */ ('cask') },
    { name: 'python@3.12', kind: /** @type {const} */ ('formula') },
  ];

  it('drops lines that are not package names', () => {
    expect(parseNames('node\nnot a name!\n')).toEqual(['node']);
  });

  it('ranks exact names, then prefixes, then the rest', () => {
    expect(searchNames(names, 'node', 10).map((entry) => `${entry.kind}:${entry.name}`)).toEqual([
      'formula:node',
      'cask:node',
      'formula:nodenv',
      'formula:node@20',
      'formula:libnode',
    ]);
    expect(searchNames(names, 'node', 2)).toHaveLength(2);
    expect(searchNames(names, 'pyth 3', 10).map((entry) => entry.name)).toEqual(['python@3.12']);
    expect(searchNames(names, '  ', 10)).toEqual([]);
  });
});

describe('isPackageName', () => {
  it('accepts formula, tap and cask names and nothing a shell would read differently', () => {
    for (const name of [
      'node',
      'node@20',
      'gst-plugins-base',
      'c++utilities',
      'mongodb/brew/mongodb-community',
      'visual-studio-code',
    ]) {
      expect(isPackageName(name)).toBe(true);
    }
    for (const name of ['', 'node; rm -rf ~', '$(whoami)', 'a b', '-rf', '../x', 'a"b', 42]) {
      expect(isPackageName(name)).toBe(false);
    }
  });
});

describe('commands and pages', () => {
  it('builds the brew command and the formulae.brew.sh page', () => {
    expect(brewCommand('install', 'wget', 'formula')).toBe('brew install wget');
    expect(brewCommand('uninstall', 'firefox', 'cask')).toBe('brew uninstall --cask firefox');
    expect(brewCommand('upgrade')).toBe('brew upgrade');
    expect(pageUrl('node@20', 'formula')).toBe('https://formulae.brew.sh/formula/node%4020');
    expect(pageUrl('firefox', 'cask')).toBe('https://formulae.brew.sh/cask/firefox');
    expect(pageUrl('mongodb/brew/mongodb-community', 'formula')).toBeUndefined();
  });
});
