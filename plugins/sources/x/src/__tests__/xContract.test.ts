// x connector — the standard @magnis/testkit/source wire contract, driven
// through the SDK `handleMessage` against the REAL buildConnectorConfig with a
// mockFetch (no network). Proves: initialize advertises [x]; a full drain of
// the "x" surface (a tracked handle → profile + post envelopes); and an
// upstream 429 signals as the typed -32002 + retry_after.
//
// x has no magnis.execute table and, since S3, no contacts surface — the
// following import (x:social envelopes) is deleted with its consumer; a
// handle is a mutable key and the hub it minted could never be
// re-identified. The per-file unit tests (fetch/probe.test.ts) stay
// co-located and pin the fetchers; this file adds ONLY the reusable
// wire-contract layer.
import { mockFetch, runSourceContract } from "@magnis/testkit/source";
import { buildConnectorConfig } from "../connector";

const META = { bearer_token: "tok" };

const OWNER = { data: { id: "12", username: "jack", name: "Jack" } };
const TWEETS = {
  data: [{ id: "1", text: "hello", created_at: "2026-06-01T00:00:00Z", public_metrics: { like_count: 5 } }],
};

function happyRoutes() {
  return [
    // Resolve @jack → profile.
    { match: "/2/users/by/username/jack", response: { body: OWNER } },
    // "x" surface: recent tweets for the resolved user id.
    { match: "/2/users/12/tweets", response: { body: TWEETS } },
  ];
}

runSourceContract(buildConnectorConfig(mockFetch(happyRoutes())), {
  fetch: {
    // Tracked handle → 1 profile + 1 post envelope; snapshot poll, single page.
    x: { meta: META, args: { tracked_handles: ["jack"] }, minEnvelopes: 2 },
  },
  rateLimit: {
    config: buildConnectorConfig(
      mockFetch([
        { match: "/2/users/by/username/jack", response: { status: 429, headers: { "retry-after": "50" } } },
      ]),
    ),
    surface: "x",
    meta: META,
    args: { tracked_handles: ["jack"] },
    retryAfter: 50,
  },
});
