// Shared HTTP plumbing — TS twin of the Rust connector's `send_with_retry`
// (plugins/sources/google/src/main.rs) + `check_rate_limit` (src/auth.rs).

import { RateLimitError } from "@magnis/connector-sdk";

/** Minimal fetch-compatible response surface, injectable in tests. */
export interface HttpResponse {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  json(): Promise<unknown>;
}
export type FetchLike = (
  url: string,
  init?: Record<string, unknown>,
) => Promise<HttpResponse>;

/** HTTP 429 → typed rate-limit error. The message mirrors the Rust display
 * ("Google rate limited: retry after {n}s"); the class extends the SDK's
 * `RateLimitError` so the SDK maps it to the typed `-32002` +
 * `data.retry_after` (deliberate improvement over the Rust `-32601` string —
 * the host reads `error.data.retry_after`, not the message). */
export class GoogleRateLimitError extends RateLimitError {
  constructor(retryAfterSecs: number) {
    super(retryAfterSecs);
    this.message = `Google rate limited: retry after ${retryAfterSecs}s`;
  }
}

/** Refresh token expired/revoked — user must re-authorize. FATAL: aborts a
 * whole hydration batch (twin of `GoogleSyncError::AuthExpired`). */
export class AuthExpiredError extends Error {
  constructor(text: string) {
    super(`Google authorization expired: ${text}`);
    this.name = "AuthExpiredError";
  }
}

/** Gmail historyId expired (404) — the host re-bootstraps. FATAL. */
export class HistoryExpiredError extends Error {
  constructor() {
    super("Gmail historyId expired (404)");
    this.name = "HistoryExpiredError";
  }
}

/** Fatal errors abort the whole batch (twin of the Rust
 * `AuthExpired` / `RateLimited` / `HistoryExpired` arms); anything else skips
 * one message. */
export function isFatal(e: unknown): boolean {
  return (
    e instanceof RateLimitError ||
    e instanceof AuthExpiredError ||
    e instanceof HistoryExpiredError
  );
}

const MAX_RETRIES = 3;
const TIMEOUT_MS = 60_000;

/** Twin of the Rust `send_with_retry`: retry ONLY transient send failures
 * (network / timeout rejections) up to 3 times with 600/1200/2400ms backoff.
 * HTTP statuses are never retried. Every request gets a 60s timeout. */
export async function fetchWithRetry(
  fetchFn: FetchLike,
  url: string,
  init?: Record<string, unknown>,
): Promise<HttpResponse> {
  let attempt = 0;
  for (;;) {
    try {
      return await fetchFn(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (e) {
      if (attempt >= MAX_RETRIES) throw e;
      attempt += 1;
      // 600ms, 1.2s, 2.4s — same ladder as the Rust connector.
      await new Promise((r) => setTimeout(r, 300 * 2 ** attempt));
    }
  }
}

/** Throw on HTTP 429 — must run on EVERY Google API response before reading
 * the body. `Retry-After` parsed as integer seconds, default 60. */
export function checkRateLimit(resp: HttpResponse): void {
  if (resp.status !== 429) return;
  const retryAfter =
    Number.parseInt(resp.headers.get("retry-after") ?? "", 10) || 60;
  throw new GoogleRateLimitError(retryAfter);
}
