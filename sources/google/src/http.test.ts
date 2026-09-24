// Read-timeout tests for the shared HTTP seam. A stalled Google socket (open, no
// bytes) must be aborted at the deadline and REJECT — never hang the sync forever.

import { describe, expect, test } from "bun:test";
import {
  checkRateLimit,
  fetchWithTimeout,
  GoogleRateLimitError,
  HttpTimeoutError,
  HTTP_REQUEST_TIMEOUT_MS,
  throwGoogleResponseError,
  type FetchLike,
} from "./http";

function response(status: number, retryAfter: string | null): Awaited<ReturnType<FetchLike>> {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => name.toLowerCase() === "retry-after" ? retryAfter : null },
    text: async () => "",
    json: async () => ({}),
  };
}

/**
 * @test-id: tst_src_iso_google_009
 * @scenario: scn_google_pull_004
 * @covers: sources/google/src/http.ts::checkRateLimit
 * @deterministic: yes
 * @fixtures: scripted 429 and 403 responses
 */
test("tst_src_iso_google_009 preserves exact Google 429 and quota-403 waits", () => {
  for (const status of [429, 403]) {
    try {
      checkRateLimit(response(status, "17"));
      throw new Error("expected typed rate limit");
    } catch (error) {
      expect(error).toBeInstanceOf(GoogleRateLimitError);
      expect((error as GoogleRateLimitError).retryAfterSecs).toBe(17);
    }
  }
});

/**
 * @test-id: tst_src_iso_google_011
 * @scenario: scn_google_pull_004
 * @covers: sources/google/src/http.ts::checkRateLimit
 * @deterministic: yes
 * @fixtures: missing and malformed Retry-After
 */
test("tst_src_iso_google_011 never invents a missing or malformed delay", () => {
  for (const retryAfter of [null, "", "17seconds", "-2"]) {
    expect(() => checkRateLimit(response(429, retryAfter))).toThrow();
    try {
      checkRateLimit(response(429, retryAfter));
    } catch (error) {
      expect(error).not.toBeInstanceOf(GoogleRateLimitError);
    }
  }
});

/**
 * @test-id: tst_src_iso_google_012
 * @scenario: scn_google_pull_004
 * @covers: sources/google/src/http.ts::throwGoogleResponseError
 * @deterministic: yes
 * @fixtures: Gmail quota 403 without Retry-After, with an exact minute window start
 */
test("tst_src_iso_google_012 uses Google's quota window for a typed retry", async () => {
  const windowStart = Date.parse("2026-09-24T16:52:05Z") / 1000;
  const quota = JSON.stringify({ error: { details: [{
    reason: "RATE_LIMIT_EXCEEDED",
    metadata: { quota_unit: "1/min/{project}/{user}", window_start_time: String(windowStart) },
  }] } });
  const resp = { ...response(403, null), text: async () => quota };
  const error = await throwGoogleResponseError(resp, "Gmail list messages failed", (windowStart + 18) * 1000).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(GoogleRateLimitError);
  expect((error as GoogleRateLimitError).retryAfterSecs).toBe(42);
});

/**
 * @test-id: tst_src_iso_google_015
 * @scenario: scn_google_pull_004
 * @covers: sources/google/src/http.ts::throwGoogleResponseError
 * @deterministic: yes
 * @fixtures: Gmail per-user minute quota 403 without a window_start_time
 */
test("tst_src_iso_google_015 holds a full minute when Google omits the quota window", async () => {
  const quota = JSON.stringify({ error: { details: [{
    reason: "RATE_LIMIT_EXCEEDED",
    metadata: { quota_unit: "1/min/{project}/{user}" },
  }] } });
  const resp = { ...response(403, null), text: async () => quota };
  const error = await throwGoogleResponseError(resp, "Gmail get message failed", 1_000).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(GoogleRateLimitError);
  expect((error as GoogleRateLimitError).retryAfterSecs).toBe(60);
});

describe("fetchWithTimeout", () => {
  // A hanging fetch that honors the injected AbortSignal exactly like the real
  // fetch: it rejects when the signal aborts. The AbortController must fire at the
  // deadline so the call rejects with HttpTimeoutError instead of hanging.
  test("tst_gts_http_001 a hanging fetch is aborted at the deadline and rejects with HttpTimeoutError", async () => {
    const hanging: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        const signal = (init as { signal?: AbortSignal } | undefined)?.signal;
        signal?.addEventListener("abort", () => reject(signal.reason));
      });
    const start = Date.now();
    const err = await fetchWithTimeout(hanging, "https://api/x", {}, 20).catch((e) => e);
    expect(err).toBeInstanceOf(HttpTimeoutError);
    expect(Date.now() - start).toBeLessThan(1000); // bounded — did NOT hang
  });

  test("tst_gts_http_002 a fetch that returns before the deadline passes through untouched", async () => {
    const ok: FetchLike = async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => "",
      json: async () => ({}),
    });
    const resp = await fetchWithTimeout(ok, "https://api/x", {}, 1000);
    expect(resp.status).toBe(200);
  });

  test("tst_gts_http_003 the injected signal is forwarded to the underlying fetch", async () => {
    let sawSignal = false;
    const spy: FetchLike = async (_url, init) => {
      sawSignal = (init as { signal?: unknown } | undefined)?.signal instanceof AbortSignal;
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () => "",
        json: async () => ({}),
      };
    };
    await fetchWithTimeout(spy, "https://api/x", { method: "GET" }, 1000);
    expect(sawSignal).toBe(true);
  });

  test("tst_gts_http_004 the default HTTP timeout is a bounded, sane value", () => {
    expect(HTTP_REQUEST_TIMEOUT_MS).toBeGreaterThan(0);
    expect(HTTP_REQUEST_TIMEOUT_MS).toBeLessThanOrEqual(60_000);
  });
});
