import { describe, expect, it } from 'vitest';
import { displayOf, type Layout, layoutBounds, type Rect, sameBounds } from './layout';

// A laptop screen without the menu bar, and a bigger one to its right.
const laptop: Rect = { x: 0, y: 25, width: 1440, height: 875 };
const monitor: Rect = { x: 1440, y: -200, width: 2560, height: 1415 };
const window: Rect = { x: 100, y: 100, width: 800, height: 600 };

describe('layoutBounds', () => {
  it('fills halves and quarters of the screen the window is on', () => {
    const cases: Array<[Layout, Rect]> = [
      ['left-half', { x: 0, y: 25, width: 720, height: 875 }],
      ['right-half', { x: 720, y: 25, width: 720, height: 875 }],
      ['top-half', { x: 0, y: 25, width: 1440, height: 438 }],
      ['bottom-half', { x: 0, y: 463, width: 1440, height: 437 }],
      ['top-left', { x: 0, y: 25, width: 720, height: 438 }],
      ['top-right', { x: 720, y: 25, width: 720, height: 438 }],
      ['bottom-left', { x: 0, y: 463, width: 720, height: 437 }],
      ['bottom-right', { x: 720, y: 463, width: 720, height: 437 }],
      ['maximize', laptop],
    ];
    for (const [layout, expected] of cases) {
      expect(layoutBounds(layout, window, [laptop, monitor]), layout).toEqual(expected);
    }
  });

  it('splits an odd width without gaps or overlaps', () => {
    const odd: Rect = { x: 0, y: 0, width: 1001, height: 700 };
    const left = layoutBounds('left-half', window, [odd]);
    const right = layoutBounds('right-half', window, [odd]);
    expect(left && right && left.x + left.width).toBe(right?.x);
    expect(right && right.x + right.width).toBe(1001);
    const thirds = (['first-third', 'center-third', 'last-third'] as const).map((l) => layoutBounds(l, window, [odd]));
    expect(thirds.map((t) => t?.x)).toEqual([0, 334, 667]);
    expect(thirds.reduce((sum, t) => sum + (t?.width ?? 0), 0)).toBe(1001);
  });

  it('runs thirds across a landscape screen and down a portrait one', () => {
    expect(layoutBounds('first-two-thirds', window, [laptop])).toEqual({ x: 0, y: 25, width: 960, height: 875 });
    expect(layoutBounds('last-two-thirds', window, [laptop])).toEqual({ x: 480, y: 25, width: 960, height: 875 });
    const portrait: Rect = { x: 0, y: 0, width: 1080, height: 1920 };
    expect(layoutBounds('center-third', window, [portrait])).toEqual({ x: 0, y: 640, width: 1080, height: 640 });
  });

  it('centres a window, keeping its size but not letting it hang off the screen', () => {
    expect(layoutBounds('center', window, [laptop])).toEqual({ x: 320, y: 163, width: 800, height: 600 });
    const huge = { x: 0, y: 0, width: 3000, height: 2000 };
    expect(layoutBounds('center', huge, [laptop])).toEqual(laptop);
    expect(layoutBounds('almost-maximize', window, [laptop])).toEqual({ x: 72, y: 69, width: 1296, height: 788 });
  });

  it('acts on the display the window is mostly on', () => {
    const straddling = { x: 1300, y: 100, width: 800, height: 600 };
    expect(layoutBounds('left-half', straddling, [laptop, monitor])).toEqual({
      x: 1440,
      y: -200,
      width: 1280,
      height: 1415,
    });
  });

  it('moves to the next and previous display, in the same place relatively', () => {
    expect(layoutBounds('next-display', window, [laptop, monitor])).toEqual({
      x: 1618,
      y: -79,
      width: 1422,
      height: 970,
    });
    // Wraps around: from the rightmost display, Next goes back to the first.
    const onMonitor = layoutBounds('next-display', window, [laptop, monitor]) as Rect;
    expect(sameBounds(layoutBounds('next-display', onMonitor, [laptop, monitor]) as Rect, window, 2)).toBe(true);
    expect(layoutBounds('previous-display', window, [monitor, laptop])).toEqual(onMonitor);
  });

  it('has nowhere to go with no other display, or no display at all', () => {
    expect(layoutBounds('next-display', window, [laptop])).toBeUndefined();
    expect(layoutBounds('left-half', window, [])).toBeUndefined();
  });

  it('keeps a moved window inside a smaller display', () => {
    const big = { x: 0, y: 0, width: 2560, height: 1440 };
    const small = { x: 2560, y: 0, width: 1280, height: 720 };
    const full = { x: 0, y: 0, width: 2560, height: 1440 };
    expect(layoutBounds('next-display', full, [big, small])).toEqual(small);
  });
});

describe('displayOf', () => {
  it('picks the nearest display for a window that is off every screen', () => {
    expect(displayOf({ x: 5000, y: 0, width: 100, height: 100 }, [laptop, monitor])).toBe(1);
    expect(displayOf({ x: -900, y: 0, width: 100, height: 100 }, [laptop, monitor])).toBe(0);
  });
});
