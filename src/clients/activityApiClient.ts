/** Thin typed wrapper over fetch for the Activity Ranking API. No retries, no magic. */

export interface ApiResponse {
  method: string;
  url: string;
  status: number;
  contentType: string;
  bodyText: string;
  /** Parsed JSON body, or undefined when the body is not valid JSON. */
  json: unknown;
  elapsedMs: number;
}

/**
 * Expands the "[N x c]" shorthand used in feature files for long inputs,
 * e.g. "city=[101 x a]" → "city=aaaa…" (101 characters).
 */
export function expandRawQuery(raw: string): string {
  return raw.replace(/\[(\d+) x (.)\]/g, (_, count: string, ch: string) =>
    ch.repeat(Number(count)),
  );
}

export class ActivityApiClient {
  constructor(private readonly baseUrl: string) {}

  searchLocations(query: string, limit?: string): Promise<ApiResponse> {
    const params = new URLSearchParams({ query });
    if (limit !== undefined && limit !== '') params.set('limit', limit);
    return this.get(`/api/v1/locations?${params}`);
  }

  searchLocationsRaw(rawQuery: string): Promise<ApiResponse> {
    return this.get(withQuery('/api/v1/locations', expandRawQuery(rawQuery)));
  }

  rankingsForCity(city: string): Promise<ApiResponse> {
    return this.get(`/api/v1/activity-rankings?${new URLSearchParams({ city })}`);
  }

  rankingsForLocationId(locationId: number | string): Promise<ApiResponse> {
    const params = new URLSearchParams({ locationId: String(locationId) });
    return this.get(`/api/v1/activity-rankings?${params}`);
  }

  rankingsRaw(rawQuery: string): Promise<ApiResponse> {
    return this.get(withQuery('/api/v1/activity-rankings', expandRawQuery(rawQuery)));
  }

  private async get(pathAndQuery: string): Promise<ApiResponse> {
    const url = new URL(pathAndQuery, this.baseUrl).toString();
    const started = performance.now();
    let response: Response;
    try {
      response = await fetch(url, { headers: { accept: 'application/json' } });
    } catch (err) {
      const cause = (err as { cause?: { code?: string } }).cause?.code ?? (err as Error).message;
      throw new Error(
        `Could not reach the Activity Ranking API at ${url} (${cause}). ` +
          'Is it running? Set API_BASE_URL, or unset it to use the local 501 placeholder.',
        { cause: err },
      );
    }
    const bodyText = await response.text();
    let json: unknown;
    try {
      json = bodyText ? JSON.parse(bodyText) : undefined;
    } catch {
      json = undefined;
    }
    return {
      method: 'GET',
      url,
      status: response.status,
      contentType: response.headers.get('content-type') ?? '',
      bodyText,
      json,
      elapsedMs: Math.round(performance.now() - started),
    };
  }
}

function withQuery(path: string, query: string): string {
  return query ? `${path}?${query}` : path;
}
