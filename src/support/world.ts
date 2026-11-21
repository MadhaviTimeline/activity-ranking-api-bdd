/** Per-scenario state. Cucumber creates a fresh World for every scenario. */
import { setWorldConstructor, World, type IWorldOptions } from '@cucumber/cucumber';
import { ActivityApiClient, type ApiResponse } from '../clients/activityApiClient';
import {
  ActivityRankingsResponseSchema,
  LocationSearchResponseSchema,
  type ActivityRankingsResponse,
  type Location,
  type LocationSearchResponse,
} from '../contract/schemas';
import type { CataloguePlace } from '../stubs/fixtures';
import type { OpenMeteoStub } from '../stubs/openMeteoStub';
import { expectStatus, parseBody } from '../assertions/responseAssertions';
import { config } from './config';
import { runtime } from './runtime';

export class ApiWorld extends World {
  readonly api = new ActivityApiClient(config.apiBaseUrl);
  /** Every API response in this scenario, oldest first. */
  readonly history: ApiResponse[] = [];
  /** The last city / raw input sent, for "safe error" checks. */
  lastInput?: string;
  /** Location picked from search results (search → pick → rank flow). */
  picked?: Location;
  /** Place and baseline rankings for metamorphic comparisons. */
  baselinePlace?: CataloguePlace;
  baseline?: ActivityRankingsResponse;
  /** Body fetched from the real Open-Meteo in @live scenarios. */
  liveBody?: unknown;

  constructor(options: IWorldOptions) {
    super(options);
  }

  get stub(): OpenMeteoStub {
    return runtime.stub();
  }

  record(res: ApiResponse): ApiResponse {
    this.history.push(res);
    return res;
  }

  get response(): ApiResponse {
    const last = this.history.at(-1);
    if (!last)
      throw new Error(
        'Step order error: no request has been sent to the API in this scenario yet.',
      );
    return last;
  }

  /** The last response as a successful, contract-valid activity rankings body. */
  rankings(res: ApiResponse = this.response): ActivityRankingsResponse {
    expectStatus(res, 200, 'activity rankings returned');
    return parseBody(res, ActivityRankingsResponseSchema, 'activity rankings');
  }

  /** The last response as a successful, contract-valid location search body. */
  search(res: ApiResponse = this.response): LocationSearchResponse {
    expectStatus(res, 200, 'location search succeeded');
    return parseBody(res, LocationSearchResponseSchema, 'location search');
  }
}

setWorldConstructor(ApiWorld);
