/**
 * Builds forecast fixtures from readable day-by-day descriptions (Gherkin data tables)
 * and from "everything else equal" baselines used by the metamorphic scenarios.
 */
import type { ForecastFixture } from '../contract/openMeteoSchemas';
import { forecastFixture } from './fixtures';

/** Plain-English weather → WMO weather code (https://open-meteo.com/en/docs, "WMO Weather interpretation codes"). */
const WEATHER_CODES: Record<string, number> = {
  clear: 0,
  'mainly clear': 1,
  'partly cloudy': 2,
  overcast: 3,
  fog: 45,
  drizzle: 53,
  'light rain': 61,
  rain: 63,
  'heavy rain': 65,
  'light snow': 71,
  snow: 73,
  'heavy snow': 75,
  showers: 80,
  thunderstorm: 95,
};

export interface DayWeather {
  weather: string;
  maxC: number;
  minC: number;
  snowfallCm: number;
  rainMm: number;
  windKmh: number;
  sunshineHours: number;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

export function weatherCode(weather: string): number {
  const code = WEATHER_CODES[weather.trim().toLowerCase()];
  if (code === undefined) {
    throw new Error(
      `Test setup error: unknown weather "${weather}". Use one of: ${Object.keys(WEATHER_CODES).join(', ')}.`,
    );
  }
  return code;
}

/** Turns 7 day descriptions into an Open-Meteo style daily block with consistent derived values. */
export function buildForecast(description: string, days: DayWeather[]): ForecastFixture {
  if (days.length !== 7) {
    throw new Error(`Test setup error: a forecast needs exactly 7 days, got ${days.length}.`);
  }
  const col = (fn: (d: DayWeather) => number): number[] => days.map(fn);
  return {
    description,
    daily_units: forecastFixture('mild-settled').daily_units,
    daily: {
      weather_code: col((d) => weatherCode(d.weather)),
      temperature_2m_max: col((d) => d.maxC),
      temperature_2m_min: col((d) => d.minC),
      // Open-Meteo docs: precipitation includes snow's water equivalent (7 cm of snow ≈ 10 mm of water).
      precipitation_sum: col((d) => round1(d.rainMm + d.snowfallCm / 0.7)),
      rain_sum: col((d) => d.rainMm),
      snowfall_sum: col((d) => d.snowfallCm),
      precipitation_probability_max: col((d) => (d.rainMm + d.snowfallCm > 0.5 ? 90 : 5)),
      wind_speed_10m_max: col((d) => d.windKmh),
      wind_gusts_10m_max: col((d) => round1(d.windKmh * 1.6)),
      sunshine_duration: col((d) => Math.round(d.sunshineHours * 3600)),
    },
  };
}

/** Parses a day selector such as "1", "2-7" into 1-based day numbers. */
export function parseDays(selector: string): number[] {
  const match = /^\s*(\d)\s*(?:-\s*(\d)\s*)?$/.exec(selector);
  if (!match)
    throw new Error(`Test setup error: bad day selector "${selector}" (use "3" or "1-3").`);
  const from = Number(match[1]);
  const to = Number(match[2] ?? match[1]);
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

/** A cold, otherwise unchanging alpine week where only daily snowfall varies. */
export function coldWeekWithSnowfall(snowfallCm: number): ForecastFixture {
  const weather = snowfallCm === 0 ? 'overcast' : snowfallCm < 20 ? 'snow' : 'heavy snow';
  const day: DayWeather = {
    weather,
    maxC: -3,
    minC: -10,
    snowfallCm,
    rainMm: 0,
    windKmh: 12,
    sunshineHours: 2,
  };
  return buildForecast(`Cold week with ${snowfallCm} cm of snow a day`, Array(7).fill(day));
}

/** A mild, otherwise unchanging week where only daily rain varies. */
export function mildWeekWithRain(rainMm: number): ForecastFixture {
  const weather =
    rainMm === 0 ? 'overcast' : rainMm < 10 ? 'light rain' : rainMm < 30 ? 'rain' : 'heavy rain';
  const day: DayWeather = {
    weather,
    maxC: 20,
    minC: 11,
    snowfallCm: 0,
    rainMm,
    windKmh: 10,
    sunshineHours: 4,
  };
  return buildForecast(`Mild week with ${rainMm} mm of rain a day`, Array(7).fill(day));
}
