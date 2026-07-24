// Shared HTTP plumbing — TS twin of the Rust connector's `send_with_retry`
// (plugins/sources/google/src/main.rs) + `check_rate_limit` (src/auth.rs).

import { CursorExpiredError, RateLimitError } from "@magnis/connector-sdk";

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
    this.message = `Google rate limited: retry after ${String(retryAfterSecs)}s`;
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

/** Gmail historyId expired (404) — the host re-bootstraps. FATAL.
 * Extends the SDK's `CursorExpiredError` so the SDK maps it to the typed
 * `-32003`, which the host reads as `SourceErrorKind::CursorExpired` → reset
 * to Bootstrap + drop the stale cursor. A plain Error lands on the generic
 * `-32000`, which parks email sync at `state=failed` forever. */
export class HistoryExpiredError extends CursorExpiredError {
  constructor() {
    super("Gmail historyId expired (404)");
    this.name = "HistoryExpiredError";
  }
}

/** People API pagination `pageToken` no longer accepted (400
 * FAILED_PRECONDITION) — the host re-bootstraps contacts. FATAL.
 *
 * Same contract as `HistoryExpiredError`: the SDK maps `CursorExpiredError` to
 * `-32003` → the host resets to Bootstrap and drops the stale cursor, instead
 * of parking contacts at `state=failed` forever (the live overnight failure).
 *
 * Raised ONLY when a pageToken was actually sent — `FAILED_PRECONDITION` is a
 * heavily overloaded People API status and on a FIRST page it means an
 * identity/auth fault, which must stay terminal. See `contacts.ts`. */
export class ContactsCursorExpiredError extends CursorExpiredError {
  constructor() {
    super("Google contacts pageToken expired (400 FAILED_PRECONDITION)");
    this.name = "ContactsCursorExpiredError";
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

/** Wall-clock bound (ms) on a single Google HTTP request. `fetch` over a stalled
 * socket (connection open, no bytes) has NO timeout of its own and hangs forever
 * — the same class of failure that froze the Telegram sync. 30s is ample for a
 * Gmail/People page yet short enough that a stalled response surfaces as a
 * transient error the retry loop / host can act on instead of hanging. */
export const HTTP_REQUEST_TIMEOUT_MS = 30_000;

/** Typed error raised when a Google request blows the read timeout. Distinct
 * from a bare `AbortError` so callers can tell "we timed out" from "the caller
 * aborted". Not fatal (see `isFatal`) → the retry loop / host retries. */
export class HttpTimeoutError extends Error {
  constructor(
    readonly url: string,
    readonly ms: number,
  ) {
    super(`Google request to ${url} timed out after ${String(ms)}ms`);
    this.name = "HttpTimeoutError";
  }
}

/** One HTTP attempt, bounded by an AbortController-driven timeout. The injected
 * `fetchFn` receives `signal` (production `fetch` honors it; tests drive it), so
 * a stalled socket is ABORTED at `timeoutMs` and the call REJECTS with a typed
 * `HttpTimeoutError` — it never hangs and never fabricates an empty result. The
 * `fetchFn` seam is preserved: `signal` is merged into the caller's `init`. */
export async function fetchWithTimeout(
  fetchFn: FetchLike,
  url: string,
  init?: Record<string, unknown>,
  timeoutMs: number = HTTP_REQUEST_TIMEOUT_MS,
): Promise<HttpResponse> {
  const controller = new AbortController();
  const timeoutError = new HttpTimeoutError(url, timeoutMs);
  const timer = setTimeout(() => { controller.abort(timeoutError); }, timeoutMs);
  try {
    return await fetchFn(url, { ...init, signal: controller.signal });
  } catch (e) {
    // If WE aborted (the deadline fired), surface the TYPED timeout regardless of
    // what shape the runtime's abort rejection took (AbortError vs the reason).
    if (controller.signal.aborted) throw timeoutError;
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Twin of the Rust `send_with_retry`: retry ONLY transient send failures
 * (network / timeout rejections) up to 3 times with 600/1200/2400ms backoff.
 * HTTP statuses are never retried. Every request gets a per-attempt read
 * timeout (`fetchWithTimeout`) so a stalled socket can never hang the sync. */
export async function fetchWithRetry(
  fetchFn: FetchLike,
  url: string,
  init?: Record<string, unknown>,
): Promise<HttpResponse> {
  let attempt = 0;
  for (;;) {
    try {
      return await fetchWithTimeout(fetchFn, url, init);
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
