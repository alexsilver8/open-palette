import type { Platform } from '../../shared/types';

/** A program to run, with its arguments. */
export type Program = [file: string, args: string[]];

export type PowerAction = 'restart' | 'shut-down' | 'log-out';

const osascript = (script: string): Program => ['osascript', ['-e', script]];

/**
 * How to log out on Linux, by desktop, before falling back to ending the session outright
 * (which doesn't let apps ask to save). Each is tried in turn until one is installed.
 */
export function linuxLogOut(env: NodeJS.ProcessEnv = process.env): Program[] {
  const desktop = (env.XDG_CURRENT_DESKTOP ?? env.DESKTOP_SESSION ?? '').toLowerCase();
  const programs: Program[] = [];
  if (desktop.includes('kde')) {
    programs.push(['qdbus6', ['org.kde.Shutdown', '/Shutdown', 'logout']]);
    programs.push(['qdbus', ['org.kde.ksmserver', '/KSMServer', 'logout', '0', '0', '0']]);
  }
  if (desktop.includes('xfce')) programs.push(['xfce4-session-logout', ['--logout']]);
  if (desktop.includes('mate')) programs.push(['mate-session-save', ['--logout']]);
  if (desktop.includes('cinnamon')) programs.push(['cinnamon-session-quit', ['--logout', '--no-prompt']]);
  if (desktop.includes('gnome') || desktop.includes('unity') || desktop.includes('budgie')) {
    programs.push(['gnome-session-quit', ['--logout', '--no-prompt']]);
  }
  if (env.XDG_SESSION_ID) programs.push(['loginctl', ['terminate-session', env.XDG_SESSION_ID]]);
  return programs;
}

/**
 * Programs that restart, shut down or log out, in the order to try them. On macOS, System
 * Events asks open apps to quit first, as the Apple menu does, so unsaved work isn't lost.
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
    case 'linux':
      if (action === 'log-out') return linuxLogOut(env);
      return [['systemctl', [action === 'restart' ? 'reboot' : 'poweroff']]];
  }
}
