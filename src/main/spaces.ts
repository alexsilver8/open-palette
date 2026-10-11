import type { BrowserWindow } from 'electron';

/**
 * Lets a window open wherever you are on macOS, on any desktop and over a full-screen app,
 * instead of switching you to the desktop it was last on.
 *
 * The app has no Dock icon (it's an accessory app), which is what lets its windows join a
 * full-screen app's space. So Electron must not switch the process type here: by default,
 * `setVisibleOnAllWorkspaces` shows the Dock icon again whenever `visibleOnFullScreen` is
 * false, which turns the app into an ordinary one and stops even the launcher appearing over
 * full-screen apps.
 */
export function showOnEverySpace(
  window: Pick<BrowserWindow, 'setVisibleOnAllWorkspaces'>,
  platform: NodeJS.Platform = process.platform,
): void {
  if (platform !== 'darwin') return;
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
}
