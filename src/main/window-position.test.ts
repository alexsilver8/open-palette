import { describe, expect, it } from 'vitest';
import { launcherPosition } from './window-position';

const size = { width: 816, height: 516 };
const laptop = { x: 0, y: 25, width: 1440, height: 875 };
const secondDisplay = { x: 1440, y: 0, width: 1920, height: 1080 };

describe('launcherPosition', () => {
  it('centers across and a bit above the middle until it has been dragged', () => {
    expect(launcherPosition(laptop, size)).toEqual({ x: 312, y: 200 });
    expect(launcherPosition(secondDisplay, size)).toEqual({ x: 1992, y: 216 });
  });

  it('goes back to where it was dragged', () => {
    expect(launcherPosition(laptop, size, { x: 100, y: 300 })).toEqual({ x: 100, y: 300 });
    expect(launcherPosition(secondDisplay, size, { x: 1500, y: 40 })).toEqual({ x: 1500, y: 40 });
  });

  it('keeps a dragged launcher fully on screen', () => {
    expect(launcherPosition(laptop, size, { x: 2000, y: -50 })).toEqual({ x: 624, y: 25 });
    expect(launcherPosition(secondDisplay, size, { x: 1200, y: 900 })).toEqual({ x: 1440, y: 564 });
  });

  it('keeps the top left corner on a display smaller than the launcher', () => {
    expect(launcherPosition({ x: 0, y: 0, width: 600, height: 400 }, size, { x: 50, y: 50 })).toEqual({ x: 0, y: 0 });
  });
});
