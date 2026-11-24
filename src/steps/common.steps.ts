/** Error envelope, status and "what did the service ask Open-Meteo for" steps shared by all features. */
import { Then } from '@cucumber/cucumber';
import {
  expectError,
  expectJsonContentType,
  expectNoViolations,
  fail,
  parseBody,
} from '../assertions/responseAssertions';
import { AmbiguousDetailsSchema, ErrorEnvelopeSchema } from '../contract/schemas';
import { config } from '../support/config';
import type { ApiWorld } from '../support/world';

Then(
  'the request is rejected as invalid with a message about {string}',
  function (this: ApiWorld, parameter: string) {
    const error = expectError(this.response, 400, 'INVALID_REQUEST');
    if (!error.message.toLowerCase().includes(parameter.toLowerCase())) {
      fail(
        this.response,
        `the error message to name the offending parameter "${parameter}"`,
        `it says "${error.message}"`,
      );
    }
  },
);

Then('the location is reported as not found', function (this: ApiWorld) {
  expectError(this.response, 404, 'LOCATION_NOT_FOUND');
});

Then('the location is reported as ambiguous', function (this: ApiWorld) {
  expectError(this.response, 409, 'AMBIGUOUS_LOCATION');
});

Then('the weather provider is reported as unavailable', function (this: ApiWorld) {
  expectError(this.response, 502, 'UPSTREAM_UNAVAILABLE');
});

Then('the weather provider is reported as timing out', function (this: ApiWorld) {
  expectError(this.response, 504, 'UPSTREAM_TIMEOUT');
});

Then('the error message mentions {string}', function (this: ApiWorld, text: string) {
  const { error } = parseBody(this.response, ErrorEnvelopeSchema, 'error envelope');
  if (!error.message.includes(text)) {
    fail(this.response, `the error message to mention "${text}"`, `it says "${error.message}"`);
  }
});

Then('the error message contains no HTML markup', function (this: ApiWorld) {
  const { error } = parseBody(this.response, ErrorEnvelopeSchema, 'error envelope');
  if (/<\s*\/?\s*[a-z!][^>]*>/i.test(error.message)) {
    fail(
      this.response,
      'an error message without HTML markup (it may be rendered by the UI)',
      `it says "${error.message}"`,
    );
  }
});

Then('the error response is safe to show to users', function (this: ApiWorld) {
  const res = this.response;
  expectJsonContentType(res);
  parseBody(res, ErrorEnvelopeSchema, 'error envelope');
  const leaks: [RegExp, string][] = [
    [/\bat\s+\S+\s+\(?[^)]*:\d+:\d+\)?/, 'a stack trace frame'],
    [/node_modules|\.ts:\d+|\.js:\d+/, 'a source file reference'],
    [/open-meteo\.com|\/v1\/forecast|\/v1\/marine|\/v1\/search/i, 'an Open-Meteo URL'],
    [new RegExp(`:${config.stubPort}\\b`), 'the upstream (stub) address'],
  ];
  expectNoViolations(
    res,
    'an error body with no stack traces or upstream URLs',
    leaks
      .filter(([pattern]) => pattern.test(res.bodyText))
      .map(([, what]) => `the body contains ${what}`),
  );
});

Then('no rankings are returned', function (this: ApiWorld) {
  const body = this.response.json;
  if (body && typeof body === 'object' && 'days' in body) {
    fail(this.response, 'no ranking data in an error response', 'the body contains "days"');
  }
});

Then(
  'the response arrived within the configured upstream timeout plus {int} seconds',
  function (this: ApiWorld, marginSeconds: number) {
    const budget = config.upstreamTimeoutMs + marginSeconds * 1000;
    if (this.response.elapsedMs > budget) {
      fail(
        this.response,
        `a response within ${budget} ms`,
        `it took ${this.response.elapsedMs} ms`,
      );
    }
  },
);

Then(
  'the candidates include:',
  function (this: ApiWorld, table: { hashes(): Record<string, string>[] }) {
    const error = expectError(this.response, 409, 'AMBIGUOUS_LOCATION');
    const { candidates } = parseBody(
      { ...this.response, json: error.details ?? {} },
      AmbiguousDetailsSchema,
      'ambiguous-location details',
    );
    const missing = table
      .hashes()
      .filter(
        (row) =>
          !candidates.some(
            (c) => c.name === row.name && c.region === row.region && c.country === row.country,
          ),
      )
      .map((row) => `${row.name}, ${row.region}, ${row.country} is not among the candidates`);
    expectNoViolations(this.response, 'every listed place to be offered as a candidate', missing);
  },
);

Then('every candidate has the same shape as a location search match', function (this: ApiWorld) {
  const { error } = parseBody(this.response, ErrorEnvelopeSchema, 'error envelope');
  parseBody(
    { ...this.response, json: error.details ?? {} },
    AmbiguousDetailsSchema,
    'ambiguous-location details (candidates must match /locations results)',
  );
});
