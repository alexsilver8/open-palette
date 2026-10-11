import { describe, expect, it } from 'vitest';
import {
  hubUrl,
  imageName,
  parseJsonLines,
  parsePorts,
  problemOf,
  sortContainers,
  toContainer,
  toImage,
} from './docker.js';

const PS = [
  '{"Command":"\\"docker-entrypoint.sh postgres\\"","CreatedAt":"2026-10-11 13:53:04 +0000 UTC","ID":"719bbee8760ec32c15c57e1bce76ab53acc31b2207546638d67d2838758ed88f","Image":"postgres:16","Labels":"com.docker.compose.project=shop,com.docker.compose.service=db","Names":"shop-db-1","Ports":"0.0.0.0:5432->5432/tcp, :::5432->5432/tcp","RunningFor":"2 hours ago","State":"running","Status":"Up 2 hours"}',
  '{"Command":"\\"echo done\\"","ID":"4cb3722952e3ea88b9b5237dc4238a47d17bb6214aa801efcee275ff57113aec","Image":"alpine:3.20","Labels":"","Names":"job","Ports":"","RunningFor":"3 days ago","State":"exited","Status":"Exited (0) 3 days ago"}',
  'WARNING: not json',
  '',
].join('\n');

describe('parseJsonLines + toContainer', () => {
  it('reads each container', () => {
    const [db, job] = parseJsonLines(PS).flatMap((row) => toContainer(row) ?? []);
    expect(db).toEqual({
      id: '719bbee8760ec32c15c57e1bce76ab53acc31b2207546638d67d2838758ed88f',
      name: 'shop-db-1',
      image: 'postgres:16',
      state: 'running',
      status: 'Up 2 hours',
      ports: [{ host: 5432, container: 5432, protocol: 'tcp' }],
      command: 'docker-entrypoint.sh postgres',
      created: '2 hours ago',
      project: 'shop',
      service: 'db',
    });
    expect(job).toMatchObject({ name: 'job', state: 'exited', ports: [] });
    expect(job).not.toHaveProperty('project');
  });

  it('works out the state on docker versions without a State column', () => {
    expect(toContainer({ ID: 'abcdef123456', Names: 'x', Status: 'Up 5 minutes (Paused)' })?.state).toBe('paused');
    expect(toContainer({ ID: 'abcdef123456', Names: 'x', Status: 'Exited (1) 2 days ago' })?.state).toBe('exited');
    expect(toContainer({ ID: 'not an id' })).toBeUndefined();
  });
});

describe('parsePorts', () => {
  it('lists the ports published on this computer once each', () => {
    expect(parsePorts('0.0.0.0:8080->80/tcp, :::8080->80/tcp, 127.0.0.1:5353->53/udp, 9000/tcp')).toEqual([
      { host: 8080, container: 80, protocol: 'tcp' },
      { host: 5353, container: 53, protocol: 'udp' },
    ]);
    expect(parsePorts('0.0.0.0:8000-8002->8000-8002/tcp')).toEqual([{ host: 8000, container: 8000, protocol: 'tcp' }]);
    expect(parsePorts('')).toEqual([]);
  });
});

describe('sortContainers', () => {
  it('puts running ones first, then by name', () => {
    const make = (/** @type {string} */ name, /** @type {string} */ state) =>
      /** @type {import('./docker.js').Container} */ ({
        id: '',
        name,
        image: '',
        state,
        status: '',
        ports: [],
        command: '',
        created: '',
      });
    const sorted = sortContainers([
      make('b', 'exited'),
      make('z', 'running'),
      make('a', 'exited'),
      make('m', 'paused'),
    ]);
    expect(sorted.map((c) => c.name)).toEqual(['z', 'm', 'a', 'b']);
  });
});

describe('images', () => {
  it('reads images and names them', () => {
    const image = toImage({
      ID: 'sha256:bf8527eb54c3680e728d5b4b383a8ba730d72dae7236fbc8dff97ed6b224a731',
      Repository: 'alpine',
      Tag: '3.20',
      Size: '7.8MB',
      CreatedSince: '5 months ago',
    });
    expect(image).toEqual({
      id: 'bf8527eb54c3680e728d5b4b383a8ba730d72dae7236fbc8dff97ed6b224a731',
      repository: 'alpine',
      tag: '3.20',
      size: '7.8MB',
      created: '5 months ago',
    });
    expect(image && imageName(image)).toBe('alpine:3.20');
    const dangling = toImage({ ID: 'sha256:0123456789abcdef', Repository: '<none>', Tag: '<none>' });
    expect(dangling && imageName(dangling)).toBe('0123456789ab');
  });

  it('links images from Docker Hub only', () => {
    expect(hubUrl('postgres')).toBe('https://hub.docker.com/_/postgres');
    expect(hubUrl('library/redis')).toBe('https://hub.docker.com/_/redis');
    expect(hubUrl('grafana/grafana')).toBe('https://hub.docker.com/r/grafana/grafana');
    expect(hubUrl('ghcr.io/alex/app')).toBeUndefined();
    expect(hubUrl('localhost:5000/app')).toBeUndefined();
    expect(hubUrl('<none>')).toBeUndefined();
  });
});

describe('problemOf', () => {
  it("recognises docker not running, in each docker's words", () => {
    expect(
      problemOf('Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?'),
    ).toBe('not-running');
    expect(
      problemOf(
        'failed to connect to the docker API at unix:///var/run/docker.sock; check if the path is correct and if the daemon is running',
      ),
    ).toBe('not-running');
    expect(problemOf('error during connect: open //./pipe/docker_engine: The system cannot find the file')).toBe(
      'not-running',
    );
    expect(problemOf('Error response from daemon: No such container: x')).toBeUndefined();
  });
});
