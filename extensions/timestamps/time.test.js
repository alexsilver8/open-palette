import { describe, expect, it } from 'vitest';
import { formatMoment, fromNow, isoInZone, parseMoment } from './time.js';

const NOW = new Date('2026-10-11T12:00:00Z');

describe('parseMoment', () => {
  it('treats empty text and "now" as now', () => {
    expect(parseMoment('', NOW)).toEqual({ date: NOW, source: 'now' });
    expect(parseMoment(' NOW ', NOW)).toEqual({ date: NOW, source: 'now' });
  });

  it('tells the unit of a number by its length', () => {
    const iso = (/** @type {string} */ input) => {
      const moment = parseMoment(input, NOW);
      return moment && [moment.source, moment.date.toISOString()];
    };
    expect(iso('1760184000')).toEqual(['seconds', '2025-10-11T12:00:00.000Z']);
    expect(iso('1760184000.5')).toEqual(['seconds', '2025-10-11T12:00:00.500Z']);
    expect(iso('1760184000123')).toEqual(['milliseconds', '2025-10-11T12:00:00.123Z']);
    expect(iso('1760184000123456')).toEqual(['microseconds', '2025-10-11T12:00:00.123Z']);
    expect(iso('1760184000123456789')).toEqual(['nanoseconds', '2025-10-11T12:00:00.123Z']);
    expect(iso('0')).toEqual(['seconds', '1970-01-01T00:00:00.000Z']);
    expect(iso('-86400')).toEqual(['seconds', '1969-12-31T00:00:00.000Z']);
  });

  it('reads ISO 8601, RFC 2822 and log-style dates', () => {
    expect(parseMoment('2026-10-11T14:30:00+02:00', NOW)?.date.toISOString()).toBe('2026-10-11T12:30:00.000Z');
    expect(parseMoment('Sun, 11 Oct 2026 12:30:00 GMT', NOW)?.date.toISOString()).toBe('2026-10-11T12:30:00.000Z');
    expect(parseMoment('2026-10-11 12:30:00Z', NOW)?.date.toISOString()).toBe('2026-10-11T12:30:00.000Z');
  });

  it("rejects what isn't a date", () => {
    expect(parseMoment('soon', NOW)).toBeUndefined();
    expect(parseMoment('123456789012345678901', NOW)).toBeUndefined();
  });
});

describe('isoInZone', () => {
  it('writes the local time with its offset', () => {
    const date = new Date('2026-10-11T12:30:00Z');
    expect(isoInZone(date, 'Europe/Zurich')).toBe('2026-10-11T14:30:00+02:00');
    expect(isoInZone(date, 'America/Sao_Paulo')).toBe('2026-10-11T09:30:00-03:00');
    expect(isoInZone(date, 'UTC')).toBe('2026-10-11T12:30:00+00:00');
    expect(isoInZone(date, 'Asia/Kolkata')).toBe('2026-10-11T18:00:00+05:30');
  });
});

describe('fromNow', () => {
  it('says how far away the moment is', () => {
    expect(fromNow(new Date('2026-10-11T15:00:00Z'), NOW)).toBe('in 3 hours');
    expect(fromNow(new Date('2026-10-09T12:00:00Z'), NOW)).toBe('2 days ago');
    expect(fromNow(new Date('2026-10-11T12:00:02Z'), NOW)).toBe('now');
  });
});

describe('formatMoment', () => {
  it('writes every format', () => {
    const formats = formatMoment(new Date('2026-10-11T12:30:00Z'), {
      now: NOW,
      timeZone: 'Europe/Zurich',
      locale: 'en-GB',
    });
    const { local, ...exact } = Object.fromEntries(formats.map((format) => [format.id, format.value]));
    expect(exact).toEqual({
      seconds: '1791721800',
      milliseconds: '1791721800000',
      'iso-utc': '2026-10-11T12:30:00.000Z',
      'iso-local': '2026-10-11T14:30:00+02:00',
      rfc: 'Sun, 11 Oct 2026 12:30:00 GMT',
      relative: 'in 30 minutes',
    });
    // Punctuation in the readable form varies with the ICU data Node is built with.
    expect(local).toMatch(/^Sunday,? 11 October 2026 at 14:30:00 CEST$/);
  });
});
