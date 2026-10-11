import { describe, expect, it } from 'vitest';
import {
  formatTime,
  macControlArgs,
  parseBusNames,
  parseMacStatus,
  parseMprisGvariant,
  parsePlayerctl,
  parseWindowsSessions,
  prettyLinuxName,
  prettyWindowsName,
  sortPlayers,
  windowsMediaKeyScript,
  windowsSessionsScript,
} from './media.js';

describe('macOS', () => {
  it('reads Spotify and Music', () => {
    const players = parseMacStatus(
      JSON.stringify([
        {
          app: 'Spotify',
          state: 'paused',
          title: 'Dreams',
          artist: 'Fleetwood Mac',
          album: 'Rumours',
          duration: 257.8,
          position: 12.5,
        },
        { app: 'Music', state: 'stopped' },
        { app: 'Evil', state: 'playing' },
      ]),
    );
    expect(players).toEqual([
      {
        id: 'Spotify',
        app: 'Spotify',
        state: 'paused',
        title: 'Dreams',
        artist: 'Fleetwood Mac',
        album: 'Rumours',
        duration: 257.8,
        position: 12.5,
      },
      {
        id: 'Music',
        app: 'Music',
        state: 'stopped',
        title: undefined,
        artist: undefined,
        album: undefined,
        duration: undefined,
        position: undefined,
      },
    ]);
    expect(parseMacStatus('')).toEqual([]);
  });

  it('only scripts the apps it knows', () => {
    expect(macControlArgs('Music', 'next').slice(-2)).toEqual(['Music', 'nextTrack']);
    expect(() => macControlArgs('Terminal', 'next')).toThrow();
  });
});

describe('Linux', () => {
  it('reads playerctl', () => {
    const output =
      'spotify\tspotify\tPlaying\tDreams\tFleetwood Mac\tRumours\t257000000\t12000000\nfirefox.instance_1_23\tfirefox\tPaused\tA video\t\t\t\t\n';
    expect(parsePlayerctl(output)).toEqual([
      {
        id: 'spotify',
        app: 'Spotify',
        state: 'playing',
        title: 'Dreams',
        artist: 'Fleetwood Mac',
        album: 'Rumours',
        duration: 257,
        position: 12,
      },
      {
        id: 'firefox.instance_1_23',
        app: 'Firefox',
        state: 'paused',
        title: 'A video',
        artist: undefined,
        album: undefined,
        duration: undefined,
        position: undefined,
      },
    ]);
  });

  it('reads MPRIS through gdbus, quotes and all', () => {
    expect(parseBusNames("(['org.freedesktop.DBus', ':1.3', 'org.mpris.MediaPlayer2.tunes', ':1.0'],)")).toEqual([
      'org.mpris.MediaPlayer2.tunes',
    ]);
    const metadata = `(<{'mpris:trackid': <objectpath '/org/mpris/MediaPlayer2/Track/0'>, 'xesam:title': <"Don't Stop">, 'xesam:artist': <['Fleetwood Mac', "Lindsey's Band"]>, 'xesam:album': <'Rumours'>, 'mpris:length': <int64 193000000>}>,)`;
    expect(parseMprisGvariant('org.mpris.MediaPlayer2.tunes', "(<'Playing'>,)", metadata)).toEqual({
      id: 'org.mpris.MediaPlayer2.tunes',
      app: 'Tunes',
      state: 'playing',
      title: "Don't Stop",
      artist: "Fleetwood Mac, Lindsey's Band",
      album: 'Rumours',
      duration: 193,
    });
    expect(parseMprisGvariant('org.mpris.MediaPlayer2.vlc', '', '').state).toBe('stopped');
  });

  it('names players', () => {
    expect(prettyLinuxName('org.mpris.MediaPlayer2.chromium.instance1234')).toBe('Chromium');
    expect(prettyLinuxName('vlc')).toBe('VLC');
  });
});

describe('Windows', () => {
  it('reads the media sessions, one or many', () => {
    expect(
      parseWindowsSessions(
        '{"app":"Spotify.exe","state":"Playing","title":"Dreams","artist":"Fleetwood Mac","album":"","duration":257.5,"position":0}',
      ),
    ).toEqual([
      {
        id: 'Spotify.exe',
        app: 'Spotify',
        state: 'playing',
        title: 'Dreams',
        artist: 'Fleetwood Mac',
        album: undefined,
        duration: 257.5,
        position: undefined,
      },
    ]);
    expect(parseWindowsSessions('[]')).toEqual([]);
    expect(prettyWindowsName('Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic')).toBe('Media Player');
    expect(prettyWindowsName('MSEdge')).toBe('Microsoft Edge');
  });

  it('keeps an app ID from breaking out of its quotes', () => {
    const app = 'x’; Remove-Item C:\\ ; ’';
    const script = windowsSessionsScript({ app, action: 'next' });
    expect(script).not.toContain('Remove-Item');
    expect(script).toContain(Buffer.from(app, 'utf8').toString('base64'));
    expect(script).toContain('TrySkipNextAsync');
    expect(windowsMediaKeyScript('play-pause')).toContain('[char]179');
  });
});

describe('players', () => {
  it('lists what’s playing first', () => {
    const players = sortPlayers([
      { id: 'a', app: 'A', state: 'stopped' },
      { id: 'b', app: 'B', state: 'paused' },
      { id: 'c', app: 'C', state: 'playing' },
    ]);
    expect(players.map((p) => p.id)).toEqual(['c', 'b', 'a']);
  });

  it('formats times', () => {
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(3723)).toBe('1:02:03');
    expect(formatTime(undefined)).toBeUndefined();
  });
});
