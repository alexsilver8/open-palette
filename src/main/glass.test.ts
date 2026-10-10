import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: {}, nativeTheme: { shouldUseDarkColors: false } }));

const { glassFor, glassWindowOptions } = await import('./glass');

describe('glassFor', () => {
  it('uses vibrancy on macOS', () => {
    expect(glassFor('darwin', '25.0.0')).toBe('vibrancy');
  });

  it('uses acrylic from Windows 11 22H2 on', () => {
    expect(glassFor('win32', '10.0.22621')).toBe('acrylic');
    expect(glassFor('win32', '10.0.26100')).toBe('acrylic');
    expect(glassFor('win32', '10.0.22000')).toBe('none');
    expect(glassFor('win32', '10.0.19045')).toBe('none');
  });

  it('draws its own surface on Linux', () => {
    expect(glassFor('linux', '6.8.0')).toBe('none');
  });
});

describe('glassWindowOptions', () => {
  it('keeps frameless windows transparent when there is no system blur', () => {
    expect(glassWindowOptions('none', true)).toEqual({ transparent: true, backgroundColor: '#00000000' });
    expect(glassWindowOptions('none', false)).toEqual({ backgroundColor: '#f6f6f8' });
  });

  it('asks the system for blur where it has it', () => {
    expect(glassWindowOptions('vibrancy', true)).toMatchObject({ vibrancy: 'under-window' });
    expect(glassWindowOptions('acrylic', false)).toMatchObject({ backgroundMaterial: 'acrylic' });
  });
});
