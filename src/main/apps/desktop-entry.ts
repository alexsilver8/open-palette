/** Parsing for Linux `.desktop` files (freedesktop.org Desktop Entry spec). */

export interface DesktopEntry {
  name: string;
  exec?: string;
  icon?: string;
  keywords: string[];
  /** Whether the entry should be listed as a launchable application. */
  visible: boolean;
}

/** Reads the `[Desktop Entry]` group. Returns `null` if the file has none or no name. */
export function parseDesktopEntry(source: string): DesktopEntry | null {
  const fields = new Map<string, string>();
  let inEntry = false;
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('[')) {
      inEntry = line === '[Desktop Entry]';
      continue;
    }
    if (!inEntry) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!fields.has(key)) fields.set(key, line.slice(eq + 1).trim());
  }

  const name = fields.get('Name');
  if (!name) return null;
  const split = (value: string | undefined) =>
    (value ?? '')
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
  const keywords = [...split(fields.get('Keywords')), ...split(fields.get('GenericName'))];
  const type = fields.get('Type') ?? 'Application';
  const visible =
    type === 'Application' &&
    fields.get('NoDisplay') !== 'true' &&
    fields.get('Hidden') !== 'true' &&
    Boolean(fields.get('Exec'));

  const entry: DesktopEntry = { name, keywords, visible };
  const exec = fields.get('Exec');
  const icon = fields.get('Icon');
  if (exec) entry.exec = exec;
  if (icon) entry.icon = icon;
  return entry;
}

/**
 * Turns an `Exec` value into argv: removes field codes (%f, %U, …) and handles quoting.
 * Used when `gio` isn't available to launch the entry for us.
 */
export function execToArgv(exec: string): string[] {
  const argv: string[] = [];
  let current = '';
  let quoted = false;
  let hasToken = false;
  for (let i = 0; i < exec.length; i++) {
    const ch = exec[i] as string;
    if (quoted) {
      if (ch === '\\' && i + 1 < exec.length) {
        current += exec[++i];
      } else if (ch === '"') {
        quoted = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      quoted = true;
      hasToken = true;
    } else if (/\s/.test(ch)) {
      if (hasToken) argv.push(current);
      current = '';
      hasToken = false;
    } else {
      current += ch;
      hasToken = true;
    }
  }
  if (hasToken) argv.push(current);
  return argv.filter((arg) => !/^%[a-zA-Z]$/.test(arg)).map((arg) => arg.replace(/%%/g, '%').replace(/%[a-zA-Z]/g, ''));
}
