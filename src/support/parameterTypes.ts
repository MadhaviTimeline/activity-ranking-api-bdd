/** Cucumber parameter types so steps read naturally: {activity}, {suitability}, {ordinal}. */
import { defineParameterType } from '@cucumber/cucumber';
import { SUITABILITIES, type Activity, type Suitability } from '../contract/schemas';

export const ACTIVITY_BY_NAME: Record<string, Activity> = {
  Skiing: 'SKIING',
  Surfing: 'SURFING',
  'Outdoor Sightseeing': 'OUTDOOR_SIGHTSEEING',
  'Indoor Sightseeing': 'INDOOR_SIGHTSEEING',
};

/** Regex source matching any activity display name; for steps written as regular expressions. */
export const ACTIVITY_PATTERN = Object.keys(ACTIVITY_BY_NAME).join('|');

/** Accepts a display name ("Outdoor Sightseeing") or, from regex steps, an already-converted enum. */
export function toActivity(name: string): Activity {
  const activity =
    ACTIVITY_BY_NAME[name] ?? Object.values(ACTIVITY_BY_NAME).find((a) => a === name);
  if (!activity) throw new Error(`Unknown activity "${name}"`);
  return activity;
}

defineParameterType({
  name: 'activity',
  regexp: new RegExp(ACTIVITY_PATTERN),
  transformer: (name: string): Activity => toActivity(name),
});

defineParameterType({
  name: 'suitability',
  regexp: new RegExp(SUITABILITIES.join('|')),
  transformer: (value: string): Suitability => value as Suitability,
});

defineParameterType({
  name: 'ordinal',
  regexp: /(\d+)(?:st|nd|rd|th)/,
  transformer: (n: string): number => Number(n),
});
