import type { Platform } from '../../shared/types';

/** A program to run, with its arguments. `next: true` tries the next one if this one fails. */
export type Program = [file: string, args: string[], options?: { next?: boolean }];

export type PowerAction = 'restart' | 'shut-down' | 'log-out';

const osascript = (script: string): Program => ['osascript', ['-e', script]];

/**
 * Restarting, shutting down and logging out through the Linux desktop, which asks open apps to
 * quit (and lets them ask to save). Only desktops whose way is known are listed.
 */
export function linuxDesktopPrograms(action: PowerAction, env: NodeJS.ProcessEnv = process.env): Program[] {
  const desktop = (env.XDG_CURRENT_DESKTOP ?? env.DESKTOP_SESSION ?? '').toLowerCase();
  const programs: Program[] = [];
  if (desktop.includes('kde')) {
    // Plasma 6 and late 5 answer on org.kde.Shutdown; older Plasma on ksmserver.
    const method = { restart: 'logoutAndReboot', 'shut-down': 'logoutAndShutdown', 'log-out': 'logout' }[action];
    const type = { restart: '1', 'shut-down': '2', 'log-out': '0' }[action];
    programs.push(['qdbus6', ['org.kde.Shutdown', '/Shutdown', method], { next: true }]);
    programs.push(['qdbus', ['org.kde.Shutdown', '/Shutdown', method], { next: true }]);
    programs.push(['qdbus', ['org.kde.ksmserver', '/KSMServer', 'logout', '0', type, '0']]);
  }
  if (desktop.includes('xfce')) {
    programs.push([
      'xfce4-session-logout',
      [{ restart: '--reboot', 'shut-down': '--halt', 'log-out': '--logout' }[action]],
    ]);
  }
  if (desktop.includes('cinnamon')) {
    const flag = { restart: '--reboot', 'shut-down': '--power-off', 'log-out': '--logout' }[action];
    programs.push(['cinnamon-session-quit', [flag, '--no-prompt']]);
  }
  if (desktop.includes('mate') && action === 'log-out') programs.push(['mate-session-save', ['--logout']]);
  if (desktop.includes('gnome') || desktop.includes('unity') || desktop.includes('budgie')) {
    const flag = { restart: '--reboot', 'shut-down': '--power-off', 'log-out': '--logout' }[action];
    programs.push(['gnome-session-quit', [flag, '--no-prompt']]);
  }
  return programs;
}

/**
 * Programs that restart, shut down or log out, in the order to try them. On macOS, System
 * Events asks open apps to quit first, as the Apple menu does, so unsaved work isn't lost.
 * On Linux, the desktop's own way comes first; restarting and shutting down fall back to
 * systemd, which closes apps without asking. Logging out has no such fallback: ending a
 * session from outside would close everything in it unasked.
 */
export function powerPrograms(action: PowerAction, platform: Platform, env = process.env): Program[] {
  switch (platform) {
    case 'darwin':
      return [
        osascript(
          `tell application "System Events" to ${action === 'restart' ? 'restart' : action === 'shut-down' ? 'shut down' : 'log out'}`,
        ),
      ];
    case 'win32': {
      const flag = action === 'restart' ? '/r' : action === 'shut-down' ? '/s' : '/l';
      return [['shutdown.exe', action === 'log-out' ? [flag] : [flag, '/t', '0']]];
    }
    case 'linux': {
      const desktop = linuxDesktopPrograms(action, env);
      if (action === 'log-out') return desktop;
      return [...desktop, ['systemctl', [action === 'restart' ? 'reboot' : 'poweroff']]];
    }
  }
}

/** Whether apps get to ask to save first; on Linux only when the desktop's way is known. */
export function asksAppsFirst(platform: Platform, env = process.env): boolean {
  return platform !== 'linux' || linuxDesktopPrograms('restart', env).length > 0;
}
