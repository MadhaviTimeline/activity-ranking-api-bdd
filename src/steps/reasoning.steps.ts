import { Then } from '@cucumber/cucumber';
import { expectNoViolations, fail } from '../assertions/responseAssertions';
import { rankingFor } from '../assertions/rankingAssertions';
import { ACTIVITY_NAMES, type Activity, type Suitability } from '../contract/schemas';
import { ACTIVITY_PATTERN, toActivity } from '../support/parameterTypes';
import type { ApiWorld } from '../support/world';

const words = (list: string): string[] =>
  list
    .split(',')
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);

function reasonsMention(reasons: string[], keywords: string[]): boolean {
  const text = reasons.join(' ').toLowerCase();
  return keywords.some((k) => text.includes(k));
}

function assertReasonsMention(
  world: ApiWorld,
  activity: Activity,
  keywords: string[],
  only?: Suitability,
): void {
  const rankings = world.rankings().days.map((d) => ({ date: d.date, r: rankingFor(d, activity) }));
  const selected = only ? rankings.filter(({ r }) => r.suitability === only) : rankings;
  const name = `${only ? `${only} ` : ''}${ACTIVITY_NAMES[activity]}`;
  if (selected.length === 0) {
    fail(world.response, `at least one ${name} ranking to explain`, 'there were none');
  }
  expectNoViolations(
    world.response,
    `every ${name} reason list to mention one of: ${keywords.join(', ')}`,
    selected
      .filter(({ r }) => !reasonsMention(r.reasons, keywords))
      .map(({ date, r }) => `${date}: ${JSON.stringify(r.reasons)}`),
  );
}

Then(
  new RegExp(`^every (${ACTIVITY_PATTERN}) reason list mentions one of: (.+)$`),
  function (this: ApiWorld, activity: string, list: string) {
    assertReasonsMention(this, toActivity(activity), words(list));
  },
);

Then(
  new RegExp(`^every POOR (${ACTIVITY_PATTERN}) reason list mentions one of: (.+)$`),
  function (this: ApiWorld, activity: string, list: string) {
    assertReasonsMention(this, toActivity(activity), words(list), 'POOR');
  },
);

Then(
  'every {activity} reason explains that there is no coastline or wave data',
  function (this: ApiWorld, activity: Activity) {
    assertReasonsMention(this, activity, ['coast', 'inland', 'wave', 'sea', 'marine', 'swell']);
  },
);

Then(
  'every {activity} reason explains that wave data is unavailable',
  function (this: ApiWorld, activity: Activity) {
    const violations = this.rankings().days.flatMap((d) => {
      const text = rankingFor(d, activity).reasons.join(' ');
      const ok =
        /wave|marine|swell|surf/i.test(text) &&
        /unavailable|not available|no .*data|missing|could not|couldn't/i.test(text);
      return ok ? [] : [`${d.date}: ${JSON.stringify(rankingFor(d, activity).reasons)}`];
    });
    expectNoViolations(
      this.response,
      `${ACTIVITY_NAMES[activity]} reasons to say that wave data is unavailable`,
      violations,
    );
  },
);

function quotedValues(world: ApiWorld, activity: Activity, day: number, unit: RegExp): number[] {
  const d = world.rankings().days[day - 1];
  if (!d) fail(world.response, `a day ${day}`, 'there is no such day');
  return [...rankingFor(d, activity).reasons.join(' ').matchAll(unit)].map((m) => Number(m[1]));
}

function assertQuoted(
  world: ApiWorld,
  activity: Activity,
  day: number,
  value: number,
  unit: string,
  pattern: RegExp,
): void {
  const found = quotedValues(world, activity, day, pattern);
  // "Rounded sensibly": accept anything within 1 unit of the forecast value.
  if (!found.some((n) => Math.abs(n - value) <= 1)) {
    const d = world.rankings().days[day - 1];
    const reasons = d ? JSON.stringify(rankingFor(d, activity).reasons) : '[]';
    fail(
      world.response,
      `${ACTIVITY_NAMES[activity]} reasons on day ${day} to quote about ${value} ${unit}`,
      `they say ${reasons}`,
    );
  }
}

Then(
  'the {activity} reasons for day {int} quote about {int} cm of snow',
  function (this: ApiWorld, activity: Activity, day: number, cm: number) {
    assertQuoted(this, activity, day, cm, 'cm', /(-?\d+(?:\.\d+)?)\s*cm\b/gi);
  },
);

Then(
  'the {activity} reasons for day {int} quote about {int} °C',
  function (this: ApiWorld, activity: Activity, day: number, c: number) {
    assertQuoted(this, activity, day, c, '°C', /(-?\d+(?:\.\d+)?)\s*°\s*C\b/g);
  },
);

function allReasons(world: ApiWorld): { where: string; reason: string }[] {
  return world
    .rankings()
    .days.flatMap((d) =>
      d.rankings.flatMap((r) =>
        r.reasons.map((reason) => ({ where: `${d.date} ${r.activity}`, reason })),
      ),
    );
}

Then('every ranking has at least one reason', function (this: ApiWorld) {
  const empty = this.rankings().days.flatMap((d) =>
    d.rankings.filter((r) => r.reasons.length === 0).map((r) => `${d.date} ${r.activity}`),
  );
  expectNoViolations(this.response, 'at least one reason per ranking', empty);
});

Then(
  'every reason is a non-blank sentence of at most {int} characters',
  function (this: ApiWorld, max: number) {
    const violations = allReasons(this).flatMap(({ where, reason }) => {
      const problems: string[] = [];
      if (reason.trim() === '') problems.push('is blank');
      if (reason !== reason.trim()) problems.push('has surrounding whitespace');
      if (reason.length > max) problems.push(`is ${reason.length} characters long`);
      if (!/^[\p{Lu}\d-]/u.test(reason))
        problems.push('does not start with a capital letter or number');
      return problems.map((p) => `${where}: "${reason}" ${p}`);
    });
    expectNoViolations(
      this.response,
      `display-ready reasons of at most ${max} characters`,
      violations,
    );
  },
);

Then(
  'no reason contains raw codes or placeholders such as {string}, {string}, {string}, {string} or {string}',
  function (this: ApiWorld, ...tokens: string[]) {
    const patterns = [
      ...tokens.map((t) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')),
      /\b[a-z]+(?:_[a-z0-9]+)+\b/, // snake_case field names such as snowfall_sum
    ];
    const violations = allReasons(this).flatMap(({ where, reason }) =>
      patterns.filter((p) => p.test(reason)).map((p) => `${where}: "${reason}" matches ${p}`),
    );
    expectNoViolations(
      this.response,
      'reasons free of internal codes and placeholders',
      violations,
    );
  },
);

Then(
  'no reason uses imperial units such as {string}, {string}, {string} or {string}',
  function (this: ApiWorld, ...units: string[]) {
    const patterns = units.map((u) =>
      u.startsWith('°') ? new RegExp(u) : new RegExp(`\\d\\s*${u}\\b|\\b${u}\\b`, 'i'),
    );
    const violations = allReasons(this).flatMap(({ where, reason }) =>
      patterns.filter((p) => p.test(reason)).map((p) => `${where}: "${reason}" matches ${p}`),
    );
    expectNoViolations(this.response, 'metric units only (°C, mm, cm, km/h, m)', violations);
  },
);
