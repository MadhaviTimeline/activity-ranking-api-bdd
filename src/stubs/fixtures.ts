/**
 * Loads and builds Open-Meteo fixtures. Fixture files hold 7 days of values without dates;
 * dates are attached at request time (see openMeteoStub.ts) so fixtures never go stale.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import {
  ForecastFixtureSchema,
  GeocodingResultSchema,
  type ForecastFixture,
  type GeocodingResult,
} from '../contract/openMeteoSchemas';

const FIXTURE_ROOT = path.resolve(__dirname, '../../test/fixtures/open-meteo');

const CatalogueEntrySchema = GeocodingResultSchema.extend({ x_coastal: z.boolean() });
export type CataloguePlace = z.infer<typeof CatalogueEntrySchema>;

function readJson(relative: string): unknown {
  const file = path.join(FIXTURE_ROOT, relative);
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`Could not read fixture ${relative}: ${(err as Error).message}`, {
      cause: err,
    });
  }
}

let catalogueCache: CataloguePlace[] | undefined;

/** The reference place-name directory, ordered by relevance (population, highest first). */
export function catalogue(): CataloguePlace[] {
  catalogueCache ??= z
    .object({ results: z.array(CatalogueEntrySchema) })
    .parse(readJson('geocoding/catalogue.json'))
    .results.sort((a, b) => (b.population ?? 0) - (a.population ?? 0));
  return catalogueCache;
}

/** Strips stub-only fields so the result looks exactly like an Open-Meteo geocoding result. */
export function toGeocodingResult(place: CataloguePlace): GeocodingResult {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { x_coastal, ...result } = place;
  return result;
}

/** Finds the single catalogue place with this exact name. Used by Given steps to program weather. */
export function placeNamed(name: string): CataloguePlace {
  const matches = catalogue().filter((p) => p.name === name);
  if (matches.length !== 1) {
    throw new Error(
      `Test setup error: expected exactly one place named "${name}" in the fixture catalogue, found ${matches.length}.`,
    );
  }
  return matches[0] as CataloguePlace;
}

export function forecastFixture(name: string): ForecastFixture {
  return ForecastFixtureSchema.parse(readJson(`forecast/${name}.json`));
}

export function marineFixture(name: string): ForecastFixture {
  return ForecastFixtureSchema.parse(readJson(`marine/${name}.json`));
}

export function hasMarineFixture(name: string): boolean {
  try {
    marineFixture(name);
    return true;
  } catch {
    return false;
  }
}

/** Default wave data for a place: calm sea on the coast, no data inland. */
export function defaultMarineFor(place: CataloguePlace): ForecastFixture {
  return marineFixture(place.x_coastal ? 'calm-sea' : 'no-wave-data');
}
