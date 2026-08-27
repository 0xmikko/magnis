import { RateLimitError, type FetchArgs, type FetchResult } from "@magnis/connector-sdk";

// magnis.sync.fetch for mock-gmail — 1:1 with the Rust `fetch_result`:
// the cursor is an INDEX into the surface's items in the shared file; every
// item past it is returned, `nextCursor` is the total count, `hasMore` false.

let nextFetchRateLimitSecs: number | undefined;

export function queueRateLimitNextFetch(retryAfterSecs: number): void {
  nextFetchRateLimitSecs = retryAfterSecs;
}

export function fetchMockGmail(_args: FetchArgs): Promise<FetchResult> {
  const retryAfterSecs = nextFetchRateLimitSecs;
  if (retryAfterSecs !== undefined) {
    nextFetchRateLimitSecs = undefined;
    return Promise.reject(new RateLimitError(retryAfterSecs));
  }
  return Promise.resolve({ envelopes: [], nextCursor: null, hasMore: false });
}
