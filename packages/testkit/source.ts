// @magnis/testkit/source — SOURCE-side test harness for Magnis connectors.
//
// The source test lane runs under BUN (`scripts/test-connectors.sh` → `bun
// test <dir>`), NOT vitest — so the spies/asserts here import from `bun:test`
// (`mock`, `expect`), never `vi`/`vitest`. The module half (`module.ts`) is the
// vitest twin; keep the two lanes cleanly separate even though they ship in one
// package.
//
// Kills the per-connector copy-paste: every source test hand-rolls a fake
// `FetchLike` (canned URL→Response map), a `handleMessage` driver, and an
// ad-hoc "drain every page" loop. Those drift and each connector proves the
// wire contract slightly differently. This kit provides ONE conformant driver.
//
// SCOPE (Codex SHOULD-7): SDK connectors (google / x / linkedin) drive through
// `@magnis/connector-sdk`'s `handleMessage` — the default `drive`. Telegram is
// OUT of scope: it owns a custom `dispatch.ts`, not `handleMessage`, so
// `runSourceContract` exposes an optional `drive` injection for non-SDK
// connectors, but the telegram path is NOT built here.

import { expect, describe, test } from "bun:test";
import { handleMessage, type ConnectorConfig, type Envelope, type FetchResult } from "@magnis/connector-sdk";

// ───────────────────────────── mockFetch ─────────────────────────────
// A `FetchLike` (the injectable `fetchFn` seam google/x pass into their
// clients) that maps URL → canned `Response`, with NO network. A route whose
// `response` is an ARRAY is a multi-page sequence: successive matching calls
// shift the next element (so a `nextPageToken` walk is testable); once the
// sequence is exhausted the LAST page repeats (an idempotent re-poll is stable).

/** A canned HTTP response. Superset of every source's `FetchLike` return shape:
 *  google reads `text()`/`json()`/`headers.get`; x reads `json()`/`headers?.get`.
 *  Everything defaults so a route is usually just `{ body }`. */
export interface CannedResponse {
  status?: number;
  /** Defaults to `status < 400`. */
  ok?: boolean;
  /** JSON body — returned by `json()`, and stringified by `text()`. */
  body?: unknown;
  /** Overrides the stringified `body` for `text()` (e.g. non-JSON payloads). */
  text?: string;
  /** Response headers, read case-insensitively via `headers.get(name)`. */
  headers?: Record<string, string>;
}

export interface Route {
  /** A substring, a RegExp, or a predicate over the request URL. */
  match: string | RegExp | ((url: string) => boolean);
  /** One response, or a page sequence served in order (last repeats). */
  response: CannedResponse | CannedResponse[];
}

/** The response object handed back to a connector's `fetchFn`. Structurally
 *  compatible with both the google (`HttpResponse`) and x (`FetchLike`) seams. */
export interface MockResponse {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  json(): Promise<unknown>;
}

/** Injectable `fetchFn` double: `(url, init) => Promise<MockResponse>`. */
export type MockFetch = (url: string, init?: Record<string, unknown>) => Promise<MockResponse>;

function toResponse(c: CannedResponse): MockResponse {
  const status = c.status ?? 200;
  const ok = c.ok ?? status < 400;
  const bodyText = c.text ?? (c.body === undefined ? "" : JSON.stringify(c.body));
  const headers = c.headers ?? {};
  // Case-insensitive header lookup (real `Headers.get` is case-insensitive;
  // connectors read `retry-after`).
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return {
    ok,
    status,
    headers: { get: (name: string) => lower[name.toLowerCase()] ?? null },
    text: () => Promise.resolve(bodyText),
    json: () => Promise.resolve(c.body ?? {}),
  };
}

function matches(route: Route, url: string): boolean {
  const m = route.match;
  if (typeof m === "string") return url.includes(m);
  if (m instanceof RegExp) return m.test(url);
  return m(url);
}

/**
 * Build a `FetchLike` from `routes`. The first route whose `match` accepts the
 * URL answers; a multi-response route advances a per-route cursor each hit. A
 * URL matching NO route THROWS `no mock route for <url>` — so a test that forgot
 * a route fails loudly instead of silently hitting the real network.
 */
export function mockFetch(routes: Route[]): MockFetch {
  const cursors = new Map<Route, number>();
  return (url: string) => {
    for (const route of routes) {
      if (!matches(route, url)) continue;
      const seq = Array.isArray(route.response) ? route.response : [route.response];
      const i = cursors.get(route) ?? 0;
      // Serve in order; clamp at the last element so re-polls stay stable.
      const canned = seq[Math.min(i, seq.length - 1)];
      if (canned === undefined) throw new Error("mockFetch: route has no response");
      cursors.set(route, i + 1);
      return Promise.resolve(toResponse(canned));
    }
    return Promise.reject(new Error(`no mock route for ${url}`));
  };
}

// ──────────────────────────── driveMessage ───────────────────────────
/** The seam that turns one inbound JSON-RPC message into a reply. Default is the
 *  SDK `handleMessage`; a non-SDK connector (telegram's `dispatch.ts`) injects
 *  its own. */
export type Drive = (
  config: ConnectorConfig,
  msg: Record<string, unknown>,
) => Promise<Record<string, unknown> | null>;

const sdkDrive: Drive = (config, msg) => handleMessage(msg, config);

let msgId = 0;
function toolCall(name: string, args: Record<string, unknown>): Record<string, unknown> {
  return { jsonrpc: "2.0", id: ++msgId, method: "tools/call", params: { name, arguments: args } };
}

/** Thin ergonomic wrapper over the drive seam: send `msg`, assert a reply came
 *  back (never a bare notification), and return it. */
export async function driveMessage(
  config: ConnectorConfig,
  msg: Record<string, unknown>,
  drive: Drive = sdkDrive,
): Promise<Record<string, unknown>> {
  const reply = await drive(config, msg);
  if (reply === null) {
    throw new Error(`no reply for ${JSON.stringify(msg)}`);
  }
  return reply;
}

// ────────────────────────── runSourceContract ────────────────────────

/** A fetch drain fixture for one surface. */
export interface SurfaceFixture {
  /** `_meta` credentials attached to each fetch call. */
  meta?: Record<string, unknown>;
  /** Extra tools/call arguments (e.g. `tracked_handles`, a seed `cursor`). */
  args?: Record<string, unknown>;
  /** Assert the drain produced at least this many envelopes across all pages. */
  minEnvelopes?: number;
  /** Assert every page carries the named progress counters (number | null). */
  expectCounters?: "total" | "discovered" | ("total" | "discovered")[];
  /** Safety bound on the drain loop (default 20). */
  maxPages?: number;
}

/** One `magnis.execute` dispatch fixture. */
export interface ExecuteFixture {
  action: string;
  args?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  /** Custom assertion on the (error-free) result. */
  assert?: (result: Record<string, unknown>) => void;
}

/** Rate-limit fixture: a SEPARATE config wired (via `mockFetch`) to answer 429,
 *  so the drive asserts the SDK maps it to `-32002` + `data.retry_after`. */
export interface RateLimitFixture {
  /** A config whose `fetch` upstream returns HTTP 429. */
  config: ConnectorConfig;
  surface: string;
  meta?: Record<string, unknown>;
  args?: Record<string, unknown>;
  /** Expected `error.data.retry_after` (seconds), if deterministic. */
  retryAfter?: number;
}

export interface SourceContractFixtures {
  /** Expected declared surfaces (default: `config.surfaces`). */
  surfaces?: string[];
  /** Expected advertised mode (default: `config.mode ?? "poll"`). */
  mode?: "poll" | "push";
  /** Per-surface drain fixtures — the key is the surface name. */
  fetch: Record<string, SurfaceFixture>;
  /** `magnis.execute` table dispatch fixtures. */
  execute?: ExecuteFixture[];
  /** Rate-limit `-32002` signalling fixture. */
  rateLimit?: RateLimitFixture;
  /** Non-SDK drive injection (telegram). Default: SDK `handleMessage`. */
  drive?: Drive;
}

function assertEnvelope(e: Envelope, surface: string): void {
  expect(typeof e.remote_id).toBe("string");
  expect(e.remote_id.length).toBeGreaterThan(0);
  expect(["snapshot", "live", "delete"]).toContain(e.kind);
  expect(typeof e.payload).toBe("object");
  expect(e.payload).not.toBeNull();
  // The connector stamps the surface it was asked for.
  expect(e.surface).toBe(surface);
}

function unwrap(reply: Record<string, unknown>): FetchResult {
  if (reply.error) throw new Error(`fetch errored: ${JSON.stringify(reply.error)}`);
  return reply.result as FetchResult;
}

/**
 * The standard opt-in wire-contract suite a connector runs (Codex BLOCKING-3):
 * given an exported `config` (a `ConnectorConfig`, its `fetch` seam already wired
 * to a `mockFetch`) and per-surface `fixtures`, it drives the REAL wire path via
 * `handleMessage` and asserts —
 *   1. `initialize` advertises the declared surfaces + mode/capabilities;
 *   2. a FULL paginated drain per surface: feed `nextCursor` back until
 *      `hasMore=false`, asserting every envelope is well-formed, the cursor
 *      round-trips through JSON verbatim (the host stores it as-is), and the
 *      progress counters are present when the fixture declares them;
 *   3. the `magnis.execute` table dispatches by action name;
 *   4. an upstream 429 signals as the typed `-32002` + `data.retry_after`.
 *
 * What it does NOT cover: real OAuth / MTProto / live provider I/O — the fetch
 * seam is mocked, so token refresh, credential probing against a live provider,
 * and push (`listen_start`) delivery are the connector's OWN unit tests' job.
 */
export function runSourceContract(config: ConnectorConfig, fixtures: SourceContractFixtures): void {
  const drive = fixtures.drive ?? sdkDrive;
  const expectedSurfaces = fixtures.surfaces ?? config.surfaces;
  const expectedMode = fixtures.mode ?? config.mode ?? "poll";

  describe(`source contract: ${config.name}`, () => {
    test("initialize advertises declared surfaces + mode", async () => {
      const reply = await driveMessage(
        config,
        { jsonrpc: "2.0", id: ++msgId, method: "initialize", params: {} },
        drive,
      );
      const result = reply.result as Record<string, unknown>;
      const caps = result.capabilities as Record<string, unknown>;
      const sync = ((caps.experimental as Record<string, unknown>).magnis as Record<string, unknown>)
        .sync as { surfaces: string[]; mode: string };
      expect(sync.surfaces).toEqual(expectedSurfaces);
      expect(sync.mode).toBe(expectedMode);
      expect((result.serverInfo as { name: string }).name).toBe(config.name);
    });

    for (const [surface, fx] of Object.entries(fixtures.fetch)) {
      test(`fetch drains every page for surface '${surface}'`, async () => {
        const maxPages = fx.maxPages ?? 20;
        const counters = fx.expectCounters
          ? Array.isArray(fx.expectCounters)
            ? fx.expectCounters
            : [fx.expectCounters]
          : [];
        let cursor: unknown = fx.args?.cursor;
        let pages = 0;
        const all: Envelope[] = [];
        for (;;) {
          const args: Record<string, unknown> = { surface, ...fx.args };
          if (cursor !== undefined) args.cursor = cursor;
          if (fx.meta) args._meta = fx.meta;
          const result = unwrap(await driveMessage(config, toolCall("magnis.sync.fetch", args), drive));

          for (const e of result.envelopes) assertEnvelope(e, surface);
          all.push(...result.envelopes);

          // The host round-trips the cursor verbatim — it MUST survive JSON.
          const roundTripped: unknown = JSON.parse(JSON.stringify(result.nextCursor ?? null));
          expect(roundTripped).toEqual(result.nextCursor ?? null);

          for (const c of counters) {
            expect(c in result).toBe(true);
            const v = (result as unknown as Record<string, unknown>)[c];
            expect(v === null || typeof v === "number").toBe(true);
          }

          if (!result.hasMore) break;
          cursor = result.nextCursor;
          if (++pages > maxPages) {
            throw new Error(`drain exceeded ${String(maxPages)} pages for '${surface}'`);
          }
        }
        if (fx.minEnvelopes !== undefined) {
          expect(all.length).toBeGreaterThanOrEqual(fx.minEnvelopes);
        }
      });
    }

    if (fixtures.execute) {
      for (const ex of fixtures.execute) {
        test(`execute dispatches '${ex.action}'`, async () => {
          const args: Record<string, unknown> = { action: ex.action, ...ex.args };
          if (ex.meta) args._meta = ex.meta;
          const reply = await driveMessage(config, toolCall("magnis.execute", args), drive);
          expect(reply.error).toBeUndefined();
          if (ex.assert) ex.assert(reply.result as Record<string, unknown>);
        });
      }
    }

    if (fixtures.rateLimit) {
      const rl = fixtures.rateLimit;
      test("upstream 429 signals as typed -32002 + retry_after", async () => {
        const args: Record<string, unknown> = { surface: rl.surface, ...rl.args };
        if (rl.meta) args._meta = rl.meta;
        const reply = await driveMessage(rl.config, toolCall("magnis.sync.fetch", args), drive);
        const error = reply.error as Record<string, unknown> | undefined;
        expect(error).toBeDefined();
        expect(error?.code).toBe(-32002);
        const data = error?.data as Record<string, unknown> | undefined;
        expect(typeof data?.retry_after).toBe("number");
        if (rl.retryAfter !== undefined) expect(data?.retry_after).toBe(rl.retryAfter);
      });
    }
  });
}
