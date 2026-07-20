// ══════════════════════ SOURCE (CONNECTOR) CONTRACT ══════════════════════
//
// Idiom: a source is a plain config object. You implement `ConnectorConfig` and
// pass it to `runConnector`. (Contrast: a module is a decorator-declared class +
// config; a lifecycle is a set of hooks.)
//
// What a source is: a source is an MCP-over-stdio process; implement
// `ConnectorConfig` (fetch cursors, optional push via listenStart/Stop, auth
// ceremony, execute table, rate-limit signalling) and pass it to
// `runConnector`. The host cannot tell one implementation from another as long
// as the wire matches.
//
// This file is PURE TYPES — zero runtime. `runConnector`, `handleMessage`, the
// error classes (`RateLimitError` / `CursorExpiredError` / `ConnectorError`),
// and the JSON-RPC codes live in `../index.ts` and import their types from here.
// Every name below is re-exported from `@magnis/connector-sdk`, so this move
// changes no consumer.

/** One canonical sync envelope the host routes to the owning module's surface. */
export interface Envelope {
  surface: string;
  remote_id: string;
  kind: "snapshot" | "live" | "delete";
  payload: Record<string, unknown>;
}

export interface FetchArgs {
  surface: string;
  /** Arbitrary JSON cursor — the host round-trips it verbatim; a
   * numeric cursor is just the JSON number a poll connector chose. */
  cursor?: unknown;
  /** Present-to-past by default; the host may ask "forward" on catch-up. */
  direction?: "backward" | "forward";
  /** Tracked handles for this platform — the host passes the opt-in set. */
  tracked_handles?: string[];
  limit?: number;
  /** Host-injected credentials: the `_meta` object the host attaches to
   * each tools/call — e.g. `{ bearer_token }` (X) / `{ anysite_key }` (LinkedIn). */
  meta?: Record<string, unknown>;
  /** The verbatim tools/call `arguments`. Surface-specific extras the typed
   * fields above do not model live here — e.g. the Google connector's calendar
   * `time_min`/`time_max` window, which its Rust twin reads straight off the
   * action payload. Prefer a typed field above when one fits. */
  raw?: Record<string, unknown>;
}

export interface FetchResult {
  envelopes: Envelope[];
  nextCursor: unknown;
  hasMore: boolean;
  /** Optional sync-progress counters (profile.rs: bootstrap bar). */
  total?: number | null;
  discovered?: number | null;
}

/** The read handler — called for magnis.sync.fetch. Read-only. */
export type FetchHandler = (args: FetchArgs) => Promise<FetchResult>;

/** ProbeAuth — called for magnis.auth.probe. MUST hit
 * the real provider with the injected key and return the verified subject. */
export type ProbeAuthHandler = (meta: Record<string, unknown> | undefined) => Promise<{ subject: string }>;

/** Push session open: called on `listen_start` (and the legacy
 * `magnis.sync.listen` alias). `emit` stamps + writes one envelope notification
 * for THIS subscription; after `listen_stop` it no-ops. */
export type ListenStartHandler = (
  args: { subscription_id: string; meta?: Record<string, unknown> },
  emit: (envelope: Envelope) => void,
) => Promise<void>;

/** Push session close: called on `listen_stop`. */
export type ListenStopHandler = (args: { subscription_id: string }) => Promise<void>;

/** One host-relayed handler in the auth table / execute table: takes the
 * tools/call `arguments` plus the injected `_meta`, answers with a JSON result.
 * The auth ceremony and outbound-action tables share this signature. */
export type ConnectorActionHandler = (
  args: Record<string, unknown>,
  meta: Record<string, unknown> | undefined,
) => Promise<Record<string, unknown>>;

/** Auth-flow handlers — the host relays magnis.auth.begin/step/exchange/
 * revoke here with host-held inputs (+ `_meta`). A missing handler answers
 * -32601 (this connector doesn't implement that step). */
export type AuthHandlers = Partial<Record<"begin" | "step" | "exchange" | "revoke", ConnectorActionHandler>>;

/** Outbound actions: `magnis.execute` payload `{ action, ... }` dispatches
 * by name; unknown action answers -32601. */
export type ExecuteTable = Record<string, ConnectorActionHandler>;

export interface ConnectorConfig {
  name: string;
  version: string;
  /** Surfaces this connector feeds (e.g. ["social"]). */
  surfaces: string[];
  /** Poll cadence advertised in capabilities. */
  intervalSecs?: number;
  /** The read handler — called for magnis.sync.fetch. Read-only. */
  fetch: FetchHandler;
  /** ProbeAuth — called for magnis.auth.probe. MUST
   * hit the real provider with the injected key and return the verified
   * subject. Absent → magnis.auth.probe stays rejected (source cannot be
   * provisioned). */
  probeAuth?: ProbeAuthHandler;
  /** "push" advertises live delivery: the host opens `listen_start`
   * subscriptions and consumes `notifications/magnis/envelope`. */
  mode?: "poll" | "push";
  /** Push session open: called on `listen_start` (and the legacy
   * `magnis.sync.listen` alias). `emit` stamps + writes one envelope
   * notification for THIS subscription; after `listen_stop` it no-ops. */
  listenStart?: ListenStartHandler;
  /** Push session close: called on `listen_stop`. */
  listenStop?: ListenStopHandler;
  /** Auth-flow handlers — the host relays magnis.auth.begin/step/
   * exchange/revoke here with host-held inputs (+ `_meta`). A missing
   * handler answers -32601 (this connector doesn't implement that step). */
  auth?: AuthHandlers;
  /** Outbound actions: `magnis.execute` payload `{ action, ... }`
   * dispatches by name; unknown action answers -32601. */
  execute?: ExecuteTable;
  /** Notification writer override (tests). Default: process.stdout. */
  onNotification?: (line: string) => void;
}
