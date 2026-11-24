# CLAUDE.md — SDET Test: Activity Ranking API (Spec-First BDD Suite)

## 1. Mission

Build a **public GitHub repository** that contains a **specification-first BDD test suite** for an API that **does not exist yet**. We write the tests before the code, the way a real BDD team would.

What to deliver:
1. **Gherkin feature files** (BDD acceptance criteria)
2. **Runnable automated tests** in **TypeScript**, using **Cucumber.js**, that implement those scenarios
3. **README.md** covering the approach, the API contract and assumptions we test against, and any omissions or trade-offs

**Expected end state:** the suite runs cleanly and **fails in a meaningful way** (a red build) because the implementation is missing. Each failure must point to intended behaviour, for example `expected status 200, received 501` or `expected 7 days, received 0`. Crashes, connection errors, TypeScript errors and undefined steps do not count as meaningful failures.

The reviewers judge **clarity, coverage and realistic testing approaches**. They use AI daily and want candidates to do the same, so the README should say briefly how AI was used.

---

## 2. The feature ticket (source of truth)

**Title:** Activity Ranking API – City-Based Weather Forecast Integration

**Story:** As a user, I want to enter a city or town name and receive a ranked list of activities (Skiing, Surfing, Outdoor Sightseeing, Indoor Sightseeing) for the next 7 days, based on weather conditions.

We are testing an API, not a UI. For the API to be fit for purpose, though, the tests must take the **front-end user experience** into account (autocomplete, ambiguous names, clear reasoning text, predictable ordering, useful error messages).

**Acceptance criteria:**
- The API accepts a city or town name as input.
  - It also accepts a **partial name** and returns a **list of possible matches**.
- It fetches 7-day weather data using **Open-Meteo**.
- It ranks each day for each activity by weather suitability.
- For each day and each activity, the response includes:
  - Date
  - Activity name
  - A measure of how suitable the conditions are
  - Reasoning (e.g. "High snowfall expected", "Clear skies and 22°C")

**Decisions we must make and document ourselves:**
- The API contract we test against
- How we handle the Open-Meteo dependency

---

## 3. Tech stack (use these unless there is a strong reason not to)

| Concern | Choice |
|---|---|
| Language | TypeScript (strict mode) |
| BDD runner | `@cucumber/cucumber` |
| TS execution | `ts-node` (or `tsx`) registered through the cucumber config |
| HTTP client | `undici` `fetch` / Node 20+ built-in `fetch` (no heavyweight client needed) |
| Assertions | `node:assert/strict` or `expect` (from `expect` package) — pick one and stay consistent |
| Schema validation | `zod` (contract schemas double as documentation) |
| Open-Meteo stub | A small **programmable HTTP stub server** written in TS on Node's `http` module (or `mockttp`), started in `BeforeAll` |
| Placeholder SUT | A tiny Node server that answers **501 Not Implemented** on every route (see §6) |
| Reports | Cucumber HTML + JSON reports in `reports/` |
| Lint/format | ESLint + Prettier (light config) |
| Node | 20 LTS or later; pin it in `.nvmrc` and `engines` |

Keep dependencies minimal. Do **not** add Playwright, Docker or WireMock unless there is a clear reason.

---

## 4. API contract (our assumption — document it in the README too)

Base URL comes from the `API_BASE_URL` env var (default `http://localhost:3000`). All responses are JSON. Errors use one consistent envelope.

### 4.1 `GET /api/v1/locations?query={text}` — search / autocomplete
For partial names. The front end calls this while the user types.

- `query` is required, trimmed, **2–100 chars**
- Case-insensitive, Unicode-safe (e.g. `Zürich`, `São Paulo`, `Llanfair…`)
- Returns at most `limit` results (default 10, max 20)

**200 OK**
```json
{
  "query": "Lon",
  "results": [
    {
      "id": 2643743,
      "name": "London",
      "region": "England",
      "country": "United Kingdom",
      "countryCode": "GB",
      "latitude": 51.50853,
      "longitude": -0.12574,
      "timezone": "Europe/London"
    }
  ]
}
```
- No matches → **200** with `results: []` (not 404: an empty autocomplete list is a normal state)
- Results are ordered by relevance (upstream order / population), which the stub makes deterministic

### 4.2 `GET /api/v1/activity-rankings?city={name}` or `?locationId={id}`
- Exactly one of `city` or `locationId` is required
- `city` must resolve to **exactly one** location; otherwise see the errors below
- `locationId` is the `id` returned by `/locations`. This is the expected front-end flow: search, pick, rank

**200 OK**
```json
{
  "location": { "id": 2643743, "name": "London", "country": "United Kingdom", "latitude": 51.50853, "longitude": -0.12574, "timezone": "Europe/London" },
  "generatedAt": "2026-11-21T09:00:00Z",
  "forecastDays": 7,
  "days": [
    {
      "date": "2026-11-21",
      "rankings": [
        {
          "rank": 1,
          "activity": "INDOOR_SIGHTSEEING",
          "activityName": "Indoor Sightseeing",
          "score": 82,
          "suitability": "GOOD",
          "reasons": ["Heavy rain expected (18 mm)", "Strong winds up to 55 km/h"]
        }
      ]
    }
  ]
}
```

**Contract rules (the tests must pin each of these down):**
- `days` has exactly **7** entries with **consecutive** ISO `YYYY-MM-DD` dates, starting with **today in the location's timezone**
- Every day has **exactly 4** rankings, one for each activity: `SKIING`, `SURFING`, `OUTDOOR_SIGHTSEEING`, `INDOOR_SIGHTSEEING`
- `rank` values are 1–4, unique within a day, and sorted by `score` descending
- Ties: equal scores are broken deterministically by a fixed activity order (document it), so the UI never shuffles
- `score` is an integer **0–100**
- `suitability` is a band derived from score: `EXCELLENT` (80–100), `GOOD` (60–79), `FAIR` (40–59), `POOR` (0–39)
- `reasons` is a non-empty array of human-readable strings that mention the weather drivers (e.g. snowfall, temperature, wind, rain, waves) using **metric units** (°C, mm, cm, km/h, m)
- `activityName` is display-ready text, so the front end does not need to map enums

### 4.3 Errors — envelope `{ "error": { "code": "STRING", "message": "human readable", "details": {} } }`

| Situation | Status | `code` |
|---|---|---|
| Missing / blank / whitespace-only input, query < 2 chars, > 100 chars, both `city` and `locationId` supplied, non-numeric `locationId` | 400 | `INVALID_REQUEST` |
| City name matches nothing / unknown `locationId` | 404 | `LOCATION_NOT_FOUND` |
| City name matches several places (e.g. "Springfield") | 409 | `AMBIGUOUS_LOCATION` — `details.candidates` holds the same shape as `/locations` results so the UI can show a picker |
| Open-Meteo returns 5xx / malformed body | 502 | `UPSTREAM_UNAVAILABLE` |
| Open-Meteo too slow (> configured timeout, e.g. 5s) | 504 | `UPSTREAM_TIMEOUT` |

Error rules: no stack traces and no upstream URLs in messages; `Content-Type: application/json`.

### 4.4 Assumed SUT configuration (needed for testability)
The real service must read its upstream URLs from env vars so the tests can point it at the stub:
- `OPEN_METEO_GEOCODING_URL` (real: `https://geocoding-api.open-meteo.com/v1/search`)
- `OPEN_METEO_FORECAST_URL` (real: `https://api.open-meteo.com/v1/forecast`)
- `OPEN_METEO_MARINE_URL` (real: `https://marine-api.open-meteo.com/v1/marine`; wave data for surfing)
- `OPEN_METEO_TIMEOUT_MS`

> Before writing fixtures, **check the live Open-Meteo docs** (open-meteo.com/en/docs, the geocoding API docs and the marine API docs) and use their real request parameters and response shapes. Likely daily variables: `weather_code`, `temperature_2m_max`, `temperature_2m_min`, `precipitation_sum`, `rain_sum`, `snowfall_sum`, `wind_speed_10m_max`, `sunshine_duration`; marine: `wave_height_max`. If you cannot reach the docs, say so and record the assumed shape in the README.

---

## 5. Handling the Open-Meteo dependency (the key design decision)

**Approach: service virtualisation through a programmable stub server.**

- On `BeforeAll`, start the stub on a fixed port (env `STUB_PORT`, default `4010`) serving `/geocoding/search`, `/forecast` and `/marine`
- Each scenario uses a `Given` step to load a **named fixture** (e.g. `heavy-snow-alpine`, `clear-warm-coastal`, `storm-week`) or to inject a fault (`500`, malformed JSON, 10s delay)
- The stub **records every request it receives**, so scenarios can assert that the SUT:
  - called the forecast endpoint with the resolved lat/long
  - asked for `forecast_days=7` and the location's `timezone`
  - did **not** call Open-Meteo when validation failed (400s)
- Reset the stub in a `Before` hook so scenarios are independent and can run in any order
- Fixtures live in `test/fixtures/open-meteo/*.json`. They are realistic, hand-crafted and **date-relative**: generate the `time` array from "today" at runtime so the tests never rot

Why: tests are deterministic, run offline, can reproduce extreme weather on demand, can test failure modes that the real API cannot be made to produce, and verify the integration contract.

**Optional, separate tag `@live`** (excluded from the default run): one or two smoke scenarios that hit the real Open-Meteo directly to check that our fixture shapes still match reality (contract drift detection). The README should explain this trade-off.

---

## 6. Making the red state meaningful

With no SUT, every request would fail with `ECONNREFUSED`. That is noise, not a meaningful failure. So:

- Add `placeholder-sut/server.ts`: a ~20-line Node server that returns `501 { "error": { "code": "NOT_IMPLEMENTED", ... } }` for every route
- `npm test` starts the placeholder (unless `API_BASE_URL` points somewhere else), then runs Cucumber
- Assertions must therefore fail on **behaviour** (status, body shape, counts, ordering), with clear messages
- Write a small assertion helper that, on failure, prints the expected value, the actual value and the response body (truncated)
- In the README, include a short excerpt of the red output and explain it is the intended outcome
- When the real API exists, run with `API_BASE_URL=http://real-host npm test` and the same suite becomes the acceptance gate

**Optional (ask Kumar before doing this):** a throwaway reference implementation on a separate branch (`reference-impl`, never merged to `main`) to prove the suite can go green and has no bugs of its own. If built, mention it in the README.

---

## 7. Feature files to write (`features/`)

Use the **declarative business language** of the domain. Avoid HTTP plumbing in the Gherkin where reasonable (say "When I request activity rankings for 'Zermatt'", not "When I GET /api/v1/…"). Use `Background`, `Scenario Outline` + `Examples`, and data tables where they make the scenarios clearer. Tag everything.

Suggested tags: `@smoke`, `@contract`, `@search`, `@ranking`, `@reasoning`, `@validation`, `@resilience`, `@ux`, `@live`.

1. **`location_search.feature`** `@search @ux`
   - Partial name returns several matches (e.g. "Lon" → London GB, London CA, Londonderry…)
   - Each match has the fields the UI needs to tell places apart (name, region, country)
   - Search is case-insensitive and trims whitespace
   - Unicode / accented names (Zürich, São Paulo)
   - No matches → empty list, 200
   - Results capped by `limit`; `limit` outside range → 400
   - Query too short / too long / blank → 400 with helpful message (Scenario Outline)

2. **`activity_rankings_contract.feature`** `@contract @smoke`
   - Exact city name → 200, location echoed back
   - Exactly 7 consecutive days starting today in the location's timezone (include a timezone-edge case, e.g. Auckland or Honolulu vs UTC)
   - Each day lists all 4 activities exactly once
   - Every ranking has date, activity, activityName, score (0–100 int), suitability, reasons
   - Ranks unique 1–4, ordered by score; deterministic tie-break
   - Suitability band matches the score (Scenario Outline over the boundaries 39/40, 59/60, 79/80)
   - Ranking via `locationId` returns the same result as via an unambiguous city name

3. **`activity_ranking_rules.feature`** `@ranking`
   Use **relative / metamorphic assertions**, not exact scores, because the scoring formula belongs to the developers. Examples:
   - Heavy snowfall and sub-zero temperatures in a mountain resort → Skiing ranks 1st, Surfing ranks low
   - Large swell, moderate wind, mild temperatures at a coastal town → Surfing ranks above Skiing
   - Clear skies and ~22°C → Outdoor Sightseeing ranks 1st, scores GOOD or better
   - Heavy rain / thunderstorm / gale → Indoor Sightseeing ranks 1st, Outdoor scores POOR
   - Inland city with no marine data → Surfing is POOR with a reason explaining why (no coastline / no wave data)
   - Weather varies across the week → rankings vary by day (each day is ranked independently, not a weekly average)
   - **Monotonicity:** with all else equal, more snowfall never lowers the Skiing score, and more rain never raises the Outdoor score

4. **`reasoning.feature`** `@reasoning @ux`
   - Reasons mention the dominant weather driver ("High snowfall expected", "Clear skies and 22°C")
   - Values shown match the fixture data (rounded sensibly) with metric units
   - Reasons are never empty and never contain raw codes like `weather_code 95`
   - The reason given for a POOR score explains the negative factor

5. **`input_validation.feature`** `@validation`
   - Scenario Outline: missing param, blank, whitespace, 1 char, 101 chars, both `city` and `locationId`, non-numeric id, injection-like strings (`'; DROP TABLE`, `<script>`) → 400, safe message, **no upstream call made**
   - Unknown city → 404 `LOCATION_NOT_FOUND`
   - Ambiguous city ("Springfield") → 409 with candidates list

6. **`open_meteo_failures.feature`** `@resilience`
   - Forecast API 500 → 502 `UPSTREAM_UNAVAILABLE`, no partial/fake data
   - Malformed JSON / missing daily fields → 502
   - Slow upstream → 504 within the timeout budget
   - Geocoding down → search returns 502
   - Marine API down but forecast up → decide and document: either 502, or a degraded response where Surfing explains that wave data is unavailable (recommended: degrade gracefully, which is better UX)
   - SUT sends correct query params to Open-Meteo (lat/long, `forecast_days=7`, timezone)

7. **`live_open_meteo.feature`** `@live` (excluded by default)
   - Real geocoding for "London" returns a result with the expected shape
   - Real forecast returns 7 daily entries for the variables we rely on

Aim for **thorough but readable** coverage, roughly 35–50 scenarios across all files. Quality matters more than count.

---

## 8. Project structure

```
.
├── CLAUDE.md
├── README.md
├── package.json
├── tsconfig.json
├── cucumber.js                  # profiles: default (excludes @live), smoke, live
├── .nvmrc
├── .eslintrc.cjs / .prettierrc
├── .github/workflows/ci.yml     # runs the suite; red is expected — see §10
├── features/
│   └── *.feature
├── src/
│   ├── support/
│   │   ├── world.ts             # custom World: api client, stub handle, last response
│   │   ├── hooks.ts             # BeforeAll start stub + placeholder; Before reset; AfterAll stop
│   │   └── config.ts            # env vars & defaults
│   ├── steps/
│   │   ├── location-search.steps.ts
│   │   ├── rankings.steps.ts
│   │   ├── weather-stub.steps.ts
│   │   └── common.steps.ts      # status codes, error envelope
│   ├── clients/
│   │   └── activityApiClient.ts # thin typed wrapper over fetch
│   ├── contract/
│   │   └── schemas.ts           # zod schemas mirroring §4
│   ├── stubs/
│   │   └── openMeteoStub.ts     # programmable stub server + request recorder
│   └── assertions/
│       └── rankingAssertions.ts # rank order, bands, date sequence, relative ranking helpers
├── test/fixtures/open-meteo/
│   ├── geocoding/*.json
│   ├── forecast/*.json          # date-relative builders or templates
│   └── marine/*.json
├── placeholder-sut/
│   └── server.ts                # returns 501 everywhere
└── reports/                     # git-ignored
```

npm scripts:
- `test` → start the placeholder SUT if needed, then run Cucumber (default profile, excluding `@live`)
- `test:smoke` → `@smoke` only
- `test:live` → `@live` only
- `typecheck` → `tsc --noEmit`
- `lint`, `format`

---

## 9. Coding standards

- Step definitions stay **thin**. Logic lives in clients, assertion helpers and stub builders
- No `any`; derive types from the zod schemas (`z.infer`)
- Reuse steps through Cucumber expressions and parameter types (e.g. define an `{activity}` parameter type that maps "Skiing" → `SKIING`)
- No sleeps or real-time waits except inside the timeout scenario
- Scenarios are independent and order-agnostic; all state lives in the World and is reset per scenario
- Freeze "today" with an injectable clock where possible. Otherwise compute expected dates in the location's timezone using `Intl`/`Temporal`-style logic, not the machine timezone
- Failure messages must be readable by a developer who has never seen the suite
- Do not commit secrets, `node_modules` or reports

---

## 10. CI

Add a GitHub Actions workflow that installs, typechecks, lints and runs the suite, then uploads the HTML report as an artifact. Because red is the expected state:
- `typecheck` and `lint` must **pass** (they prove the suite itself is sound)
- Mark the Cucumber step `continue-on-error: true` and explain why in a workflow comment and in the README
- Also verify there are **zero undefined or pending steps**. A dry run (`cucumber-js --dry-run --strict`) should pass and acts as a gate

---

## 11. README.md must include

1. **Overview**: what the suite is and why it is red
2. **How to run**: prerequisites, `npm ci`, `npm test`, running against a real implementation via `API_BASE_URL`, running `@live`
3. **Approach**: spec-first BDD, declarative Gherkin, tag strategy, relative ranking assertions, contract validation with zod
4. **API contract**: condensed version of §4 (endpoints, sample payloads, error table)
5. **Open-Meteo strategy**: stub server, fixtures, request recording, `@live` drift check, and why
6. **Assumptions**: e.g. 7 days start today in local timezone, metric units, score bands, ambiguity → 409, marine data for surfing, English-only reasons
7. **Omissions & trade-offs**: no exact scoring formula asserted (owned by devs), no auth/rate limiting/caching/i18n/performance tests (list as future work), stub vs WireMock choice, the 501 placeholder, open questions for the product owner
8. **Use of AI**: brief and honest description of how AI assisted, and what was reviewed or decided by a human
9. **Sample red output**: short excerpt

Keep it scannable: headings, a table or two, and nothing longer than it needs to be.

---

## 12. Workflow for Claude Code

1. Read this file fully. Check the Open-Meteo docs for real parameter names (§4.4)
2. Scaffold the project (package.json, tsconfig, cucumber config, lint). Make `npm run typecheck` pass
3. Write the **feature files first**. Show them to Kumar for review before automating them
4. Build the stub server, fixtures, World and hooks, then the placeholder SUT
5. Implement the step definitions, one feature at a time. After each one, run `--dry-run --strict` and then the real run
6. Check that every scenario fails **on an assertion with a clear message**: no `ECONNREFUSED`, no undefined steps, no TS errors
7. Add CI, then write the README with real sample output
8. `git init`, make small meaningful commits (e.g. `feat(features): add location search scenarios`), then ask Kumar for the GitHub repo name/remote before pushing. The repo must be **public**

### Definition of done
- [ ] All deliverables present: feature files, automation code, README.md
- [ ] `npm ci && npm run typecheck && npm run lint` pass
- [ ] `cucumber-js --dry-run --strict` passes (no undefined/pending steps)
- [ ] `npm test` runs end-to-end and fails **only** on meaningful behavioural assertions
- [ ] Every acceptance criterion in §2 is traceable to at least one scenario (add a small traceability table to the README)
- [ ] Open-Meteo is fully stubbed for the default run; `@live` is opt-in
- [ ] Repo pushed to a public GitHub repository

### When unsure
Make the most reasonable assumption, record it in the README "Assumptions" section, and carry on. Stop and ask only for things that cannot be undone, such as pushing or publishing the repo.
