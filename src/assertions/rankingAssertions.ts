/**
 * Rules about the shape and ordering of activity rankings. Each helper returns a list of
 * violations (empty = OK) so a failure can report every bad day at once.
 */
import {
  ACTIVITIES,
  ACTIVITY_NAMES,
  SUITABILITIES,
  type Activity,
  type ActivityRankingsResponse,
  type Day,
  type Ranking,
  type Suitability,
} from '../contract/schemas';
import { addDays, todayIn } from '../support/dates';

export const TIE_BREAK_ORDER: readonly Activity[] = ACTIVITIES;

export function ordinal(n: number): string {
  const suffix =
    n % 10 === 1 && n !== 11
      ? 'st'
      : n % 10 === 2 && n !== 12
        ? 'nd'
        : n % 10 === 3 && n !== 13
          ? 'rd'
          : 'th';
  return `${n}${suffix}`;
}

export function rankingFor(day: Day, activity: Activity): Ranking {
  const ranking = day.rankings.find((r) => r.activity === activity);
  if (!ranking) throw new Error(`${day.date} has no ranking for ${activity}`);
  return ranking;
}

/** One-line summary of a day, used in failure messages: "2026-11-21: 1 SKIING 91, 2 …". */
export function summariseDay(day: Day): string {
  const parts = [...day.rankings]
    .sort((a, b) => a.rank - b.rank)
    .map((r) => `${r.rank} ${r.activity} ${r.score} ${r.suitability}`);
  return `${day.date}: ${parts.join(', ')}`;
}

/** Selects 1-based days ("days 1 to 3"). */
export function selectDays(body: ActivityRankingsResponse, from = 1, to = body.days.length): Day[] {
  return body.days.slice(from - 1, to);
}

export function consecutiveDayViolations(days: Day[], expectedCount: number): string[] {
  const violations: string[] = [];
  if (days.length !== expectedCount)
    violations.push(`expected ${expectedCount} days, received ${days.length}`);
  days.forEach((day, i) => {
    if (i > 0) {
      const expected = addDays((days[i - 1] as Day).date, 1);
      if (day.date !== expected)
        violations.push(`day ${i + 1} is ${day.date}, expected ${expected}`);
    }
  });
  return violations;
}

export function startsTodayViolations(days: Day[], timeZone: string, now = new Date()): string[] {
  const today = todayIn(timeZone, now);
  const first = days[0]?.date;
  return first === today
    ? []
    : [
        `first day is ${first ?? '(none)'}, but today in ${timeZone} is ${today} (UTC now: ${now.toISOString()})`,
      ];
}

export function activityCoverageViolations(days: Day[]): string[] {
  return days.flatMap((day) => {
    const seen = day.rankings.map((r) => r.activity);
    const missing = ACTIVITIES.filter((a) => !seen.includes(a));
    const duplicated = ACTIVITIES.filter((a) => seen.filter((s) => s === a).length > 1);
    const wrongNames = day.rankings
      .filter((r) => r.activityName !== ACTIVITY_NAMES[r.activity])
      .map(
        (r) =>
          `${r.activity} is named "${r.activityName}", expected "${ACTIVITY_NAMES[r.activity]}"`,
      );
    return [
      ...(missing.length ? [`${day.date} is missing ${missing.join(', ')}`] : []),
      ...(duplicated.length ? [`${day.date} lists ${duplicated.join(', ')} more than once`] : []),
      ...wrongNames.map((w) => `${day.date}: ${w}`),
    ];
  });
}

export function rankSequenceViolations(days: Day[]): string[] {
  return days.flatMap((day) => {
    const ranks = day.rankings.map((r) => r.rank).sort((a, b) => a - b);
    return ranks.join(',') === '1,2,3,4'
      ? []
      : [`${day.date} has ranks [${ranks.join(', ')}], expected [1, 2, 3, 4]`];
  });
}

export function scoreOrderViolations(days: Day[]): string[] {
  return days.flatMap((day) => {
    const byRank = [...day.rankings].sort((a, b) => a.rank - b.rank);
    const listedInRankOrder = day.rankings.every((r, i) => r.rank === i + 1);
    const out: string[] = [];
    if (!listedInRankOrder) out.push(`${day.date}: rankings are not listed in rank order`);
    for (let i = 1; i < byRank.length; i++) {
      const prev = byRank[i - 1] as Ranking;
      const cur = byRank[i] as Ranking;
      if (cur.score > prev.score) {
        out.push(
          `${day.date}: rank ${cur.rank} ${cur.activity} (${cur.score}) outscores rank ${prev.rank} ${prev.activity} (${prev.score})`,
        );
      }
    }
    return out;
  });
}

export function tieBreakViolations(
  days: Day[],
  order: readonly Activity[] = TIE_BREAK_ORDER,
): string[] {
  return days.flatMap((day) => {
    const byRank = [...day.rankings].sort((a, b) => a.rank - b.rank);
    const out: string[] = [];
    for (let i = 1; i < byRank.length; i++) {
      const prev = byRank[i - 1] as Ranking;
      const cur = byRank[i] as Ranking;
      if (cur.score === prev.score && order.indexOf(cur.activity) < order.indexOf(prev.activity)) {
        out.push(
          `${day.date}: ${prev.activity} and ${cur.activity} tie on ${cur.score} but ${cur.activity} should come first`,
        );
      }
    }
    return out;
  });
}

export function countTies(days: Day[]): number {
  return days.reduce(
    (n, day) => n + (new Set(day.rankings.map((r) => r.score)).size < day.rankings.length ? 1 : 0),
    0,
  );
}

export interface Band {
  suitability: Suitability;
  min: number;
  max: number;
}

export function bandViolations(days: Day[], bands: Band[]): string[] {
  return days.flatMap((day) =>
    day.rankings.flatMap((r) => {
      const band = bands.find((b) => r.score >= b.min && r.score <= b.max);
      return band?.suitability === r.suitability
        ? []
        : [
            `${day.date} ${r.activity}: score ${r.score} is labelled ${r.suitability}, expected ${band?.suitability ?? '(no band)'}`,
          ];
    }),
  );
}

/** EXCELLENT > GOOD > FAIR > POOR. */
export function isAtLeast(actual: Suitability, minimum: Suitability): boolean {
  return SUITABILITIES.indexOf(actual) <= SUITABILITIES.indexOf(minimum);
}

/** Generic per-day check: returns a violation (with the day summary) whenever `ok` is false. */
export function perDay(
  days: Day[],
  ok: (day: Day) => boolean,
  describe: (day: Day) => string,
): string[] {
  return days.filter((d) => !ok(d)).map((d) => `${describe(d)}  [${summariseDay(d)}]`);
}
