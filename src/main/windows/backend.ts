import type { Rect } from './layout';

/** A problem worth telling the user about, in words they can act on. */
export class WindowError extends Error {}

export interface TargetWindow {
  /** What the backend needs to find the window again to move it. */
  id: string;
  /** Stays the same for the same window between commands, so Restore can find its old place. */
  key: string;
  /** The visible frame, without invisible borders or shadows. */
  bounds: Rect;
}

export interface WindowSnapshot {
  window: TargetWindow;
  /** Work areas of the displays (without the menu bar, Dock or taskbar), in the window's coordinates. */
  displays: Rect[];
}

/** Finds and moves the window in front, one way per system. */
export interface WindowBackend {
  /** The window in front and the displays, or `undefined` when no window is in front. */
  front(): Promise<WindowSnapshot | undefined>;
  move(window: TargetWindow, bounds: Rect): Promise<void>;
}

export { delay, type Exec, exec, isMissing } from '../exec';
