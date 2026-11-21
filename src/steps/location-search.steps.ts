import { Then, When, type DataTable } from '@cucumber/cucumber';
import { expect } from 'expect';
import {
  expectJsonContentType,
  expectNoViolations,
  fail,
  verify,
} from '../assertions/responseAssertions';
import type { ApiWorld } from '../support/world';

When('I search for locations matching {string}', async function (this: ApiWorld, query: string) {
  this.lastInput = query;
  this.record(await this.api.searchLocations(query));
});

When(
  'I search for locations matching {string} with a limit of {string}',
  async function (this: ApiWorld, query: string, limit: string) {
    this.lastInput = query;
    this.record(await this.api.searchLocations(query, limit));
  },
);

When(
  'I search for locations with the raw query {string}',
  async function (this: ApiWorld, raw: string) {
    this.lastInput = raw;
    this.record(await this.api.searchLocationsRaw(raw));
  },
);

Then('the search succeeds', function (this: ApiWorld) {
  this.search();
});

Then('the search response matches the location search contract', function (this: ApiWorld) {
  this.search();
  expectJsonContentType(this.response);
});

Then('the matches include:', function (this: ApiWorld, table: DataTable) {
  const { results } = this.search();
  const missing = table
    .hashes()
    .filter(
      (row) =>
        !results.some(
          (r) => r.name === row.name && r.region === row.region && r.country === row.country,
        ),
    )
    .map((row) => `${row.name}, ${row.region}, ${row.country} is missing`);
  expectNoViolations(this.response, 'all of these places among the matches', missing);
});

Then(
  'every match has an id, name, region, country, country code, coordinates and timezone',
  function (this: ApiWorld) {
    // Field presence and types are enforced by the contract schema inside search().
    const { results } = this.search();
    if (results.length === 0)
      fail(this.response, 'at least one match to inspect', 'there were none');
  },
);

Then('no two matches share the same name, region and country', function (this: ApiWorld) {
  const { results } = this.search();
  const labels = results.map((r) => `${r.name}, ${r.region}, ${r.country}`);
  const duplicates = labels.filter((l, i) => labels.indexOf(l) !== i);
  expectNoViolations(
    this.response,
    'every match to be distinguishable in a picker',
    duplicates.map((d) => `"${d}" appears more than once`),
  );
});

Then('the matches are listed in this order:', function (this: ApiWorld, table: DataTable) {
  const { results } = this.search();
  const expected = table.hashes().map((row) => `${row['name']} (${row['country code']})`);
  const actual = results.slice(0, expected.length).map((r) => `${r.name} (${r.countryCode})`);
  verify(this.response, 'matches in relevance order', () => expect(actual).toEqual(expected));
});

Then(
  'the matches are the same as for a search for {string}',
  async function (this: ApiWorld, reference: string) {
    const { results } = this.search();
    const referenceResponse = await this.api.searchLocations(reference);
    const expected = this.search(referenceResponse).results;
    verify(this.response, `the same matches as a search for "${reference}"`, () =>
      expect(results.map((r) => r.id)).toEqual(expected.map((r) => r.id)),
    );
  },
);

Then(
  'the place-name directory was asked about {string} without surrounding whitespace',
  function (this: ApiWorld, expected: string) {
    const names = this.stub.requestsTo('geocoding').map((r) => r.params.get('name') ?? '');
    if (names.length === 0) fail(this.response, 'a geocoding request', 'the service made none');
    const wrong = names.filter((n) => n.toLowerCase() !== expected.toLowerCase());
    expectNoViolations(
      this.response,
      `the geocoding search text to be "${expected}" (any case, trimmed)`,
      wrong.map((n) => `asked for "${n}"`),
    );
  },
);

Then(
  'the first match is named {string} in {string}',
  function (this: ApiWorld, name: string, country: string) {
    const first = this.search().results[0];
    if (!first) fail(this.response, `a first match named "${name}"`, 'there were no matches');
    verify(this.response, `the first match to be ${name}, ${country}`, () =>
      expect({ name: first.name, country: first.country }).toEqual({ name, country }),
    );
  },
);

Then('there are no matches', function (this: ApiWorld) {
  const { results } = this.search();
  if (results.length !== 0)
    fail(this.response, 'an empty list of matches', `received ${results.length}`);
});

Then('there are exactly {int} matches', function (this: ApiWorld, count: number) {
  const { results } = this.search();
  if (results.length !== count)
    fail(this.response, `${count} matches`, `received ${results.length}`);
});
