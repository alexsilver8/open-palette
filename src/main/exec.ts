import { execFile } from 'node:child_process';

export type Exec = (file: string, args: string[], timeout?: number) => Promise<string>;

/** Runs a program and resolves to what it printed. Fails with what it said on stderr, if anything. */
export const exec: Exec = (file, args, timeout = 5000) =>
  new Promise((resolve, reject) => {
    execFile(file, args, { timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        // Keep what the program said; it explains more than "Command failed".
        if (stderr?.trim()) error.message = `${error.message}\n${stderr.trim()}`;
        reject(error);
      } else {
        resolve(stdout);
      }
    });
  });

/** Whether running a program failed because it isn't installed. */
export function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === 'ENOENT';
}

/** The last line a failed program printed, which is usually the reason. */
export function reasonOf(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .pop() ?? message
  );
}

export const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** PowerShell takes a script on the command line as base64 of UTF-16LE. */
export function encodePowerShell(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64');
}

/** Arguments to run a PowerShell script, with nothing from the user's profile. */
export function powershellArgs(script: string): string[] {
  return ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodePowerShell(script)];
}
