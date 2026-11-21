/**
 * Timezone-aware date helpers. Expected dates are always computed in the *location's*
 * timezone via Intl, never in the machine's timezone, so the suite gives the same
 * answer on a laptop in London and a CI runner in UTC.
 */

/** Today's calendar date (YYYY-MM-DD) in an IANA timezone. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Adds whole days to an ISO date using UTC arithmetic (no DST surprises). */
export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The N consecutive dates starting today in `timeZone`. */
export function datesFromToday(timeZone: string, count: number, now: Date = new Date()): string[] {
  const start = todayIn(timeZone, now);
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}

/** Current UTC offset of a timezone, in seconds (e.g. Pacific/Auckland in November → 46800). */
export function utcOffsetSeconds(timeZone: string, now: Date = new Date()): number {
  const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(now)
    .find((p) => p.type === 'timeZoneName')?.value;
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(part ?? '');
  if (!match) return 0;
  const [, sign, hh, mm] = match;
  return (sign === '-' ? -1 : 1) * (Number(hh) * 3600 + Number(mm) * 60);
}

/** Short timezone label as Open-Meteo returns it (e.g. "GMT+13", "CET"). */
export function timezoneAbbreviation(timeZone: string, now: Date = new Date()): string {
  return (
    new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' })
      .formatToParts(now)
      .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT'
  );
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}
