/**
 * Assertion helpers that explain themselves. Every failure says what was expected, what
 * actually happened, and shows the request and (truncated) response body, so a developer
 * who has never seen this suite can tell what behaviour is missing.
 */
import type { z } from 'zod';
import type { ApiResponse } from '../clients/activityApiClient';
import { ErrorEnvelopeSchema, type ErrorEnvelope } from '../contract/schemas';

const BODY_PREVIEW_CHARS = 600;

export class BehaviourError extends Error {
  override name = 'BehaviourError';

  constructor(message: string) {
    super(message);
    // Keep only the step-definition frame: the message already explains the failure.
    const stepFrame = this.stack?.split('\n').find((line) => /[\\/]steps[\\/]/.test(line));
    this.stack = stepFrame ? `${message}\n${stepFrame}` : message;
  }
}

export function describeResponse(res: ApiResponse): string {
  const body =
    res.bodyText.length > BODY_PREVIEW_CHARS
      ? `${res.bodyText.slice(0, BODY_PREVIEW_CHARS)}… (${res.bodyText.length} chars)`
      : res.bodyText || '(empty body)';
  return `  ${res.method} ${res.url}\n  → ${res.status} ${res.contentType}\n  ${body}`;
}

/** Throws a failure with expectation, actual result and the response for context. */
export function fail(res: ApiResponse | undefined, expected: string, actual: string): never {
  const context = res ? `\n\nResponse:\n${describeResponse(res)}` : '';
  throw new BehaviourError(`Expected ${expected}\nbut ${actual}.${context}`);
}

/** Runs an `expect`-style check and, if it fails, adds the response to the message. */
export function verify(res: ApiResponse | undefined, expected: string, check: () => void): void {
  try {
    check();
  } catch (err) {
    if (err instanceof BehaviourError) throw err;
    fail(res, expected, `the check failed:\n${(err as Error).message}`);
  }
}

/** Fails unless every item in `violations` is empty; lists all of them, not just the first. */
export function expectNoViolations(
  res: ApiResponse | undefined,
  expected: string,
  violations: string[],
): void {
  if (violations.length > 0) {
    const shown = violations.slice(0, 10).map((v) => `  - ${v}`);
    if (violations.length > 10) shown.push(`  … and ${violations.length - 10} more`);
    fail(res, expected, `found ${violations.length} problem(s):\n${shown.join('\n')}`);
  }
}

export function expectStatus(res: ApiResponse, status: number, meaning: string): void {
  if (res.status !== status) {
    fail(res, `HTTP ${status} (${meaning})`, `received HTTP ${res.status}`);
  }
}

export function expectJsonContentType(res: ApiResponse): void {
  if (!/^application\/json\b/i.test(res.contentType)) {
    fail(res, 'Content-Type: application/json', `received "${res.contentType || '(none)'}"`);
  }
}

/** Validates the body against a contract schema and reports each mismatch with its JSON path. */
export function parseBody<T extends z.ZodType>(
  res: ApiResponse,
  schema: T,
  what: string,
): z.infer<T> {
  if (res.json === undefined) fail(res, `a JSON ${what}`, 'the body is not valid JSON');
  const result = schema.safeParse(res.json);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 8)
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`);
    fail(res, `the body to match the ${what} contract`, `it does not:\n${issues.join('\n')}`);
  }
  return result.data;
}

/** Asserts status + error envelope + error code, and returns the parsed error. */
export function expectError(
  res: ApiResponse,
  status: number,
  code: string,
): ErrorEnvelope['error'] {
  if (res.status !== status) {
    fail(res, `HTTP ${status} with error code ${code}`, `received HTTP ${res.status}`);
  }
  const { error } = parseBody(res, ErrorEnvelopeSchema, 'error envelope');
  if (error.code !== code) fail(res, `error code ${code}`, `received error code ${error.code}`);
  return error;
}
