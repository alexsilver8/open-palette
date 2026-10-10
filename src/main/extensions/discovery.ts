import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { type ParsedExtension, parseExtensionPackage } from './validate';

export interface DiscoveredExtension {
  dir: string;
  parsed?: ParsedExtension;
  error?: string;
}

function isExtensionFolder(dir: string): boolean {
  const pkgPath = join(dir, 'package.json');
  if (!existsSync(pkgPath)) return false;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>;
    return typeof pkg === 'object' && pkg !== null && 'openPalette' in pkg;
  } catch {
    return true; // Broken package.json: report it rather than silently skipping.
  }
}

function readExtension(dir: string): DiscoveredExtension {
  try {
    const pkg: unknown = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    return { dir, parsed: parseExtensionPackage(pkg, dir) };
  } catch (error) {
    return { dir, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Each root is either an extension folder itself or a folder of extension folders
 * (like the user's extensions folder).
 */
export function discoverExtensions(roots: string[]): DiscoveredExtension[] {
  const found: DiscoveredExtension[] = [];
  const seen = new Set<string>();
  const add = (dir: string) => {
    const full = resolve(dir);
    if (seen.has(full)) return;
    seen.add(full);
    found.push(readExtension(full));
  };

  for (const root of roots) {
    if (!existsSync(root)) continue;
    if (isExtensionFolder(root)) {
      add(root);
      continue;
    }
    let entries: string[];
    try {
      entries = readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
        .map((entry) => join(root, entry.name));
    } catch {
      continue;
    }
    for (const dir of entries.sort()) {
      if (isExtensionFolder(dir)) add(dir);
    }
  }
  return found;
}
