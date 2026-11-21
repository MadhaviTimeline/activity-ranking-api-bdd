import { Given, Then, When, type DataTable } from '@cucumber/cucumber';
import { expect } from 'expect';
import {
  activityCoverageViolations,
  bandViolations,
  consecutiveDayViolations,
  isAtLeast,
  ordinal,
  perDay,
  rankingFor,
  rankSequenceViolations,
  scoreOrderViolations,
  selectDays,
  startsTodayViolations,
  tieBreakViolations,
  type Band,
} from '../assertions/rankingAssertions';
import {
  expectJsonContentType,
  expectNoViolations,
  fail,
  verify,
} from '../assertions/responseAssertions';
import {
  ACTIVITY_NAMES,
  ActivitySchema,
  SuitabilitySchema,
  type Activity,
  type Day,
  type Suitability,
} from '../contract/schemas';
import { coldWeekWithSnowfall, mildWeekWithRain } from '../stubs/forecastBuilder';
import type { ApiWorld } from '../support/world';

const label = (a: Activity): string => ACTIVITY_NAMES[a];

// ---- Requests -----------------------------------------------------------------------------

When('I request activity rankings for {string}', async function (this: ApiWorld, city: string) {
  this.lastInput = city;
  this.record(await this.api.rankingsForCity(city));
});

When(
  'I request activity rankings for {string} twice',
  async function (this: ApiWorld, city: string) {
    this.lastInput = city;
    this.record(await this.api.rankingsForCity(city));
    this.record(await this.api.rankingsForCity(city));
  },
);

When(
  'I request activity rankings for location id {int}',
  async function (this: ApiWorld, id: number) {
    this.record(await this.api.rankingsForLocationId(id));
  },
);

When(
  'I request activity rankings with the raw query {string}',
  async function (this: ApiWorld, raw: string) {
    this.lastInput = raw;
    this.record(await this.api.rankingsRaw(raw));
  },
);

Given(
  'I have searched for {string} and picked the first match',
  async function (this: ApiWorld, query: string) {
    const res = this.record(await this.api.searchLocations(query));
    const first = this.search(res).results[0];
    if (!first) fail(res, `at least one match for "${query}"`, 'there were none');
    this.picked = first;
  },
);

When('I request activity rankings for the picked location', async function (this: ApiWorld) {
  if (!this.picked) throw new Error('Step order error: no location has been picked.');
  this.record(await this.api.rankingsForLocationId(this.picked.id));
});

// ---- Contract -----------------------------------------------------------------------------

Then('the rankings are returned', function (this: ApiWorld) {
  this.rankings();
});

Then('the rankings response matches the activity rankings contract', function (this: ApiWorld) {
  this.rankings();
  expectJsonContentType(this.response);
});

Then(
  'the rankings are for {string} in {string} with timezone {string}',
  function (this: ApiWorld, name: string, country: string, timezone: string) {
    const { location } = this.rankings();
    verify(this.response, `the resolved location to be echoed back`, () =>
      expect({
        name: location.name,
        country: location.country,
        timezone: location.timezone,
      }).toEqual({ name, country, timezone }),
    );
  },
);

Then('the rankings cover exactly {int} consecutive days', function (this: ApiWorld, count: number) {
  expectNoViolations(
    this.response,
    `${count} consecutive dates`,
    consecutiveDayViolations(this.rankings().days, count),
  );
});

Then("the first day is today's date in {string}", function (this: ApiWorld, timeZone: string) {
  expectNoViolations(
    this.response,
    `the forecast to start today in ${timeZone}`,
    startsTodayViolations(this.rankings().days, timeZone),
  );
});

Then(
  'every day ranks exactly these activities once each:',
  function (this: ApiWorld, table: DataTable) {
    const days = this.rankings().days;
    const expected = table
      .hashes()
      .map((r) => `${r['activity']}=${r['display name']}`)
      .sort();
    const violations = [
      ...activityCoverageViolations(days),
      ...days.flatMap((d) => {
        const actual = d.rankings.map((r) => `${r.activity}=${r.activityName}`).sort();
        return actual.join() === expected.join() ? [] : [`${d.date}: [${actual.join(', ')}]`];
      }),
    ];
    expectNoViolations(this.response, `each day to list ${expected.join(', ')} once`, [
      ...new Set(violations),
    ]);
  },
);

Then("every day's ranks are 1, 2, 3 and 4 with no duplicates", function (this: ApiWorld) {
  expectNoViolations(
    this.response,
    'ranks 1 to 4 on every day',
    rankSequenceViolations(this.rankings().days),
  );
});

Then('every day is ordered by score from highest to lowest', function (this: ApiWorld) {
  expectNoViolations(
    this.response,
    'higher scores to rank higher',
    scoreOrderViolations(this.rankings().days),
  );
});

Then('every score is a whole number from 0 to 100', function (this: ApiWorld) {
  const violations = this.rankings().days.flatMap((d) =>
    d.rankings
      .filter((r) => !Number.isInteger(r.score) || r.score < 0 || r.score > 100)
      .map((r) => `${d.date} ${r.activity}: ${r.score}`),
  );
  expectNoViolations(this.response, 'integer scores between 0 and 100', violations);
});

Then(
  'every suitability label matches its score according to these bands:',
  function (this: ApiWorld, table: DataTable) {
    const bands: Band[] = table.hashes().map((r) => ({
      suitability: SuitabilitySchema.parse(r['suitability']),
      min: Number(r['lowest score']),
      max: Number(r['highest score']),
    }));
    expectNoViolations(
      this.response,
      'suitability labels derived from the score bands',
      bandViolations(this.rankings().days, bands),
    );
  },
);

Then(
  'both responses list the activities in the same order on every day',
  function (this: ApiWorld) {
    const [first, second] = this.history.slice(-2);
    if (!first || !second) throw new Error('Step order error: two responses are needed.');
    const order = (res: typeof first): string[][] =>
      this.rankings(res).days.map((d) => d.rankings.map((r) => r.activity));
    verify(second, 'identical ordering for identical requests', () =>
      expect(order(second)).toEqual(order(first)),
    );
  },
);

Then(
  'activities with equal scores appear in this order:',
  function (this: ApiWorld, table: DataTable) {
    const order = table.hashes().map((r) => ActivitySchema.parse(r['activity']));
    expectNoViolations(
      this.response,
      `ties broken in the order ${order.join(' > ')}`,
      tieBreakViolations(this.rankings().days, order),
    );
  },
);

Then(
  'they match the rankings for {string}, ignoring when they were generated',
  async function (this: ApiWorld, city: string) {
    const byId = this.rankings();
    const byCityResponse = this.record(await this.api.rankingsForCity(city));
    const byCity = this.rankings(byCityResponse);
    verify(byCityResponse, `ranking by id and by city name "${city}" to agree`, () =>
      expect({ ...byId, generatedAt: '-' }).toEqual({ ...byCity, generatedAt: '-' }),
    );
  },
);

// ---- Relative ranking rules ---------------------------------------------------------------

function daysBetween(world: ApiWorld, from?: number, to?: number): Day[] {
  return selectDays(world.rankings(), from, to);
}

function ranksNth(
  world: ApiWorld,
  activity: Activity,
  n: number,
  days: Day[],
  scope: string,
): void {
  expectNoViolations(
    world.response,
    `${label(activity)} to rank ${ordinal(n)} ${scope}`,
    perDay(
      days,
      (d) => rankingFor(d, activity).rank === n,
      (d) => `${d.date}: ${label(activity)} ranked ${ordinal(rankingFor(d, activity).rank)}`,
    ),
  );
}

function ranksAbove(
  world: ApiWorld,
  higher: Activity,
  lower: Activity,
  days: Day[],
  scope: string,
): void {
  expectNoViolations(
    world.response,
    `${label(higher)} to rank above ${label(lower)} ${scope}`,
    perDay(
      days,
      (d) => rankingFor(d, higher).rank < rankingFor(d, lower).rank,
      (d) => `${d.date}: ${label(higher)} is not above ${label(lower)}`,
    ),
  );
}

Then(
  '{activity} ranks {ordinal} on every day',
  function (this: ApiWorld, activity: Activity, n: number) {
    ranksNth(this, activity, n, daysBetween(this), 'on every day');
  },
);

Then(
  '{activity} ranks {ordinal} on days {int} to {int}',
  function (this: ApiWorld, activity: Activity, n: number, from: number, to: number) {
    ranksNth(this, activity, n, daysBetween(this, from, to), `on days ${from} to ${to}`);
  },
);

Then(
  '{activity} ranks above {activity} on every day',
  function (this: ApiWorld, higher: Activity, lower: Activity) {
    ranksAbove(this, higher, lower, daysBetween(this), 'on every day');
  },
);

Then(
  '{activity} ranks above {activity} on days {int} to {int}',
  function (this: ApiWorld, higher: Activity, lower: Activity, from: number, to: number) {
    ranksAbove(this, higher, lower, daysBetween(this, from, to), `on days ${from} to ${to}`);
  },
);

Then(
  '{activity} ranks in the bottom two on every day',
  function (this: ApiWorld, activity: Activity) {
    expectNoViolations(
      this.response,
      `${label(activity)} to rank 3rd or 4th every day`,
      perDay(
        daysBetween(this),
        (d) => rankingFor(d, activity).rank >= 3,
        (d) => `${d.date}: ${label(activity)} ranked ${ordinal(rankingFor(d, activity).rank)}`,
      ),
    );
  },
);

Then(
  '{activity} is rated {suitability} or better on every day',
  function (this: ApiWorld, activity: Activity, minimum: Suitability) {
    expectNoViolations(
      this.response,
      `${label(activity)} to be rated ${minimum} or better every day`,
      perDay(
        daysBetween(this),
        (d) => isAtLeast(rankingFor(d, activity).suitability, minimum),
        (d) => `${d.date}: ${label(activity)} is ${rankingFor(d, activity).suitability}`,
      ),
    );
  },
);

Then(
  '{activity} is rated {suitability} on every day',
  function (this: ApiWorld, activity: Activity, expected: Suitability) {
    expectNoViolations(
      this.response,
      `${label(activity)} to be rated ${expected} every day`,
      perDay(
        daysBetween(this),
        (d) => rankingFor(d, activity).suitability === expected,
        (d) => `${d.date}: ${label(activity)} is ${rankingFor(d, activity).suitability}`,
      ),
    );
  },
);

// ---- Metamorphic (all else equal) ---------------------------------------------------------

Given('I have noted the activity scores', async function (this: ApiWorld) {
  if (!this.baselinePlace) throw new Error('Step order error: no baseline week has been set up.');
  const res = this.record(await this.api.rankingsForCity(this.baselinePlace.name));
  this.baseline = this.rankings(res);
});

async function rerunWith(
  world: ApiWorld,
  forecast: ReturnType<typeof coldWeekWithSnowfall>,
): Promise<void> {
  if (!world.baselinePlace) throw new Error('Step order error: no baseline week has been set up.');
  world.stub.setWeather(world.baselinePlace, forecast);
  world.record(await world.api.rankingsForCity(world.baselinePlace.name));
}

When(
  'the daily snowfall changes to {int} cm and I request the rankings again',
  async function (this: ApiWorld, cm: number) {
    await rerunWith(this, coldWeekWithSnowfall(cm));
  },
);

When(
  'the daily rain changes to {int} mm and I request the rankings again',
  async function (this: ApiWorld, mm: number) {
    await rerunWith(this, mildWeekWithRain(mm));
  },
);

function compareScores(
  world: ApiWorld,
  activity: Activity,
  allowed: 'not lower' | 'not higher',
): void {
  if (!world.baseline) throw new Error('Step order error: no baseline scores were noted.');
  const before = world.baseline.days;
  const after = world.rankings().days;
  const violations = after.flatMap((day, i) => {
    const was = rankingFor(before[i] as Day, activity).score;
    const now = rankingFor(day, activity).score;
    const bad = allowed === 'not lower' ? now < was : now > was;
    return bad ? [`day ${i + 1}: ${label(activity)} went from ${was} to ${now}`] : [];
  });
  expectNoViolations(
    world.response,
    `${label(activity)} scores to be ${allowed} than before`,
    violations,
  );
}

Then(
  "no day's {activity} score is lower than before",
  function (this: ApiWorld, activity: Activity) {
    compareScores(this, activity, 'not lower');
  },
);

Then(
  "no day's {activity} score is higher than before",
  function (this: ApiWorld, activity: Activity) {
    compareScores(this, activity, 'not higher');
  },
);
