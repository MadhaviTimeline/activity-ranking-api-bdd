/**
 * Zod schemas for the Activity Ranking API contract we test against (README § API contract).
 * They are the executable version of the contract and the source of the suite's types.
 */
import { z } from 'zod';

export const ACTIVITIES = [
  'SKIING',
  'SURFING',
  'OUTDOOR_SIGHTSEEING',
  'INDOOR_SIGHTSEEING',
] as const;
export const ActivitySchema = z.enum(ACTIVITIES);
export type Activity = z.infer<typeof ActivitySchema>;

/** Display names the API is expected to return in `activityName`. */
export const ACTIVITY_NAMES: Record<Activity, string> = {
  SKIING: 'Skiing',
  SURFING: 'Surfing',
  OUTDOOR_SIGHTSEEING: 'Outdoor Sightseeing',
  INDOOR_SIGHTSEEING: 'Indoor Sightseeing',
};

export const SUITABILITIES = ['EXCELLENT', 'GOOD', 'FAIR', 'POOR'] as const;
export const SuitabilitySchema = z.enum(SUITABILITIES);
export type Suitability = z.infer<typeof SuitabilitySchema>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected an ISO date (YYYY-MM-DD)');

/** One match from GET /api/v1/locations. */
export const LocationSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  region: z.string().min(1),
  country: z.string().min(1),
  countryCode: z.string().regex(/^[A-Z]{2}$/, 'expected an ISO 3166-1 alpha-2 code'),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  timezone: z.string().min(1),
});
export type Location = z.infer<typeof LocationSchema>;

export const LocationSearchResponseSchema = z.object({
  query: z.string(),
  results: z.array(LocationSchema),
});
export type LocationSearchResponse = z.infer<typeof LocationSearchResponseSchema>;

export const RankingSchema = z.object({
  rank: z.number().int().min(1).max(4),
  activity: ActivitySchema,
  activityName: z.string().min(1),
  score: z.number().int().min(0).max(100),
  suitability: SuitabilitySchema,
  reasons: z.array(z.string().min(1)).min(1),
});
export type Ranking = z.infer<typeof RankingSchema>;

export const DaySchema = z.object({
  date: isoDate,
  rankings: z.array(RankingSchema).length(4),
});
export type Day = z.infer<typeof DaySchema>;

export const ActivityRankingsResponseSchema = z.object({
  location: LocationSchema.omit({ region: true, countryCode: true }).extend({
    region: z.string().optional(),
    countryCode: z.string().optional(),
  }),
  generatedAt: z.iso.datetime({ offset: true }),
  forecastDays: z.literal(7),
  days: z.array(DaySchema).length(7),
});
export type ActivityRankingsResponse = z.infer<typeof ActivityRankingsResponseSchema>;

export const ERROR_CODES = [
  'INVALID_REQUEST',
  'LOCATION_NOT_FOUND',
  'AMBIGUOUS_LOCATION',
  'UPSTREAM_UNAVAILABLE',
  'UPSTREAM_TIMEOUT',
] as const;

export const ErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;

export const AmbiguousDetailsSchema = z.object({
  candidates: z.array(LocationSchema).min(2),
});
