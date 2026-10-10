import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { CommandImplementation } from '../../shared/types';
import type { BuiltinExtension } from './types';

const run = promisify(execFile);

type PlatformCommands = Partial<Record<NodeJS.Platform, [file: string, args: string[]]>>;

function shellCommand(commands: PlatformCommands): CommandImplementation {
  return {
    async run() {
      const command = commands[process.platform];
      if (!command) return { toast: 'Not available on this system.', toastStyle: 'failure' };
      await run(command[0], command[1]);
      return { hide: true };
    },
  };
}

const osascript = (script: string): [string, string[]] => ['osascript', ['-e', script]];

export const system: BuiltinExtension = {
  manifest: {
    name: 'system',
    title: 'System',
    icon: { builtin: 'power', tint: 'gray' },
    commands: [
      {
        name: 'lock-screen',
        title: 'Lock Screen',
        mode: 'no-view',
        icon: { builtin: 'lock', tint: 'gray' },
        keywords: ['away'],
      },
      {
        name: 'sleep',
        title: 'Sleep',
        mode: 'no-view',
        icon: { builtin: 'moon', tint: 'purple' },
        keywords: ['suspend'],
        platforms: ['darwin', 'linux'],
      },
      {
        name: 'toggle-appearance',
        title: 'Toggle System Appearance',
        mode: 'no-view',
        icon: { builtin: 'moon', tint: 'gray' },
        keywords: ['dark mode', 'light mode', 'theme'],
        platforms: ['darwin'],
      },
    ],
  },
  commands: {
    'lock-screen': shellCommand({
      // Sends ⌃⌘Q; macOS asks once for permission to control System Events.
      darwin: osascript('tell application "System Events" to keystroke "q" using {control down, command down}'),
      win32: ['rundll32.exe', ['user32.dll,LockWorkStation']],
      linux: ['loginctl', ['lock-session']],
    }),
    sleep: shellCommand({
      darwin: ['pmset', ['sleepnow']],
      linux: ['systemctl', ['suspend']],
    }),
    'toggle-appearance': shellCommand({
      darwin: osascript(
        'tell application "System Events" to tell appearance preferences to set dark mode to not dark mode',
      ),
    }),
  },
};
