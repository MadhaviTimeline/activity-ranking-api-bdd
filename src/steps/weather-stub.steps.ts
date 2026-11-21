/** Programs the Open-Meteo stub (Given) and inspects what the service asked it for (Then). */
import { Given, Then, type DataTable } from '@cucumber/cucumber';
import { expectNoViolations, fail } from '../assertions/responseAssertions';
import { forecastFixture, hasMarineFixture, marineFixture, placeNamed } from '../stubs/fixtures';
import {
  buildForecast,
  coldWeekWithSnowfall,
  mildWeekWithRain,
  parseDays,
  type DayWeather,
} from '../stubs/forecastBuilder';
import type { Endpoint, Fault, RecordedRequest } from '../stubs/openMeteoStub';
import type { ApiWorld } from '../support/world';

// ---- Weather ------------------------------------------------------------------------------

Given(
  'a {string} week is forecast for {string}',
  function (this: ApiWorld, fixture: string, city: string) {
    const marine = hasMarineFixture(fixture) ? marineFixture(fixture) : undefined;
    this.stub.setWeather(placeNamed(city), forecastFixture(fixture), marine);
  },
);

Given('no wave data is available for {string}', function (this: ApiWorld, city: string) {
  this.stub.setMarine(placeNamed(city), marineFixture('no-wave-data'));
});

Given(
  'the daily forecast for {string} is:',
  function (this: ApiWorld, city: string, table: DataTable) {
    const week: (DayWeather | undefined)[] = Array(7).fill(undefined);
    for (const row of table.hashes()) {
      const day: DayWeather = {
        weather: row['weather'] ?? '',
        maxC: Number(row['max °C']),
        minC: Number(row['min °C']),
        snowfallCm: Number(row['snowfall cm']),
        rainMm: Number(row['rain mm']),
        windKmh: Number(row['wind km/h']),
        sunshineHours: Number(row['sunshine h']),
      };
      for (const n of parseDays(row['days'] ?? '')) week[n - 1] = day;
    }
    const missing = week.flatMap((d, i) => (d ? [] : [i + 1]));
    if (missing.length)
      throw new Error(
        `Test setup error: the forecast table has no row for day(s) ${missing.join(', ')}.`,
      );
    this.stub.setWeather(
      placeNamed(city),
      buildForecast(`Custom week for ${city}`, week as DayWeather[]),
    );
  },
);

Given(
  'an otherwise unchanging cold week in {string} with {int} cm of snowfall each day',
  function (this: ApiWorld, city: string, snowfallCm: number) {
    this.baselinePlace = placeNamed(city);
    this.stub.setWeather(this.baselinePlace, coldWeekWithSnowfall(snowfallCm));
  },
);

Given(
  'an otherwise unchanging mild week in {string} with {int} mm of rain each day',
  function (this: ApiWorld, city: string, rainMm: number) {
    this.baselinePlace = placeNamed(city);
    this.stub.setWeather(this.baselinePlace, mildWeekWithRain(rainMm));
  },
);

// ---- Faults -------------------------------------------------------------------------------

const ENDPOINTS: Record<string, Endpoint> = {
  'forecast service': 'forecast',
  'wave forecast service': 'marine',
  'place-name directory': 'geocoding',
};

const FAULTS: Record<string, Fault> = {
  'a server error': { kind: 'status', status: 500 },
  'invalid JSON': { kind: 'invalid-json' },
  'no daily section': { kind: 'no-daily' },
  'no snowfall values': { kind: 'missing-variable', variable: 'snowfall_sum' },
  'only 3 days of data': { kind: 'short', days: 3 },
  'an Open-Meteo error message': { kind: 'open-meteo-error' },
};

Given(
  new RegExp(
    `^the (${Object.keys(ENDPOINTS).join('|')}) responds with (${Object.keys(FAULTS).join('|')})$`,
  ),
  function (this: ApiWorld, service: string, problem: string) {
    this.stub.injectFault(ENDPOINTS[service] as Endpoint, FAULTS[problem] as Fault);
  },
);

Given(
  'the forecast service takes {int} seconds to respond',
  function (this: ApiWorld, seconds: number) {
    this.stub.injectFault('forecast', { kind: 'delay', ms: seconds * 1000 });
  },
);

// ---- What the service asked Open-Meteo for -----------------------------------------------

function lastRequest(world: ApiWorld, endpoint: Endpoint, what: string): RecordedRequest {
  const request = world.stub.requestsTo(endpoint).at(-1);
  if (!request) {
    fail(
      world.history.at(-1),
      `the service to request ${what} from Open-Meteo`,
      `it made no such request.\nRequests received:\n${world.stub.describeRequests()}`,
    );
  }
  return request;
}

const near = (actual: string | null, expected: number): boolean =>
  actual !== null && Math.abs(Number(actual) - expected) <= 0.01;

Then('the forecast was requested with:', function (this: ApiWorld, table: DataTable) {
  const request = lastRequest(this, 'forecast', 'a forecast');
  const expected = table.rowsHash();
  const violations = Object.entries(expected).flatMap(([param, value]) => {
    const actual = request.params.get(param);
    const ok = ['latitude', 'longitude'].includes(param)
      ? near(actual, Number(value))
      : actual === value;
    return ok ? [] : [`${param}: expected ${value}, received ${actual ?? '(not sent)'}`];
  });
  expectNoViolations(
    this.response,
    'the forecast request to carry the resolved location and a 7-day window',
    violations,
  );
});

Then('the forecast was requested in metric units', function (this: ApiWorld) {
  const { params } = lastRequest(this, 'forecast', 'a forecast');
  const metric: Record<string, string> = {
    temperature_unit: 'celsius',
    wind_speed_unit: 'kmh',
    precipitation_unit: 'mm',
  };
  const violations = Object.entries(metric).flatMap(([param, unit]) => {
    const actual = params.get(param);
    return actual === null || actual === unit
      ? []
      : [`${param} is ${actual}, expected ${unit} (or omitted)`];
  });
  expectNoViolations(this.response, 'metric units in the forecast request', violations);
});

Then(
  'the wave forecast was requested for the same coordinates and {int} days',
  function (this: ApiWorld, days: number) {
    const forecast = lastRequest(this, 'forecast', 'a forecast').params;
    const marine = lastRequest(this, 'marine', 'a wave (marine) forecast').params;
    const violations: string[] = [];
    for (const p of ['latitude', 'longitude']) {
      if (!near(marine.get(p), Number(forecast.get(p)))) {
        violations.push(`${p}: marine ${marine.get(p)} vs forecast ${forecast.get(p)}`);
      }
    }
    // The marine API defaults to 5 days, so the service must ask for 7 explicitly.
    if (marine.get('forecast_days') !== String(days)) {
      violations.push(
        `forecast_days: expected ${days}, received ${marine.get('forecast_days') ?? '(not sent; marine default is 5)'}`,
      );
    }
    expectNoViolations(
      this.response,
      'the wave forecast to match the weather forecast request',
      violations,
    );
  },
);

Then('the weather service was not contacted', function (this: ApiWorld) {
  if (this.stub.requests.length > 0) {
    fail(
      this.history.at(-1),
      'no calls to Open-Meteo for a request that fails validation',
      `the service made ${this.stub.requests.length}:\n${this.stub.describeRequests()}`,
    );
  }
});

Then('no forecast was requested', function (this: ApiWorld) {
  const calls = [...this.stub.requestsTo('forecast'), ...this.stub.requestsTo('marine')];
  if (calls.length > 0) {
    fail(
      this.history.at(-1),
      'no forecast request when the location could not be resolved',
      `the service made ${calls.length}:\n${this.stub.describeRequests()}`,
    );
  }
});
