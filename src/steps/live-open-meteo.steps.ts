/**
 * @live only: calls the real Open-Meteo APIs (not the system under test) to detect drift
 * between the real responses and the shapes our stub fixtures assume.
 */
import { Then, When, type DataTable } from '@cucumber/cucumber';
import { z } from 'zod';
import {
  FORECAST_DAILY_VARIABLES,
  ForecastResponseSchema,
  GeocodingResponseSchema,
  MARINE_DAILY_VARIABLES,
  MarineResponseSchema,
} from '../contract/openMeteoSchemas';
import { catalogue, placeNamed } from '../stubs/fixtures';
import type { ApiWorld } from '../support/world';

const LIVE = {
  geocoding: 'https://geocoding-api.open-meteo.com/v1/search',
  forecast: 'https://api.open-meteo.com/v1/forecast',
  marine: 'https://marine-api.open-meteo.com/v1/marine',
};

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok)
    throw new Error(`Live Open-Meteo call failed: ${res.status} ${url}\n${await res.text()}`);
  return res.json();
}

function check<T extends z.ZodType>(world: ApiWorld, schema: T, what: string): z.infer<T> {
  const result = schema.safeParse(world.liveBody);
  if (!result.success) {
    throw new Error(
      `Real Open-Meteo ${what} no longer matches our fixture shape — update the fixtures:\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}

When(
  'I search the real Open-Meteo place-name directory for {string}',
  async function (this: ApiWorld, name: string) {
    this.liveBody = await getJson(
      `${LIVE.geocoding}?${new URLSearchParams({ name, count: '10', language: 'en', format: 'json' })}`,
    );
  },
);

When('I fetch the real 7-day Open-Meteo forecast for London', async function (this: ApiWorld) {
  // 'London' is deliberately ambiguous in the catalogue, so pick London, GB explicitly.
  const london = catalogue().find((p) => p.name === 'London' && p.country_code === 'GB');
  if (!london)
    throw new Error('Test setup error: London, GB is missing from the fixture catalogue.');
  const params = new URLSearchParams({
    latitude: String(london.latitude),
    longitude: String(london.longitude),
    daily: FORECAST_DAILY_VARIABLES.join(','),
    timezone: london.timezone,
    forecast_days: '7',
  });
  this.liveBody = await getJson(`${LIVE.forecast}?${params}`);
});

When(
  'I fetch the real 7-day Open-Meteo wave forecast for Newquay',
  async function (this: ApiWorld) {
    const newquay = placeNamed('Newquay');
    const params = new URLSearchParams({
      latitude: String(newquay.latitude),
      longitude: String(newquay.longitude),
      daily: MARINE_DAILY_VARIABLES.join(','),
      timezone: newquay.timezone,
      forecast_days: '7',
    });
    this.liveBody = await getJson(`${LIVE.marine}?${params}`);
  },
);

Then('the real search results match the geocoding fixture shape', function (this: ApiWorld) {
  const body = check(this, GeocodingResponseSchema, 'geocoding response');
  if (!body.results?.length)
    throw new Error('Real geocoding returned no results for a well-known city.');
});

Then(
  'the real search results include {string} in {string} with timezone {string}',
  function (this: ApiWorld, name: string, countryCode: string, timezone: string) {
    const { results = [] } = check(this, GeocodingResponseSchema, 'geocoding response');
    const found = results.some(
      (r) => r.name === name && r.country_code === countryCode && r.timezone === timezone,
    );
    if (!found)
      throw new Error(
        `Expected ${name} (${countryCode}, ${timezone}) among real results, got ${results.map((r) => `${r.name} ${r.country_code}`).join(', ')}`,
      );
  },
);

Then('the real forecast matches the forecast fixture shape', function (this: ApiWorld) {
  check(this, ForecastResponseSchema, 'forecast response');
});

Then('the real wave forecast matches the marine fixture shape', function (this: ApiWorld) {
  check(this, MarineResponseSchema, 'marine response');
});

Then('every daily variable has {int} values', function (this: ApiWorld, count: number) {
  const { daily } = check(
    this,
    z.object({ daily: z.record(z.string(), z.array(z.unknown())) }),
    'daily block',
  );
  const wrong = Object.entries(daily).filter(([, values]) => values.length !== count);
  if (wrong.length)
    throw new Error(
      `Expected ${count} values per daily variable: ${wrong.map(([k, v]) => `${k}=${v.length}`).join(', ')}`,
    );
});

Then('the daily units are:', function (this: ApiWorld, table: DataTable) {
  const { daily_units } = check(
    this,
    z.object({ daily_units: z.record(z.string(), z.string()) }),
    'daily units',
  );
  const wrong = table.hashes().filter((r) => daily_units[r['variable'] ?? ''] !== r['unit']);
  if (wrong.length) {
    throw new Error(
      `Unit drift: ${wrong.map((r) => `${r['variable']} expected ${r['unit']}, got ${daily_units[r['variable'] ?? '']}`).join('; ')}`,
    );
  }
});
