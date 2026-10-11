import { describe, expect, it } from 'vitest';
import {
  describeAddress,
  groupPorts,
  isLocalOnly,
  parseLsof,
  parseNetstat,
  parsePs,
  parseSs,
  parseTasklist,
  splitHostPort,
} from './ports.js';

describe('splitHostPort', () => {
  it('reads every address form', () => {
    expect(splitHostPort('*:3000')).toEqual({ address: '*', port: 3000 });
    expect(splitHostPort('127.0.0.1:5173')).toEqual({ address: '127.0.0.1', port: 5173 });
    expect(splitHostPort('[::1]:5432')).toEqual({ address: '::1', port: 5432 });
    expect(splitHostPort('127.0.0.53%lo:53')).toEqual({ address: '127.0.0.53', port: 53 });
    expect(splitHostPort('[::]:*')).toBeUndefined();
    expect(splitHostPort('*:0')).toBeUndefined();
  });
});

describe('parseLsof', () => {
  it('reads processes and their sockets', () => {
    const output = [
      'p501',
      'cnode',
      'Lalex',
      'f23',
      'n*:3000',
      'f24',
      'n[::1]:3000',
      'p88',
      'cpostgres',
      'Lpostgres',
      'f5',
      'n127.0.0.1:5432',
      '',
    ].join('\n');
    expect(parseLsof(output)).toEqual([
      { address: '*', port: 3000, pid: 501, process: 'node', user: 'alex' },
      { address: '::1', port: 3000, pid: 501, process: 'node', user: 'alex' },
      { address: '127.0.0.1', port: 5432, pid: 88, process: 'postgres', user: 'postgres' },
    ]);
  });
});

describe('parseSs', () => {
  it('reads sockets, with the process when it is yours', () => {
    const output = [
      'LISTEN 0      511          *:3000         *:*    users:(("node",pid=1234,fd=23))',
      'LISTEN 0      4096   127.0.0.53%lo:53     0.0.0.0:*',
      'ESTAB  0      0      10.0.0.2:22        10.0.0.9:51000',
    ].join('\n');
    expect(parseSs(output)).toEqual([
      { address: '*', port: 3000, process: 'node', pid: 1234 },
      { address: '127.0.0.53', port: 53 },
    ]);
  });
});

describe('parseNetstat', () => {
  it('finds listening sockets by their foreign address, in any language', () => {
    const output = [
      'Aktive Verbindungen',
      '  Proto  Lokale Adresse         Remoteadresse          Status           PID',
      '  TCP    0.0.0.0:135            0.0.0.0:0              ABHÖREN          1012',
      '  TCP    127.0.0.1:3000         0.0.0.0:0              LISTENING        4321',
      '  TCP    192.168.1.5:50123      140.82.112.4:443       HERGESTELLT      777',
      '  TCP    [::]:445               [::]:0                 LISTENING        4',
      '  UDP    0.0.0.0:5353           *:*                                     2200',
    ].join('\r\n');
    expect(parseNetstat(output)).toEqual([
      { address: '0.0.0.0', port: 135, pid: 1012 },
      { address: '127.0.0.1', port: 3000, pid: 4321 },
      { address: '::', port: 445, pid: 4 },
    ]);
  });

  it('names processes from tasklist', () => {
    const names = parseTasklist('"System","4","Services","0","148 K"\r\n"node.exe","4321","Console","1","50,000 K"');
    expect(names.get(4321)).toBe('node');
    expect(names.get(4)).toBe('System');
  });
});

describe('parsePs', () => {
  it('reads command lines', () => {
    expect(
      parsePs(
        '  501 node /Users/alex/app/server.js --port 3000\n   88 /usr/lib/postgresql/16/bin/postgres -D /var/lib\n',
      ),
    ).toEqual(
      new Map([
        [501, 'node /Users/alex/app/server.js --port 3000'],
        [88, '/usr/lib/postgresql/16/bin/postgres -D /var/lib'],
      ]),
    );
  });
});

describe('groupPorts', () => {
  it('lists each program once per port, with all its addresses', () => {
    const ports = groupPorts([
      { address: '127.0.0.1', port: 5432, pid: 88, process: 'postgres' },
      { address: '*', port: 3000, pid: 501, process: 'node' },
      { address: '::1', port: 3000, pid: 501, process: 'node' },
    ]);
    expect(ports).toEqual([
      { port: 3000, pid: 501, process: 'node', addresses: ['*', '::1'] },
      { port: 5432, pid: 88, process: 'postgres', addresses: ['127.0.0.1'] },
    ]);
    expect(ports.map(isLocalOnly)).toEqual([false, true]);
  });

  it('describes addresses', () => {
    expect(describeAddress('*')).toBe('* (every interface)');
    expect(describeAddress('::1')).toBe('::1 (this computer only)');
    expect(describeAddress('192.168.1.5')).toBe('192.168.1.5');
  });
});
