/**
 * Reading which programs are listening on TCP ports, from the tools each system has:
 * `lsof` (macOS, most Linux), `ss` (Linux without lsof) and `netstat` with `tasklist` (Windows).
 */

/**
 * One listening socket.
 * @typedef {object} Listener
 * @property {number} port
 * @property {string} address `*`, `0.0.0.0`, `::`, `127.0.0.1`, `::1`…
 * @property {number} [pid] Unknown when the process belongs to someone else.
 * @property {string} [process]
 * @property {string} [user]
 */

/**
 * A program listening on a port, on one or more addresses.
 * @typedef {object} Port
 * @property {number} port
 * @property {number} [pid]
 * @property {string} [process]
 * @property {string} [user]
 * @property {string[]} addresses
 * @property {string} [command] The full command line, when known.
 */

/**
 * `*:3000`, `127.0.0.1:5173`, `[::1]:5432`, `127.0.0.53%lo:53` → address and port.
 * @param {string} name
 * @returns {{ address: string, port: number } | undefined}
 */
export function splitHostPort(name) {
  const match = /^(.*):(\d+)$/.exec(name.trim());
  if (!match) return undefined;
  const port = Number(match[2]);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return undefined;
  const address = (match[1] ?? '').replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  return { address: address || '*', port };
}

/**
 * Output of `lsof -nP -iTCP -sTCP:LISTEN -F pcLn`: one field per line, `p` (process id)
 * starting each process, then its `c`ommand, `L`ogin and the `n`ame of each socket.
 * @param {string} output
 * @returns {Listener[]}
 */
export function parseLsof(output) {
  /** @type {Listener[]} */
  const listeners = [];
  /** @type {{ pid?: number, process?: string, user?: string }} */
  let current = {};
  for (const line of output.split(/\r?\n/)) {
    const value = line.slice(1);
    switch (line[0]) {
      case 'p':
        current = { pid: Number(value) };
        break;
      case 'c':
        current.process = value;
        break;
      case 'L':
        current.user = value;
        break;
      case 'n': {
        const socket = splitHostPort(value);
        if (socket) listeners.push({ ...socket, ...current });
        break;
      }
    }
  }
  return listeners;
}

/**
 * Output of `ss -Hltnp`: `LISTEN 0 511 *:3000 *:* users:(("node",pid=1234,fd=23))`. The
 * process is missing for sockets that belong to other users.
 * @param {string} output
 * @returns {Listener[]}
 */
export function parseSs(output) {
  /** @type {Listener[]} */
  const listeners = [];
  for (const line of output.split(/\r?\n/)) {
    const columns = line.trim().split(/\s+/);
    if (columns[0] !== 'LISTEN' || !columns[3]) continue;
    const socket = splitHostPort(columns[3]);
    if (!socket) continue;
    const owner = /users:\(\("((?:[^"\\]|\\.)*)",pid=(\d+)/.exec(line);
    listeners.push(owner ? { ...socket, process: owner[1], pid: Number(owner[2]) } : socket);
  }
  return listeners;
}

/**
 * Output of `netstat -ano` on Windows. The state column is translated into the system's
 * language, so a listening socket is told by its foreign address instead: `0.0.0.0:0` or `[::]:0`.
 * @param {string} output
 * @returns {Listener[]}
 */
export function parseNetstat(output) {
  /** @type {Listener[]} */
  const listeners = [];
  for (const line of output.split(/\r?\n/)) {
    const columns = line.trim().split(/\s+/);
    if (columns[0]?.toUpperCase() !== 'TCP' || columns.length < 5) continue;
    const [, local = '', foreign = ''] = columns;
    if (!/^(0\.0\.0\.0|\[::\]|\*):(0|\*)$/.test(foreign)) continue;
    const socket = splitHostPort(local);
    const pid = Number(columns[columns.length - 1]);
    if (socket) listeners.push({ ...socket, ...(Number.isInteger(pid) && pid > 0 ? { pid } : {}) });
  }
  return listeners;
}

/**
 * Output of `tasklist /FO CSV /NH`: `"node.exe","1234","Console","1","50,000 K"` → names by process id.
 * @param {string} output
 * @returns {Map<number, string>}
 */
export function parseTasklist(output) {
  /** @type {Map<number, string>} */
  const names = new Map();
  for (const line of output.split(/\r?\n/)) {
    const match = /^"([^"]*)","(\d+)"/.exec(line.trim());
    if (match?.[1] !== undefined && match[2] !== undefined)
      names.set(Number(match[2]), match[1].replace(/\.exe$/i, ''));
  }
  return names;
}

/**
 * Output of `ps -o pid=,args= -p …` → command lines by process id.
 * @param {string} output
 * @returns {Map<number, string>}
 */
export function parsePs(output) {
  /** @type {Map<number, string>} */
  const commands = new Map();
  for (const line of output.split(/\r?\n/)) {
    const match = /^\s*(\d+)\s+(.+)$/.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined) commands.set(Number(match[1]), match[2].trim());
  }
  return commands;
}

/**
 * One entry per program and port, with every address it listens on, in port order.
 * @param {Listener[]} listeners
 * @returns {Port[]}
 */
export function groupPorts(listeners) {
  /** @type {Map<string, Port>} */
  const ports = new Map();
  for (const listener of listeners) {
    const key = `${listener.port}:${listener.pid ?? '?'}`;
    const existing = ports.get(key);
    if (existing) {
      if (!existing.addresses.includes(listener.address)) existing.addresses.push(listener.address);
      existing.process ??= listener.process;
      existing.user ??= listener.user;
      continue;
    }
    const { address, ...rest } = listener;
    ports.set(key, { ...rest, addresses: [address] });
  }
  return [...ports.values()].sort((a, b) => a.port - b.port || (a.pid ?? 0) - (b.pid ?? 0));
}

const LOOPBACK = /^(127\.|::1$|localhost$)/;

/**
 * Whether other devices can reach the port, or only this computer.
 * @param {Port} port
 */
export function isLocalOnly(port) {
  return port.addresses.every((address) => LOOPBACK.test(address));
}

/**
 * Addresses in words: `*` and `0.0.0.0` are every network interface.
 * @param {string} address
 */
export function describeAddress(address) {
  if (address === '*' || address === '0.0.0.0' || address === '::') return `${address} (every interface)`;
  if (LOOPBACK.test(address)) return `${address} (this computer only)`;
  return address;
}
