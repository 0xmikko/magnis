// @magnis/testkit/source — self-tests (bun:test lane, NOT vitest). Proves the
// `mockFetch` router (substring / regexp / predicate matching, multi-page
// sequences, the throwing miss) and that a tiny fake SDK connector passes the
// full `runSourceContract` suite — so the connectors that adopt the kit inherit
// a verified harness.
import { describe, expect, test } from "bun:test";
import { RateLimitError, type ConnectorConfig } from "@magnis/connector-sdk";
import { mockFetch, runSourceContract, type MockFetch } from "@magnis/testkit/source";

// ── a minimal SDK connector, HTTP-paginated over the injected fetch seam ──
// One surface ("things"), a token-paged fetch, one execute action, and a 429 →
// RateLimitError translation (as the real connectors do). Everything the
// contract checks, nothing it doesn't.
function buildFake(fetchFn: MockFetch): ConnectorConfig {
  return {
    name: "fake-src",
    version: "0.0.1",
    surfaces: ["things"],
    mode: "poll",
    intervalSecs: 60,
    fetch: async (args) => {
      const token = typeof args.cursor === "string" ? args.cursor : undefined;
      const url = `https://api.test/things${token ? `?page_token=${token}` : ""}`;
      const res = await fetchFn(url);
      if (res.status === 429) {
        throw new RateLimitError(Number(res.headers.get("retry-after")) || 30);
      }
      const body = (await res.json()) as {
        items?: { id: string }[];
        next_page_token?: string;
        total?: number;
      };
      const items = body.items ?? [];
      const next = body.next_page_token ?? null;
      return {
        envelopes: items.map((it) => ({
          surface: "things",
          remote_id: `thing:${it.id}`,
          kind: "snapshot" as const,
          payload: { id: it.id },
        })),
        nextCursor: next,
        hasMore: next !== null,
        total: body.total ?? null,
        discovered: items.length,
      };
    },
    execute: {
      poke: (args) => Promise.resolve({ poked: true, echo: args.note ?? null }),
    },
  };
}

describe("mockFetch", () => {
  test("tst_testkit_src_mockfetch_001 matches by substring / regexp / predicate", async () => {
    const f = mockFetch([
      { match: "/alpha", response: { body: { who: "alpha" } } },
      { match: /beta\/\d+/, response: { body: { who: "beta" } } },
      { match: (u) => u.endsWith("/gamma"), response: { body: { who: "gamma" } } },
    ]);
    expect(await (await f("https://x/alpha")).json()).toEqual({ who: "alpha" });
    expect(await (await f("https://x/beta/12")).json()).toEqual({ who: "beta" });
    expect(await (await f("https://x/gamma")).json()).toEqual({ who: "gamma" });
  });

  test("tst_testkit_src_mockfetch_002 an unmatched URL throws (no silent network)", async () => {
    const f = mockFetch([{ match: "/known", response: { body: {} } }]);
    await expect(f("https://x/unknown")).rejects.toThrow("no mock route for https://x/unknown");
  });

  test("tst_testkit_src_mockfetch_003 a response array is a page sequence; last repeats", async () => {
    const f = mockFetch([{ match: "/p", response: [{ body: { n: 1 } }, { body: { n: 2 } }] }]);
    expect(await (await f("https://x/p")).json()).toEqual({ n: 1 });
    expect(await (await f("https://x/p")).json()).toEqual({ n: 2 });
    expect(await (await f("https://x/p")).json()).toEqual({ n: 2 });
  });

  test("tst_testkit_src_mockfetch_004 status/ok default; headers are case-insensitive", async () => {
    const f = mockFetch([{ match: "/h", response: { status: 429, headers: { "Retry-After": "9" } } }]);
    const r = await f("https://x/h");
    expect(r.ok).toBe(false);
    expect(r.status).toBe(429);
    expect(r.headers.get("retry-after")).toBe("9");
    expect(r.headers.get("missing")).toBeNull();
  });
});

// The kit driving itself: a two-page drain, an execute dispatch, and a 429.
runSourceContract(
  buildFake(
    mockFetch([
      {
        match: "/things",
        response: [
          { body: { items: [{ id: "a" }, { id: "b" }], next_page_token: "p2", total: 3 } },
          { body: { items: [{ id: "c" }], total: 3 } },
        ],
      },
    ]),
  ),
  {
    fetch: {
      things: { minEnvelopes: 3, expectCounters: ["total", "discovered"] },
    },
    execute: [
      {
        action: "poke",
        args: { note: "hi" },
        assert: (r) => {
          expect(r.poked).toBe(true);
          expect(r.echo).toBe("hi");
        },
      },
    ],
    rateLimit: {
      config: buildFake(
        mockFetch([{ match: "/things", response: { status: 429, headers: { "retry-after": "42" } } }]),
      ),
      surface: "things",
      retryAfter: 42,
    },
  },
);
