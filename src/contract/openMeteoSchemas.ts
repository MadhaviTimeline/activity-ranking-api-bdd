/**
 * Shapes of the Open-Meteo responses our fixtures imitate, taken from the public docs
 * (open-meteo.com/en/docs, /docs/geocoding-api, /docs/marine-weather-api).
 * The stub validates every response it builds against them, and the @live scenarios
 * check the real APIs against the same schemas, which is how we detect contract drift.
 */
import { z } from 'zod';

export const GeocodingResultSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  elevation: z.number().optional(),
  feature_code: z.string().optional(),
  country_code: z.string().length(2),
  country: z.string(),
  country_id: z.number().int().optional(),
  admin1: z.string().optional(),
  admin1_id: z.number().int().optional(),
  admin2: z.string().optional(),
  timezone: z.string(),
  population: z.number().int().optional(),
  postcodes: z.array(z.string()).optional(),
});
export type GeocodingResult = z.infer<typeof GeocodingResultSchema>;

/** Open-Meteo omits `results` entirely when nothing matches. */
export const GeocodingResponseSchema = z.object({
  results: z.array(GeocodingResultSchema).optional(),
  generationtime_ms: z.number(),
});

/** Daily variables the fixtures provide. The SUT may request any subset of them. */
export const FORECAST_DAILY_VARIABLES = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_sum',
  'rain_sum',
  'snowfall_sum',
  'precipitation_probability_max',
  'wind_speed_10m_max',
  'wind_gusts_10m_max',
  'sunshine_duration',
] as const;
export type ForecastDailyVariable = (typeof FORECAST_DAILY_VARIABLES)[number];

export const MARINE_DAILY_VARIABLES = [
  'wave_height_max',
  'wave_period_max',
  'swell_wave_height_max',
] as const;
export type MarineDailyVariable = (typeof MARINE_DAILY_VARIABLES)[number];

const series = z.array(z.number().nullable());

const envelope = {
  latitude: z.number(),
  longitude: z.number(),
  generationtime_ms: z.number(),
  utc_offset_seconds: z.number().int(),
  timezone: z.string(),
  timezone_abbreviation: z.string(),
};

export const ForecastResponseSchema = z.object({
  ...envelope,
  elevation: z.number(),
  daily_units: z.record(z.string(), z.string()),
  daily: z.object({ time: z.array(z.string()) }).catchall(series),
});
export type ForecastResponse = z.infer<typeof ForecastResponseSchema>;

export const MarineResponseSchema = z.object({
  ...envelope,
  daily_units: z.record(z.string(), z.string()),
  daily: z.object({ time: z.array(z.string()) }).catchall(series),
});
export type MarineResponse = z.infer<typeof MarineResponseSchema>;

/** Error body Open-Meteo returns with HTTP 400. */
export const OpenMeteoErrorSchema = z.object({ error: z.literal(true), reason: z.string() });

/** Fixture files: an Open-Meteo `daily` block without the `time` array (dates are added at runtime). */
export const ForecastFixtureSchema = z.object({
  description: z.string(),
  daily_units: z.record(z.string(), z.string()),
  daily: z.record(z.string(), z.array(z.number().nullable()).length(7)),
});
export type ForecastFixture = z.infer<typeof ForecastFixtureSchema>;
