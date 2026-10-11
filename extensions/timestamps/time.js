/**
 * Reading a moment from what someone typed (a Unix timestamp in any unit, an ISO 8601 or
 * RFC 2822 date, or "now") and writing it out in the formats people paste into code.
 */

/**
 * @typedef {'now' | 'seconds' | 'milliseconds' | 'microseconds' | 'nanoseconds' | 'date'} Source
 * @typedef {{ date: Date, source: Source }} Moment
 */

/**
 * @param {string} input
 * @param {Date} [now]
 * @returns {Moment | undefined}
 */
export function parseMoment(input, now = new Date()) {
  const text = input.trim();
  if (text === '' || /^now$/i.test(text)) return { date: now, source: 'now' };

  if (/^-?\d+(\.\d+)?$/.test(text)) {
    const digits = text.replace(/^-/, '').split('.')[0]?.length ?? 0;
    const value = Number(text);
    /** @type {Array<[number, Source, number]>} digits up to, unit, milliseconds per unit */
    const units = [
      [11, 'seconds', 1000],
      [14, 'milliseconds', 1],
      [17, 'microseconds', 1e-3],
      [20, 'nanoseconds', 1e-6],
    ];
    const unit = units.find(([most]) => digits <= most);
    if (!unit) return undefined;
    const date = new Date(Math.round(value * unit[2]));
    return Number.isNaN(date.getTime()) ? undefined : { date, source: unit[1] };
  }

  // Date.parse reads ISO 8601 and RFC 2822; a space instead of the T is common in logs.
  const ms = Date.parse(/^\d{4}-\d{2}-\d{2} \d/.test(text) ? text.replace(' ', 'T') : text);
  return Number.isNaN(ms) ? undefined : { date: new Date(ms), source: 'date' };
}

/**
 * `2026-10-11T14:30:00+02:00`: the moment in a time zone, with that zone's offset.
 * @param {Date} date
 * @param {string} timeZone
 */
export function isoInZone(date, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
      timeZoneName: 'longOffset',
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  const offset = (parts.timeZoneName ?? 'GMT').replace(/^GMT/, '') || '+00:00';
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`;
}

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/**
 * "in 3 hours", "2 days ago", "now".
 * @param {Date} date
 * @param {Date} now
 */
export function fromNow(date, now) {
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  if (Math.abs(seconds) < 5) return 'now';
  /** @type {Array<[Intl.RelativeTimeFormatUnit, number]>} */
  const units = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return relative.format(seconds, 'second');
}

/**
 * The moment in each format, in the order people tend to need them.
 * @param {Date} date
 * @param {{ now: Date, timeZone: string, locale?: string }} options
 * @returns {Array<{ id: string, label: string, value: string }>}
 */
export function formatMoment(date, { now, timeZone, locale }) {
  const ms = date.getTime();
  return [
    { id: 'seconds', label: 'Unix seconds', value: String(Math.floor(ms / 1000)) },
    { id: 'milliseconds', label: 'Unix milliseconds', value: String(ms) },
    { id: 'iso-utc', label: 'ISO 8601, UTC', value: date.toISOString() },
    { id: 'iso-local', label: `ISO 8601, ${timeZone}`, value: isoInZone(date, timeZone) },
    {
      id: 'local',
      label: `Readable, ${timeZone}`,
      value: new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'long', timeZone }).format(date),
    },
    { id: 'rfc', label: 'HTTP date (RFC 7231)', value: date.toUTCString() },
    { id: 'relative', label: 'From now', value: fromNow(date, now) },
  ];
}
