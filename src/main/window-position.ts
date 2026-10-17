/** Where the launcher opens on a display. */

export interface Point {
  x: number;
  y: number;
}

export interface Rect extends Point {
  width: number;
  height: number;
}

/**
 * Where the launcher goes in a display's work area: where you last dragged it on that display,
 * kept fully on screen, or else centered across and a bit above the middle.
 */
export function launcherPosition(workArea: Rect, size: { width: number; height: number }, dragged?: Point): Point {
  if (!dragged) {
    return {
      x: Math.round(workArea.x + (workArea.width - size.width) / 2),
      y: Math.round(workArea.y + workArea.height * 0.2),
    };
  }
  return {
    x: clamp(dragged.x, workArea.x, workArea.x + workArea.width - size.width),
    y: clamp(dragged.y, workArea.y, workArea.y + workArea.height - size.height),
  };
}

/** `value` within `min`–`max`; `min` when the window is bigger than the display. */
function clamp(value: number, min: number, max: number): number {
  return Math.round(Math.max(min, Math.min(value, max)));
}
