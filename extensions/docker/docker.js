/**
 * Reading what `docker ps` and `docker images` print, and finding the docker program itself.
 */
import { accessSync, constants } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';

/**
 * Where docker installs. Apps opened from the Dock or Start menu get a short PATH that misses
 * most of these.
 * @param {NodeJS.Platform} platform
 * @param {string} home
 * @returns {string[]}
 */
export function dockerFolders(platform, home) {
  if (platform === 'win32') {
    const programs = process.env.ProgramFiles ?? 'C:\\Program Files';
    return [
      join(programs, 'Docker', 'Docker', 'resources', 'bin'),
      join(programs, 'Rancher Desktop', 'resources', 'resources', 'win32', 'bin'),
    ];
  }
  return [
    '/usr/local/bin',
    '/opt/homebrew/bin',
    '/usr/bin',
    '/Applications/Docker.app/Contents/Resources/bin',
    join(home, '.docker', 'bin'),
    join(home, '.orbstack', 'bin'),
    join(home, '.rd', 'bin'),
    '/home/linuxbrew/.linuxbrew/bin',
    '/snap/bin',
  ];
}

/**
 * The full path of the docker program, or undefined when it isn't installed.
 * @param {NodeJS.Platform} platform
 * @returns {string | undefined}
 */
export function findDocker(platform) {
  const file = platform === 'win32' ? 'docker.exe' : 'docker';
  const dirs = [...(process.env.PATH ?? '').split(delimiter), ...dockerFolders(platform, homedir())];
  for (const dir of dirs) {
    if (!dir) continue;
    try {
      accessSync(join(dir, file), platform === 'win32' ? constants.F_OK : constants.X_OK);
      return join(dir, file);
    } catch {
      // Not here.
    }
  }
  return undefined;
}

/**
 * What went wrong, in words, from docker's error output.
 * @param {string} text
 * @returns {'not-running' | undefined}
 */
export function problemOf(text) {
  return /cannot connect to the docker daemon|failed to connect to the docker api|error during connect|daemon (is )?running|docker desktop is (not running|starting)|pipe\/docker_engine/i.test(
    text,
  )
    ? 'not-running'
    : undefined;
}

/**
 * @param {string} output One JSON object per line, as `--format '{{json .}}'` prints.
 * @returns {Array<Record<string, unknown>>}
 */
export function parseJsonLines(output) {
  /** @type {Array<Record<string, unknown>>} */
  const rows = [];
  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (row && typeof row === 'object' && !Array.isArray(row)) rows.push(row);
    } catch {
      // Not JSON; skip it.
    }
  }
  return rows;
}

/** @param {unknown} value */
const text = (value) =>
  typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value);

/**
 * @typedef {object} Port
 * @property {number} host
 * @property {number} container
 * @property {string} protocol
 */

/**
 * The ports published on this computer: `0.0.0.0:8080->80/tcp, :::8080->80/tcp, 5432/tcp`
 * → 8080 → 80. Ports that are only exposed inside docker are left out.
 * @param {string} ports
 * @returns {Port[]}
 */
export function parsePorts(ports) {
  /** @type {Map<string, Port>} */
  const found = new Map();
  for (const part of ports.split(',')) {
    const match = /:(\d+)(?:-(\d+))?->(\d+)(?:-\d+)?\/(\w+)/.exec(part.trim());
    if (!match) continue;
    const host = Number(match[1]);
    const container = Number(match[3]);
    const protocol = match[4] ?? 'tcp';
    const key = `${host}/${protocol}`;
    if (!found.has(key)) found.set(key, { host, container, protocol });
  }
  return [...found.values()];
}

/**
 * @param {string} labels `a=b,c=d` as docker prints them
 * @param {string} name
 */
function label(labels, name) {
  const match = new RegExp(`(?:^|,)${name.replace(/\./g, '\\.')}=([^,]*)`).exec(labels);
  return match?.[1] || undefined;
}

/**
 * @typedef {object} Container
 * @property {string} id
 * @property {string} name
 * @property {string} image
 * @property {string} state running, exited, paused, created, restarting or dead
 * @property {string} status e.g. "Up 2 hours" or "Exited (0) 3 days ago"
 * @property {Port[]} ports
 * @property {string} command
 * @property {string} created
 * @property {string} [project] Its Compose project.
 * @property {string} [service] Its Compose service.
 */

/**
 * @param {Record<string, unknown>} row One line of `docker ps -a --format '{{json .}}'`.
 * @returns {Container | undefined}
 */
export function toContainer(row) {
  const id = text(row.ID);
  if (!/^[0-9a-f]{12,64}$/.test(id)) return undefined;
  const labels = text(row.Labels);
  const status = text(row.Status);
  const project = label(labels, 'com.docker.compose.project');
  const service = label(labels, 'com.docker.compose.service');
  return {
    id,
    name: text(row.Names).split(',')[0] || id.slice(0, 12),
    image: text(row.Image),
    // Older docker versions have no State column; the status says it.
    state:
      text(row.State).toLowerCase() ||
      (/^up\b/i.test(status) ? (/paused/i.test(status) ? 'paused' : 'running') : 'exited'),
    status,
    ports: parsePorts(text(row.Ports)),
    command: text(row.Command).replace(/^"|"$/g, ''),
    created: text(row.RunningFor) || text(row.CreatedAt),
    ...(project ? { project } : {}),
    ...(service ? { service } : {}),
  };
}

/**
 * @typedef {object} Image
 * @property {string} id
 * @property {string} repository "<none>" for dangling images
 * @property {string} tag
 * @property {string} size
 * @property {string} created
 */

/**
 * @param {Record<string, unknown>} row One line of `docker images --format '{{json .}}'`.
 * @returns {Image | undefined}
 */
export function toImage(row) {
  const id = text(row.ID).replace(/^sha256:/, '');
  if (!/^[0-9a-f]{12,64}$/.test(id)) return undefined;
  return {
    id,
    repository: text(row.Repository) || '<none>',
    tag: text(row.Tag) || '<none>',
    size: text(row.Size),
    created: text(row.CreatedSince) || text(row.CreatedAt),
  };
}

/**
 * `postgres:16` and the like; dangling images are named by their ID.
 * @param {Image} image
 */
export function imageName(image) {
  if (image.repository === '<none>') return image.id.slice(0, 12);
  return image.tag === '<none>' ? image.repository : `${image.repository}:${image.tag}`;
}

/**
 * The image's page on Docker Hub, when it comes from there.
 * @param {string} repository
 * @returns {string | undefined}
 */
export function hubUrl(repository) {
  if (repository === '<none>') return undefined;
  const parts = repository.split('/');
  // A first part with a dot or a port, or "localhost", is another registry.
  if (parts.length > 1 && /[.:]|^localhost$/.test(parts[0] ?? '')) return undefined;
  if (parts.length === 1) return `https://hub.docker.com/_/${parts[0]}`;
  if (parts[0] === 'library' && parts.length === 2) return `https://hub.docker.com/_/${parts[1]}`;
  return `https://hub.docker.com/r/${parts.join('/')}`;
}

/** Running first, then by name. @param {Container[]} containers */
export function sortContainers(containers) {
  const order = (/** @type {string} */ state) =>
    state === 'running' || state === 'restarting' ? 0 : state === 'paused' ? 1 : 2;
  return [...containers].sort((a, b) => order(a.state) - order(b.state) || a.name.localeCompare(b.name));
}
