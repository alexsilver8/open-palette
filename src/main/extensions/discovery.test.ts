import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { discoverExtensions } from './discovery';

const manifest = (name: string) => ({
  name,
  waypoint: { title: name, commands: [{ name: 'cmd', title: 'Cmd', mode: 'view' }] },
});

function folder(files: Record<string, unknown>): string {
  const root = mkdtempSync(join(tmpdir(), 'ext-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), typeof content === 'string' ? content : JSON.stringify(content));
  }
  return root;
}

describe('discoverExtensions', () => {
  it('finds extensions in a folder of extensions and reports broken ones', () => {
    const root = folder({
      'alpha/package.json': manifest('alpha'),
      'beta/package.json': '{ not json',
      'gamma/package.json': { name: 'gamma' }, // a plain npm package, not an extension
      'delta/readme.md': 'no package.json',
    });
    const found = discoverExtensions([root]);
    expect(found.map((e) => e.parsed?.manifest.name ?? 'error')).toEqual(['alpha', 'error']);
    expect(found[1]?.error).toBeTruthy();
  });

  it('accepts a single extension folder as a root and ignores duplicates and missing roots', () => {
    const root = folder({ 'package.json': manifest('solo') });
    const found = discoverExtensions([root, root, join(root, 'missing')]);
    expect(found).toHaveLength(1);
    expect(found[0]?.parsed?.manifest.name).toBe('solo');
  });
});
