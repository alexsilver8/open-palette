import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanApplications } from './scan';

function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'apps-'));
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, '..'), { recursive: true });
    if (path.endsWith('/')) mkdirSync(full, { recursive: true });
    else writeFileSync(full, content);
  }
  return root;
}

describe('scanApplications', () => {
  it('finds .app bundles on macOS, one folder deep, without duplicates', async () => {
    const a = tree({
      'Safari.app/Contents/Info.plist': '',
      'Utilities/Terminal.app/Contents/Info.plist': '',
      'Utilities/Nested/Deep.app/Contents/Info.plist': '',
      '.Hidden.app/x': '',
    });
    const b = tree({ 'Safari.app/x': '', 'Notes.app/x': '' });
    const apps = await scanApplications('darwin', [a, b, join(a, 'missing')]);
    expect(apps.map((app) => app.name)).toEqual(['Notes', 'Safari', 'Terminal']);
    expect(apps.find((app) => app.name === 'Safari')?.path).toBe(join(a, 'Safari.app'));
  });

  it('finds Start Menu shortcuts on Windows and skips uninstallers', async () => {
    const dir = tree({
      'Firefox.lnk': '',
      'Tools/Visual Studio Code.lnk': '',
      'Tools/Uninstall Tools.lnk': '',
      'notes.txt': '',
    });
    const apps = await scanApplications('win32', [dir]);
    expect(apps.map((app) => app.name)).toEqual(['Firefox', 'Visual Studio Code']);
  });

  it('reads visible desktop entries on Linux, letting earlier folders win', async () => {
    const user = tree({
      'applications/firefox.desktop': '[Desktop Entry]\nName=Firefox (mine)\nExec=firefox\nKeywords=web;',
    });
    const system = tree({
      'applications/firefox.desktop': '[Desktop Entry]\nName=Firefox\nExec=firefox',
      'applications/hidden.desktop': '[Desktop Entry]\nName=Hidden\nExec=x\nNoDisplay=true',
      'applications/kde/kate.desktop': '[Desktop Entry]\nName=Kate\nExec=kate',
    });
    const apps = await scanApplications('linux', [user, system]);
    expect(apps).toEqual([
      { name: 'Firefox (mine)', path: join(user, 'applications/firefox.desktop'), keywords: ['web'] },
      { name: 'Kate', path: join(system, 'applications/kde/kate.desktop') },
    ]);
  });
});
