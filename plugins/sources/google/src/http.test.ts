// Read-timeout tests for the shared HTTP seam. A stalled Google socket (open, no
// bytes) must be aborted at the deadline and REJECT — never hang the sync forever.

import { describe, expect, test } from "bun:test";
import {
  fetchWithTimeout,
  HttpTimeoutError,
  HTTP_REQUEST_TIMEOUT_MS,
  type FetchLike,
} from "./http";

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
