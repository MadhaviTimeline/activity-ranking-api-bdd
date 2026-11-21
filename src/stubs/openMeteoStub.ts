/**
 * Programmable stand-in for the three Open-Meteo APIs the service depends on.
 *
 *   /geocoding/search  ← OPEN_METEO_GEOCODING_URL   (geocoding-api.open-meteo.com/v1/search)
 *   /geocoding/get     ← sibling "get by id" route  (geocoding-api.open-meteo.com/v1/get)
 *   /forecast          ← OPEN_METEO_FORECAST_URL    (api.open-meteo.com/v1/forecast)
 *   /marine            ← OPEN_METEO_MARINE_URL      (marine-api.open-meteo.com/v1/marine)
 *
 * Scenarios program the weather per place, inject faults per endpoint, and inspect
 * every request the service sent. reset() runs before every scenario.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  ForecastResponseSchema,
  GeocodingResponseSchema,
  MarineResponseSchema,
  type ForecastFixture,
} from '../contract/openMeteoSchemas';
import {
  datesFromToday,
  isValidTimeZone,
  timezoneAbbreviation,
  utcOffsetSeconds,
} from '../support/dates';
import {
  catalogue,
  defaultMarineFor,
  forecastFixture,
  toGeocodingResult,
  type CataloguePlace,
} from './fixtures';

export type Endpoint = 'geocoding' | 'forecast' | 'marine';

export type Fault =
  | { kind: 'status'; status: number }
  | { kind: 'invalid-json' }
  | { kind: 'no-daily' }
  | { kind: 'missing-variable'; variable: string }
  | { kind: 'short'; days: number }
  | { kind: 'open-meteo-error' }
  | { kind: 'delay'; ms: number };

export interface RecordedRequest {
  endpoint: Endpoint;
  path: string;
  params: URLSearchParams;
  receivedAt: number;
}

interface PlaceWeather {
  place: CataloguePlace;
  forecast: ForecastFixture;
  marine: ForecastFixture;
}

const ROUTES: Record<string, Endpoint> = {
  '/geocoding/search': 'geocoding',
  '/geocoding/get': 'geocoding',
  '/forecast': 'forecast',
  '/marine': 'marine',
};

/** How close (degrees) a requested lat/long must be to a programmed place to count as that place. */
const COORDINATE_TOLERANCE = 0.1;

export class OpenMeteoStub {
  private readonly requestLog: RecordedRequest[] = [];
  private readonly weather = new Map<number, PlaceWeather>();
  private readonly faults = new Map<Endpoint, Fault>();
  private readonly timers = new Set<NodeJS.Timeout>();

  private constructor(private readonly server: http.Server) {}

  static async start(port: number): Promise<OpenMeteoStub> {
    const server = http.createServer();
    const stub = new OpenMeteoStub(server);
    server.on('request', (req: http.IncomingMessage, res: http.ServerResponse) =>
      stub.handle(req, res),
    );
    await new Promise<void>((resolve, reject) => {
      server.once('error', (err) =>
        reject(new Error(`Open-Meteo stub could not listen on port ${port}: ${err.message}`)),
      );
      server.listen(port, resolve); // all interfaces, so both localhost (::1) and 127.0.0.1 work
    });
    return stub;
  }

  get baseUrl(): string {
    const { port } = this.server.address() as AddressInfo;
    return `http://127.0.0.1:${port}`;
  }

  reset(): void {
    this.requestLog.length = 0;
    this.weather.clear();
    this.faults.clear();
    this.timers.forEach(clearTimeout);
    this.timers.clear();
  }

  async stop(): Promise<void> {
    this.reset();
    this.server.closeAllConnections();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  // ---- Programming --------------------------------------------------------------------------

  setWeather(place: CataloguePlace, forecast: ForecastFixture, marine?: ForecastFixture): void {
    const existing = this.weather.get(place.id);
    this.weather.set(place.id, {
      place,
      forecast,
      marine: marine ?? existing?.marine ?? defaultMarineFor(place),
    });
  }

  setMarine(place: CataloguePlace, marine: ForecastFixture): void {
    const existing = this.weather.get(place.id);
    this.weather.set(place.id, {
      place,
      forecast: existing?.forecast ?? forecastFixture('mild-settled'),
      marine,
    });
  }

  injectFault(endpoint: Endpoint, fault: Fault): void {
    this.faults.set(endpoint, fault);
  }

  // ---- Inspection ---------------------------------------------------------------------------

  get requests(): readonly RecordedRequest[] {
    return this.requestLog;
  }

  requestsTo(endpoint: Endpoint): RecordedRequest[] {
    return this.requestLog.filter((r) => r.endpoint === endpoint);
  }

  /** A readable summary of what the service asked for; attached to reports on failure. */
  describeRequests(): string {
    if (this.requestLog.length === 0) return '(the service made no requests to Open-Meteo)';
    return this.requestLog.map((r) => `${r.path}?${r.params.toString()}`).join('\n');
  }

  // ---- HTTP handling ------------------------------------------------------------------------

  private handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url ?? '/', 'http://stub');
    const endpoint = ROUTES[url.pathname];
    if (!endpoint) {
      send(res, 404, { error: true, reason: `Stub has no route ${url.pathname}` });
      return;
    }
    this.requestLog.push({
      endpoint,
      path: url.pathname,
      params: url.searchParams,
      receivedAt: Date.now(),
    });

    const fault = this.faults.get(endpoint);
    const respond = (): void => this.respond(endpoint, url, fault, res);
    if (fault?.kind === 'delay') {
      const timer = setTimeout(() => {
        this.timers.delete(timer);
        if (!res.writableEnded) respond();
      }, fault.ms);
      this.timers.add(timer);
      return;
    }
    respond();
  }

  private respond(
    endpoint: Endpoint,
    url: URL,
    fault: Fault | undefined,
    res: http.ServerResponse,
  ): void {
    switch (fault?.kind) {
      case 'status':
        send(res, fault.status, { error: true, reason: 'Internal Server Error' });
        return;
      case 'invalid-json':
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{"latitude": 46.0, "daily": {"time": ["2026-');
        return;
      case 'open-meteo-error':
        send(res, 400, {
          error: true,
          reason:
            'Cannot initialize WeatherVariable from invalid String value snowfal_sum for key daily',
        });
        return;
    }

    try {
      if (url.pathname === '/geocoding/search') return this.geocodingSearch(url, res);
      if (url.pathname === '/geocoding/get') return this.geocodingGet(url, res);
      return this.weatherResponse(endpoint, url, fault, res);
    } catch (err) {
      send(res, 400, { error: true, reason: (err as Error).message });
    }
  }

  /** Mirrors documented Open-Meteo search behaviour: <2 chars no results, 2 chars exact, 3+ prefix. */
  private geocodingSearch(url: URL, res: http.ServerResponse): void {
    const name = (url.searchParams.get('name') ?? '').toLocaleLowerCase();
    const count = Number(url.searchParams.get('count') ?? 10);
    if (!Number.isInteger(count) || count < 1 || count > 100) {
      send(res, 400, { error: true, reason: 'Parameter count must be between 1 and 100.' });
      return;
    }
    const matches =
      name.length < 2
        ? []
        : catalogue().filter((p) => {
            const candidate = p.name.toLocaleLowerCase();
            return name.length === 2 ? candidate === name : candidate.startsWith(name);
          });
    const body = {
      ...(matches.length > 0 && { results: matches.slice(0, count).map(toGeocodingResult) }),
      generationtime_ms: 0.4,
    };
    send(res, 200, GeocodingResponseSchema.parse(body));
  }

  private geocodingGet(url: URL, res: http.ServerResponse): void {
    const id = Number(url.searchParams.get('id'));
    const place = catalogue().find((p) => p.id === id);
    if (!place) {
      send(res, 400, {
        error: true,
        reason: `No location found for id ${url.searchParams.get('id')}`,
      });
      return;
    }
    send(res, 200, toGeocodingResult(place));
  }

  private weatherResponse(
    endpoint: Endpoint,
    url: URL,
    fault: Fault | undefined,
    res: http.ServerResponse,
  ): void {
    const latitude = Number(url.searchParams.get('latitude'));
    const longitude = Number(url.searchParams.get('longitude'));
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new Error('Parameter latitude and longitude must be numbers');
    }
    const programmed = this.weatherAt(latitude, longitude);
    const fixture = endpoint === 'marine' ? programmed.marine : programmed.forecast;

    const tzParam = url.searchParams.get('timezone') ?? 'GMT';
    const timezone = tzParam === 'auto' ? programmed.place.timezone : tzParam;
    if (!isValidTimeZone(timezone)) throw new Error(`Invalid timezone ${tzParam}`);

    const defaultDays = endpoint === 'marine' ? 5 : 7;
    const requestedDays = Number(url.searchParams.get('forecast_days') ?? defaultDays);
    let dayCount = Math.min(requestedDays, 7);
    if (fault?.kind === 'short') dayCount = Math.min(dayCount, fault.days);

    // Open-Meteo only returns the variables that were asked for ("daily=a,b" or repeated "daily=").
    const requested = url.searchParams
      .getAll('daily')
      .flatMap((v) => v.split(','))
      .map((v) => v.trim())
      .filter(Boolean);
    const variables = Object.keys(fixture.daily).filter(
      (v) => requested.length === 0 || requested.includes(v),
    );

    const daily: Record<string, (number | null)[] | string[]> = {
      time: datesFromToday(timezone, dayCount),
    };
    const dailyUnits: Record<string, string> = { time: 'iso8601' };
    for (const variable of variables) {
      if (fault?.kind === 'missing-variable' && fault.variable === variable) continue;
      daily[variable] = (fixture.daily[variable] ?? []).slice(0, dayCount);
      dailyUnits[variable] = fixture.daily_units[variable] ?? '';
    }

    const body: Record<string, unknown> = {
      latitude: round(latitude, 4),
      longitude: round(longitude, 4),
      generationtime_ms: 0.9,
      utc_offset_seconds: utcOffsetSeconds(timezone),
      timezone,
      timezone_abbreviation: timezoneAbbreviation(timezone),
      ...(endpoint === 'forecast' && { elevation: programmed.place.elevation ?? 0 }),
      daily_units: dailyUnits,
      daily,
    };
    if (fault?.kind === 'no-daily') {
      delete body.daily;
      delete body.daily_units;
      send(res, 200, body);
      return;
    }
    const schema = endpoint === 'marine' ? MarineResponseSchema : ForecastResponseSchema;
    send(res, 200, schema.parse(body));
  }

  /** Weather programmed for the nearest place; otherwise a mild default for whatever is there. */
  private weatherAt(latitude: number, longitude: number): PlaceWeather {
    const near = (p: CataloguePlace): boolean =>
      Math.abs(p.latitude - latitude) <= COORDINATE_TOLERANCE &&
      Math.abs(p.longitude - longitude) <= COORDINATE_TOLERANCE;
    const programmed = [...this.weather.values()].find((w) => near(w.place));
    if (programmed) return programmed;
    const place: CataloguePlace = catalogue().find(near) ?? {
      id: 0,
      name: 'Unknown',
      latitude,
      longitude,
      country_code: 'XX',
      country: 'Unknown',
      timezone: 'GMT',
      x_coastal: false,
    };
    return { place, forecast: forecastFixture('mild-settled'), marine: defaultMarineFor(place) };
  }
}

function send(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
