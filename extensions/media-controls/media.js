// What's playing, and how to control it, on each system. Kept free of side effects (it only
// builds scripts and reads their output) so it can be tested anywhere.

/**
 * @typedef {'playing' | 'paused' | 'stopped'} PlayerState
 * @typedef {'play-pause' | 'next' | 'previous'} MediaAction
 * @typedef {object} Player
 * @property {string} id What to hand back to control this player: an app, an MPRIS bus name, a Windows app ID.
 * @property {string} app The app's name, for showing.
 * @property {PlayerState} state
 * @property {string} [title]
 * @property {string} [artist]
 * @property {string} [album]
 * @property {number} [duration] Seconds.
 * @property {number} [position] Seconds.
 */

/** @param {unknown} value */
function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** @param {unknown} value */
function seconds(value) {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined;
}

/** @param {unknown} value @returns {PlayerState} */
export function toState(value) {
  const state = String(value ?? '').toLowerCase();
  if (state === 'playing' || state === 'kpsplaying') return 'playing';
  if (state === 'paused' || state === 'kpspaused') return 'paused';
  return 'stopped';
}

/**
 * Players first if they're playing, then paused ones.
 * @param {Player[]} players
 */
export function sortPlayers(players) {
  /** @type {Record<PlayerState, number>} */
  const order = { playing: 0, paused: 1, stopped: 2 };
  return [...players].sort((a, b) => order[a.state] - order[b.state]);
}

/**
 * "1:05" or "1:02:03".
 * @param {number | undefined} total
 */
export function formatTime(total) {
  if (total === undefined || !Number.isFinite(total)) return undefined;
  const s = Math.floor(total % 60);
  const m = Math.floor((total / 60) % 60);
  const h = Math.floor(total / 3600);
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// ── macOS ────────────────────────────────────────────────────────────────────

/** The apps macOS lets other apps script for what's playing. */
export const MAC_PLAYERS = ['Spotify', 'Music'];

/**
 * Lists the Spotify and Music apps that are open, with their track. Checking `running()`
 * first means a closed app isn't opened just to ask.
 */
export const MAC_STATUS_SCRIPT = `const players = [];
for (const name of ${JSON.stringify(MAC_PLAYERS)}) {
  let app;
  try {
    app = Application(name);
    if (!app.running()) continue;
  } catch (error) {
    continue;
  }
  const player = { app: name, state: 'stopped' };
  try { player.state = String(app.playerState()); } catch (error) {}
  try {
    const track = app.currentTrack();
    player.title = track.name();
    player.artist = track.artist();
    player.album = track.album();
    const duration = track.duration();
    // Spotify counts in milliseconds, Music in seconds.
    player.duration = name === 'Spotify' ? duration / 1000 : duration;
    player.position = app.playerPosition();
  } catch (error) {}
  players.push(player);
}
JSON.stringify(players);`;

/** @param {string} output @returns {Player[]} */
export function parseMacStatus(output) {
  const rows = /** @type {Array<Record<string, unknown>>} */ (JSON.parse(output.trim() || '[]'));
  return rows.flatMap((row) => {
    const app = text(row.app);
    if (!app || !MAC_PLAYERS.includes(app)) return [];
    return [
      {
        id: app,
        app,
        state: toState(row.state),
        title: text(row.title),
        artist: text(row.artist),
        album: text(row.album),
        duration: seconds(row.duration),
        position: seconds(row.position),
      },
    ];
  });
}

/** @type {Record<MediaAction, string>} */
const MAC_VERBS = { 'play-pause': 'playpause', next: 'nextTrack', previous: 'previousTrack' };

/** Tells one app to play, pause or skip; the app and the action come as arguments. */
export const MAC_CONTROL_SCRIPT = `function run(argv) {
  const app = Application(argv[0]);
  app[argv[1]]();
}`;

/**
 * @param {string} app
 * @param {MediaAction} action
 * @returns {string[]}
 */
export function macControlArgs(app, action) {
  if (!MAC_PLAYERS.includes(app)) throw new Error(`Can't control ${app}.`);
  return ['-l', 'JavaScript', '-e', MAC_CONTROL_SCRIPT, app, MAC_VERBS[action]];
}

/** NX_KEYTYPE_PLAY, NEXT and PREVIOUS: the codes of the media keys on a Mac keyboard. */
/** @type {Record<MediaAction, number>} */
export const MAC_MEDIA_KEYS = { 'play-pause': 16, next: 17, previous: 18 };

/**
 * Presses a media key, so whatever app macOS considers to be playing (a browser tab, Podcasts…)
 * responds, as it would to the key on the keyboard. macOS only delivers it once Open Palette
 * is allowed under Accessibility.
 */
export const MAC_MEDIA_KEY_SCRIPT = `ObjC.import('AppKit');
ObjC.import('CoreGraphics');
function run(argv) {
  const key = Number(argv[0]);
  for (const down of [true, false]) {
    const event = $.NSEvent.otherEventWithTypeLocationModifierFlagsTimestampWindowNumberContextSubtypeData1Data2(
      14, $.NSMakePoint(0, 0), down ? 0xa00 : 0xb00, 0, 0, null, 8, (key << 16) | ((down ? 0xa : 0xb) << 8), -1);
    $.CGEventPost(0, event.CGEvent);
  }
}`;

// ── Linux ────────────────────────────────────────────────────────────────────

/**
 * What `playerctl metadata --format` prints for each player, tab-separated. The instance tells
 * apart two players of the same kind (Chrome and an Electron app are both "chromium").
 */
export const PLAYERCTL_FORMAT =
  '{{playerInstance}}\t{{playerName}}\t{{status}}\t{{title}}\t{{artist}}\t{{album}}\t{{mpris:length}}\t{{position}}';

/** @param {string} output @returns {Player[]} */
export function parsePlayerctl(output) {
  return output
    .split('\n')
    .filter((line) => line.includes('\t'))
    .map((line) => {
      const [instance = '', name = '', status, title, artist, album, length, position] = line.split('\t');
      // MPRIS counts in microseconds.
      const micro = (/** @type {string | undefined} */ v) => {
        const n = seconds(v);
        return n === undefined ? undefined : n / 1e6;
      };
      return {
        // playerctl before 2.1 leaves the instance empty.
        id: instance || name,
        app: prettyLinuxName(name || instance),
        state: toState(status),
        title: text(title),
        artist: text(artist),
        album: text(album),
        duration: micro(length),
        position: micro(position),
      };
    });
}

/**
 * "spotify" → "Spotify", "chromium.instance1234" → "Chromium", "firefox.instance_1_23" → "Firefox".
 * @param {string} name
 */
export function prettyLinuxName(name) {
  const base = name.replace(/^org\.mpris\.MediaPlayer2\./, '').split('.')[0] ?? name;
  const known = /** @type {Record<string, string>} */ ({ vlc: 'VLC', mpv: 'mpv', chrome: 'Google Chrome' });
  return known[base.toLowerCase()] ?? base.charAt(0).toUpperCase() + base.slice(1);
}

/** The MPRIS players on the session bus, from `gdbus call … ListNames`. @param {string} output */
export function parseBusNames(output) {
  return [...output.matchAll(/'(org\.mpris\.MediaPlayer2\.[^']+)'/g)].map((m) => /** @type {string} */ (m[1]));
}

/**
 * Reads one MPRIS player's `Get … PlaybackStatus` and `Get … Metadata` answers from gdbus, which
 * prints GVariant text like `(<{'xesam:title': <'Song'>, 'xesam:artist': <['A', 'B']>}>,)`.
 * @param {string} busName
 * @param {string} status
 * @param {string} metadata
 * @returns {Player}
 */
export function parseMprisGvariant(busName, status, metadata) {
  // GVariant quotes a string with ' unless it contains one, then with ".
  const quoted = `(?:'((?:[^'\\\\]|\\\\.)*)'|"((?:[^"\\\\]|\\\\.)*)")`;
  const unquote = (/** @type {string | undefined} */ value) => value?.replace(/\\(.)/g, '$1');
  /** @param {string} key */
  const string = (key) => {
    const match = new RegExp(`'${key}': <${quoted}>`).exec(metadata);
    return unquote(match?.[1] ?? match?.[2]);
  };
  /** @param {string} key */
  const list = (key) => {
    const match = new RegExp(`'${key}': <\\[((?:${quoted}(?:, )?)*)\\]>`).exec(metadata);
    if (!match?.[1]) return undefined;
    return [...match[1].matchAll(new RegExp(quoted, 'g'))].map((m) => unquote(m[1] ?? m[2]) ?? '').join(', ');
  };
  const length = /'mpris:length': <(?:u?int64 |uint32 |int32 )?(\d+)>/.exec(metadata)?.[1];
  return {
    id: busName,
    app: prettyLinuxName(busName),
    state: toState(/'(\w+)'/.exec(status)?.[1]),
    title: text(string('xesam:title')),
    artist: text(list('xesam:artist')),
    album: text(string('xesam:album')),
    duration: length ? Number(length) / 1e6 : undefined,
  };
}

/** @type {Record<MediaAction, string>} */
export const MPRIS_METHODS = { 'play-pause': 'PlayPause', next: 'Next', previous: 'Previous' };

// ── Windows ──────────────────────────────────────────────────────────────────

/** Virtual-key codes of the media keys, which SendKeys can press as characters. */
/** @type {Record<MediaAction, number>} */
export const WINDOWS_MEDIA_KEYS = { 'play-pause': 179, next: 176, previous: 177 };

/** @param {MediaAction} action */
export function windowsMediaKeyScript(action) {
  return `(New-Object -ComObject WScript.Shell).SendKeys([char]${WINDOWS_MEDIA_KEYS[action]})`;
}

/** @type {Record<MediaAction, string>} */
const WINDOWS_METHODS = {
  'play-pause': 'TryTogglePlayPauseAsync',
  next: 'TrySkipNextAsync',
  previous: 'TrySkipPreviousAsync',
};

/**
 * Lists the apps playing media through Windows' media controls (the ones shown by the volume
 * flyout), and optionally plays, pauses or skips one of them first.
 * @param {{ app: string, action: MediaAction }} [control]
 */
export function windowsSessionsScript(control) {
  // Base64, so nothing in an app's ID can end the string it's put in.
  const app = control ? Buffer.from(control.app, 'utf8').toString('base64') : '';
  const method = control ? WINDOWS_METHODS[control.action] : '';
  return `$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function Await($operation, [Type]$type) {
  $task = $asTask.MakeGenericMethod($type).Invoke($null, @($operation))
  $task.Wait(-1) | Out-Null
  $task.Result
}
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
$manager = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$sessions = @($manager.GetSessions())
$app = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${app}'))
if ($app) {
  $target = $sessions | Where-Object { $_.SourceAppUserModelId -eq $app } | Select-Object -First 1
  if (-not $target) { throw "That app isn't playing any more." }
  Await ($target.${method || 'TryTogglePlayPauseAsync'}()) ([bool]) | Out-Null
  Start-Sleep -Milliseconds 250
}
$players = @(foreach ($session in $sessions) {
  $properties = $null
  try { $properties = Await ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]) } catch {}
  $timeline = $session.GetTimelineProperties()
  [pscustomobject]@{
    app = $session.SourceAppUserModelId
    state = "$($session.GetPlaybackInfo().PlaybackStatus)"
    title = $(if ($properties) { $properties.Title } else { '' })
    artist = $(if ($properties) { $properties.Artist } else { '' })
    album = $(if ($properties) { $properties.AlbumTitle } else { '' })
    duration = $timeline.EndTime.TotalSeconds
    position = $timeline.Position.TotalSeconds
  }
})
ConvertTo-Json -InputObject $players -Compress`;
}

/**
 * "Spotify.exe" → "Spotify", "MSEdge" → "Microsoft Edge",
 * "Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic" → "Media Player".
 * @param {string} id
 */
export function prettyWindowsName(id) {
  /** @type {Record<string, string>} */
  const known = {
    msedge: 'Microsoft Edge',
    chrome: 'Google Chrome',
    firefox: 'Firefox',
    spotify: 'Spotify',
    'microsoft.zunemusic': 'Media Player',
    'microsoft.zunevideo': 'Films & TV',
    vlc: 'VLC',
  };
  const base = (id.split('!')[0] ?? id).split('_')[0]?.replace(/\.exe$/i, '') ?? id;
  return known[base.toLowerCase()] ?? (base.split('.').pop() || id);
}

/** @param {string} output @returns {Player[]} */
export function parseWindowsSessions(output) {
  const parsed = JSON.parse(output.trim() || '[]');
  const rows = /** @type {Array<Record<string, unknown>>} */ (Array.isArray(parsed) ? parsed : [parsed]);
  return rows.flatMap((row) => {
    const id = text(row.app);
    if (!id) return [];
    return [
      {
        id,
        app: prettyWindowsName(id),
        state: toState(row.state),
        title: text(row.title),
        artist: text(row.artist),
        album: text(row.album),
        duration: seconds(row.duration),
        position: seconds(row.position),
      },
    ];
  });
}
