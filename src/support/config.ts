/** Central place for environment-driven configuration. All values have safe local defaults. */
const num = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const config = {
  /** Base URL of the system under test. When unset, the 501 placeholder SUT is started locally. */
  apiBaseUrl: process.env.API_BASE_URL ?? 'http://localhost:3000',
  /** True when the caller pointed the suite at an externally running implementation. */
  externalSut: Boolean(process.env.API_BASE_URL),
  placeholderPort: num(process.env.PLACEHOLDER_PORT, 3000),
  stubPort: num(process.env.STUB_PORT, 4010),
  /** Upstream timeout the SUT is assumed to be configured with (OPEN_METEO_TIMEOUT_MS). */
  upstreamTimeoutMs: num(process.env.OPEN_METEO_TIMEOUT_MS, 5000),
} as const;
