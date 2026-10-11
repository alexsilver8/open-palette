import { describe, expect, it } from 'vitest';
import { contrast, formatColor, nameOf, parseColor, toOklch } from './color.js';

/** @param {string} input */
const forms = (input) => {
  const color = parseColor(input);
  return color && Object.fromEntries(formatColor(color).map((form) => [form.id, form.value]));
};

describe('parseColor', () => {
  it('reads hex in every length', () => {
    expect(parseColor('#f00')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColor('#ff000080')).toEqual({ r: 255, g: 0, b: 0, a: 0.502 });
    expect(parseColor('FF6347')).toEqual({ r: 255, g: 99, b: 71, a: 1 });
    expect(parseColor('#0f08')?.a).toBe(0.533);
  });

  it("needs the # for short hex, so words aren't colours", () => {
    expect(parseColor('bad')).toBeUndefined();
    expect(parseColor('cafe')).toBeUndefined();
    expect(parseColor('#bad')).toEqual({ r: 187, g: 170, b: 221, a: 1 });
  });

  it('reads rgb() with commas, spaces, percentages and alpha', () => {
    expect(parseColor('rgb(255, 99, 71)')).toEqual({ r: 255, g: 99, b: 71, a: 1 });
    expect(parseColor('rgba(255,99,71,0.5)')).toEqual({ r: 255, g: 99, b: 71, a: 0.5 });
    expect(parseColor('rgb(100% 0% 0% / 25%)')).toEqual({ r: 255, g: 0, b: 0, a: 0.25 });
    expect(parseColor('rgb(1 2)')).toBeUndefined();
  });

  it('reads hsl() with any hue unit', () => {
    expect(forms('hsl(9 100% 64%)')?.hex).toBe('#ff6347');
    expect(forms('hsl(0.5turn, 100%, 50%)')?.hex).toBe('#00ffff');
    expect(forms('hsla(240deg 100% 50% / .5)')?.hex).toBe('#0000ff80');
  });

  it('reads oklch()', () => {
    expect(forms('oklch(62.8% 0.2577 29.23)')?.hex).toBe('#ff0000');
    expect(forms('oklch(0.628 0.2577 29.23)')?.hex).toBe('#ff0000');
  });

  it('reads CSS names and transparent', () => {
    expect(parseColor('Tomato')).toEqual({ r: 255, g: 99, b: 71, a: 1 });
    expect(parseColor('transparent')).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(parseColor('notacolor')).toBeUndefined();
  });

  it('ignores a trailing semicolon pasted from CSS', () => {
    expect(parseColor('#fff;')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
  });
});

describe('formatColor', () => {
  it('writes every form', () => {
    expect(forms('tomato')).toEqual({
      hex: '#ff6347',
      rgb: 'rgb(255 99 71)',
      hsl: 'hsl(9.1 100% 63.9%)',
      oklch: 'oklch(69.62% 0.1955 32.32)',
      name: 'tomato',
    });
  });

  it('keeps alpha', () => {
    expect(forms('rgb(255 0 0 / 0.5)')).toMatchObject({
      hex: '#ff000080',
      rgb: 'rgb(255 0 0 / 0.5)',
      hsl: 'hsl(0 100% 50% / 0.5)',
    });
  });

  it('gives grey no hue', () => {
    expect(toOklch({ r: 128, g: 128, b: 128, a: 1 }).h).toBe(0);
    expect(forms('#808080')?.hsl).toBe('hsl(0 0% 50.2%)');
  });
});

describe('nameOf', () => {
  it('names only exact matches', () => {
    expect(nameOf({ r: 255, g: 99, b: 71, a: 1 })).toBe('tomato');
    expect(nameOf({ r: 255, g: 99, b: 72, a: 1 })).toBeUndefined();
  });
});

describe('contrast', () => {
  it('follows WCAG 2', () => {
    const white = { r: 255, g: 255, b: 255, a: 1 };
    const black = { r: 0, g: 0, b: 0, a: 1 };
    expect(contrast(white, black)).toBe(21);
    expect(contrast(black, white)).toBe(21);
    expect(contrast({ r: 118, g: 118, b: 118, a: 1 }, white)).toBe(4.54);
  });
});
