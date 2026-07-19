// x connector — the standard @magnis/testkit/source wire contract, driven
// through the SDK `handleMessage` against the REAL buildConnectorConfig with a
// mockFetch (no network). Proves: initialize advertises [x, contacts]; a full
// drain of the "x" surface (a tracked handle → profile + post envelopes) and of
// the "contacts" surface (the following import walking TWO pages via
// next_token); and an upstream 429 signals as the typed -32002 + retry_after.
//
// x has no magnis.execute table (the import moved onto the contacts surface —
// plan §7), so there is no execute fixture. The per-file unit tests
// (fetch/contacts/probe.test.ts) stay co-located and pin the fetchers; this
// file adds ONLY the reusable wire-contract layer.
import { mockFetch, runSourceContract } from "@magnis/testkit/source";
import { buildConnectorConfig } from "../connector";

const META = { bearer_token: "tok" };

const OWNER = { data: { id: "12", username: "jack", name: "Jack" } };
const TWEETS = {
  data: [{ id: "1", text: "hello", created_at: "2026-06-01T00:00:00Z", public_metrics: { like_count: 5 } }],
};

function happyRoutes() {
  return [
    // Resolve @jack → profile (used by both the "x" and "contacts" drains).
    { match: "/2/users/by/username/jack", response: { body: OWNER } },
    // "x" surface: recent tweets for the resolved user id.
    { match: "/2/users/12/tweets", response: { body: TWEETS } },
    // "contacts" surface: the following list — TWO pages, page 1 hands back a
    // next_token so the drain feeds the cursor forward and pulls page 2.
    {
      match: "/2/users/12/following",
      response: [
        {
          body: {
            data: [{ id: "20", username: "alice", name: "Alice" }],
            meta: { next_token: "nt2" },
          },
        },
        { body: { data: [{ id: "21", username: "bob", name: "Bob" }] } },
      ],
    },
  ];
}

runSourceContract(buildConnectorConfig(mockFetch(happyRoutes())), {
  fetch: {
    // Tracked handle → 1 profile + 1 post envelope; snapshot poll, single page.
    x: { meta: META, args: { tracked_handles: ["jack"] }, minEnvelopes: 2 },
    // Following import seeded in the cursor; drains 2 pages → 2 social contacts.
    contacts: { meta: META, args: { cursor: { import: { handle: "jack", limit: 5 } } }, minEnvelopes: 2 },
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
