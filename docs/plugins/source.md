# Building a source, end to end

A **source** connects Magnis to an external service — Gmail, X, Telegram — and
streams what it finds into the graph. This guide takes you from an empty folder
to a conforming, tested source: what a source is, how it is laid out, how it
runs, how it authenticates, where secrets live, and how each surface fetches.

If you are building a **module** (a graph-owning plugin with UI), read
[module.md](./module.md) instead. For the big-picture model start at
[architecture.md](./architecture.md); the full `manifest.toml` fields are in
[manifest.md](./manifest.md), the file-structure standard and code rules in
[structure.md](./structure.md), and the cross-cutting commands in
[README.md](./README.md).

---

## 1. What a source is

A source is a **separate process** the host spawns and talks to over **stdio,
using line-delimited JSON-RPC** (the "Magnis Sync Profile"). It does its own
network I/O — OAuth, REST pagination, sockets — and emits **canonical
envelopes** the host routes into the graph. It owns **no schema**: the module
that owns a surface (contacts, email, meetings) owns the graph shape; the source
only produces data for it.

A source is, concretely, a `ConnectorConfig` object handed to `runConnector`.
The host cannot tell one source from another as long as the wire matches — so a
source can be written in any language that speaks the profile. This guide covers
the TypeScript/Bun path, which the SDK makes short.

Key consequences of the process boundary:
- A source has **real I/O** (this is why it is not a V8 isolate like a module).
- The process boundary **is the trust boundary**: a source is an authenticated
  peer; credentials arrive per call, never baked in.
- You can **run it by hand** — it is just a stdio program (see the Testing
  section below).

---

## 2. Layout

Group a source by **what it returns** — its surfaces. Each surface is a vertical
slice in its own folder; everything shared across surfaces sits in the `src/`
root.

```
<source>/
  manifest.toml          # package card + [auth], [credentials], [sync]
  README.md              # catalog description (markdown detail page)
  icon.svg|png           # catalog icon at the package root (optional)
  config.default.toml    # optional shipped default app-creds
  auth/                  # browser auth screen — ONLY for oauth2 / phone_code (see Authentication)
    index.tsx            # convention: the entry of a folder is index
  src/
    main.ts              # runConnector(buildConnectorConfig())  — the spawn entry
    connector.ts         # buildConnectorConfig(fetchFn = fetch) — wires surfaces
    api.ts / http.ts     # shared transport to the external service
    auth.ts / oauth.ts   # shared auth (ceremony + call-time token refresh)
    helpers.ts           # cross-surface utilities
    surfaces/
      <surface-a>/       # fetcher + its types + its remote-id/schema builders + its test
      <surface-b>/
    __tests__/           # runSourceContract test(s)
```

One folder per surface **declared in the manifest**, always a folder — a source
grows by surface (a Twitter source will add DMs, profiles, trends), and the
folder is where that growth lands without reshaping. Per-surface types and
remote-id builders live **inside** the surface folder; only cross-surface
plumbing (transport, auth, connector wiring, `main.ts`) sits in the root. A
health `probe`, the API client, auth — these are shared plumbing, root files
even if there is one of each.

---

## 3. How it runs — spawn, transport, handshake

**Spawn.** By convention: a source that ships `src/main.ts` is launched as
`bun run src/main.ts` with the source directory as cwd. Bun executes the
TypeScript directly — no build, no dist. A `[spawn]` block in the manifest
exists ONLY as an override for sources that deviate (an external binary like
x-mcp's npx bridge, or CLI flags).

**Entry.** `src/main.ts` is one line:

```ts
await runConnector(buildConnectorConfig());
```

`runConnector` reads stdin line by line, parses each as JSON-RPC, dispatches it,
and writes non-null replies to stdout. The loop is strictly **sequential** — one
message at a time. A notification (no `id`) gets no reply.

**Handshake and method table.** The host first calls `initialize`; the source
answers with its protocol version, `serverInfo`, and — under
`capabilities.experimental.magnis.sync` — its `surfaces`, `mode` (`poll` |
`push`), and poll interval, taken straight from the config. The full set of
methods a source answers (all via `tools/call` unless noted):

| method | handler | purpose |
|---|---|---|
| `initialize` | built-in | handshake; advertises surfaces + mode |
| `tools/list` | built-in | advertises the cred-less `magnis.sync.fetch` tool |
| `magnis.sync.fetch` | `config.fetch` | fetch one page of envelopes for a surface |
| `magnis.auth.probe` | `config.probeAuth` | verify a credential against the real provider |
| `magnis.auth.{begin,step,exchange,revoke}` | `config.auth[op]` | ceremony steps the host relays |
| `magnis.execute` | `config.execute[action]` | outbound actions (send, download, …) |
| `listen_start` / `listen_stop` | `config.listenStart/Stop` | open/close a push subscription |

The SDK gives you the whole loop, the handshake, `tools/list`, `_meta`
extraction, and error framing for free. You implement handlers on the config.

**Credential-less registration.** `initialize` and `tools/list` never require
a credential — a source registers unconditionally. A missing key fails at
**fetch**, not at registration.

---

## 4. Surfaces — fetching, envelopes, pagination

A **surface** is a named stream of canonical envelopes (`surfaces = ["email",
"meetings", "contacts"]`). Your `fetch` handler inspects `args.surface` and
delegates to the right surface fetcher — a `switch (surface)` in `connector.ts`,
throwing on an unknown surface.

**The fetcher** is `(args: FetchArgs) => Promise<FetchResult>`:

- `FetchArgs` = `{ surface, cursor?, direction?, tracked_handles?, limit?, meta?, raw? }`.
  `meta` carries host-injected credentials (see the Secrets section); `raw` is the verbatim call
  arguments for surface-specific extras (e.g. a calendar's `time_min`/`time_max`);
  `cursor` is whatever you returned last time.
- `FetchResult` = `{ envelopes, nextCursor, hasMore, total?, discovered? }`.

**The envelope** is the unit you emit:

```ts
interface Envelope {
  surface: string;                              // the surface this belongs to
  remote_id: string;                            // stable idempotency key
  kind: "snapshot" | "live" | "delete";
  payload: Record<string, unknown>;             // free-form; the module's ingest reads it
}
```

`remote_id` MUST be a stable, non-empty string — it is how the host deduplicates
(build it from a small helper, e.g. `x:post:{id}`). `payload` is free-form; the
owning module's `__sync__` handler reads a discriminator inside it (e.g.
`entity_type`). `kind` is `snapshot` for a full current-state row, `live` for a
new event, `delete` for a tombstone (empty payload).

**Pagination.** The cursor is **arbitrary JSON, round-tripped verbatim** by the
host — make it whatever you need (`{ page_token }`, `{ history_id, ... }`, a
number). Return `nextCursor` + `hasMore`; the host feeds `nextCursor` back until
`hasMore === false`. Two rules the contract enforces:
- The cursor MUST survive a JSON round-trip (the host stores it as-is).
- Never return `hasMore: true` without a cursor to advance on — a page that
  claims more with no way forward is a contract violation.

`direction` (`backward` / `forward`) lets one surface run a bootstrap drain
(backward, page tokens) and a catch-up (forward, e.g. a history cursor) — see
Gmail for the canonical two-path fetcher.

---

## 5. execute — outbound actions

A source may go beyond reading. `config.execute` is a table keyed by action
name, dispatched by `magnis.execute` with `{ action, ... }`; an unknown action
answers `-32601`. Each handler is `(args, meta) => Promise<Record<string,
unknown>>`. Google's table is `{ send_message, download_file }` —
`send_message` POSTs a draft and returns `{ message_id, thread_id }`. A
read-only source (X) simply omits the table.

---

## 6. Authentication

Auth is declared in **two decoupled manifest blocks**: `[auth]` selects the
**ceremony type** the host/UI runs; `[credentials]` declares the **keys** and how
they are injected. `[auth].type` is a host-side selector — your connector may
implement none, some, or all of the corresponding steps.

### The four kinds

| `[auth].type` | Used by | Connector implements |
|---|---|---|
| `api_key` | X | **only** `probeAuth` — verify the key; read it from `_meta` in fetch |
| `shared_provider` | Anysite | same as `api_key` (a shared upstream provider) |
| `oauth2` | Google | `auth.exchange` (+ `revoke`); host owns the browser ceremony |
| `phone_code` | Telegram | stateful `auth.begin` / `auth.step` / `auth.revoke` |

For `oauth2`, add the sub-table:

```toml
[auth]
type = "oauth2"
[auth.oauth2]
auth_url = "https://accounts.google.com/o/oauth2/v2/auth"
scopes   = ["openid", "email", "https://www.googleapis.com/auth/gmail.readonly"]
```

### The ceremony contract

Your connector optionally provides an auth table and a probe:

- `probeAuth(meta) => { subject }` — MUST hit the real provider with the injected
  credential and return the verified subject/identity. **Absent → provisioning
  is rejected.** This is the one auth hook almost every source implements.
- `auth.{begin, step, exchange, revoke}` — the ceremony steps the host relays.
  Each is `(args, meta) => Promise<Record<string, unknown>>`. An unimplemented
  op auto-answers `-32601`, so implement only what your kind needs.

**The host owns the OAuth browser ceremony** — state, PKCE, nonce, consent URL,
the `/auth/sources/<id>/callback` redirect. Your connector never sees a redirect;
for `oauth2` you implement only `exchange` (code → token).

### Three worked shapes

- **api_key (X).** No `auth` table. `probeAuth` reads `meta.bearer_token`, calls
  the provider's "me" endpoint, returns `{ subject }`. `fetch` reads the same key
  off `args.meta`. Done.
- **oauth2 (Google).** `auth.exchange(_args, meta)` reads `client_id, code,
  code_verifier, redirect_uri, nonce` from `_meta`, POSTs the token endpoint,
  validates the `id_token` claims, and returns the **minted** credential:
  `{ credential: refresh_token, identity: { key: sub, label } }`. At **call
  time**, `fetch` reads `{ refresh_token, client_id, client_secret }` from
  `_meta` and mints a short-lived access token per call (no caching); an
  `invalid_grant` throws `AuthExpiredError`.
- **phone_code (Telegram).** `begin` reads `api_id, api_hash, phone`, sends the
  code, and **parks live client state in a process global** (the host runs one
  process per auth session). `step` reads `code`; on 2FA it re-parks awaiting
  `password` and returns `{ state: "password" }`; on success mints
  `{ credential: session, identity }`. Because phone_code needs cross-call state
  and an auth-only spawn mode, Telegram supplies its own dispatcher instead of
  the SDK loop — see the Telegram exception below.

### The auth UI and the flow

For `oauth2` and `phone_code`, the source ships a **browser auth screen** at
`auth/index.tsx` (pure convention — presence is the declaration), sitting at
the source root beside `src/` — the way a module's `ui/` does. `api_key` /
`shared_provider` need **no screen**: the operator pastes the key in Settings →
Sources (the fields come from your `[credentials]` key objects — `label`,
`help_url`, `description`), the host stores it, and `probeAuth` verifies it.

The screen is loaded and transpiled by the host and rendered in a sealed
context, so it uses **plain elements + Tailwind only** — no `@magnis/host/ui`
import (the isolate shim can't fully provide it). One gotcha: utility classes
used *only* in a plugin auth screen are not scanned into the host's compiled
CSS, so `w-`/`h-` geometry classes silently no-op — set geometry with inline
`style`, and reuse colour classes the host already ships.

The two flows are fundamentally different:

**oauth2 — a pure browser round-trip, host-owned.** The screen does almost
nothing:

```ts
export interface SourceAuthScreenProps { sourceId: string }
// button onClick:
window.location.assign(`/auth/sources/${sourceId}/start`);
```

The host owns the whole ceremony: `/auth/sources/<id>/start` 302-redirects to
the provider's consent page; after consent the provider hits the host callback
(`/auth/sources/<id>/callback`); the host runs your connector's
`magnis.auth.exchange` **server-side** (code → minted `refresh_token`), stores
it, and returns to the app with `?source_connected=<id>`. No secret, token, or
connector transport touches the component. (In practice the generic host
`SourceConnect` component performs this navigation, so the screen is the catalog
fallback.)

**phone_code — a multi-step form driven through the host.** No redirect. The
host injects **driver props** so the screen never touches the transport itself:

```ts
export interface SourceAuthScreenProps {
  sourceId: string;
  submit: (step: "phone" | "code" | "password", value: string) => Promise<void>;  // → source.auth.submit (host stashes the value)
  exec:   (op: "begin" | "step") => Promise<{ status: string }>;                   // → source.auth.exec  ("code_sent" | "password" | "connected")
  onConnected?: () => void;
}
```

The end-to-end sequence:

1. User enters the phone number → `submit("phone", phone)` stashes it host-side
   → `exec("begin")` relays into your connector's `magnis.auth.begin` with the
   stashed value in `_meta` → screen advances to the code step.
2. User enters the login code → `submit("code", code)` → `exec("step")` →
   `magnis.auth.step`. The returned `status` decides the next phase: `password`
   (2FA needed) or `connected`.
3. If `password`: user enters it → `submit("password", …)` → `exec("step")` →
   `connected`.
4. `onConnected()` fires; the connector's minted `session` credential is stored
   host-side keyed by connection and **never returns to the browser**.

So the screen collects input and calls `submit`/`exec`; the host stashes each
value and injects it into the connector's `magnis.auth.*` calls via `_meta`.
Your connector implements only the `begin`/`step` handlers (above); the UI and
the host wiring are what turn them into a login flow.

---

## 7. Secrets — where credentials live and how they arrive

**You never read a secret store.** The host resolves credentials and injects
them; the connector reads `_meta` (or, rarely, `process.env`). The storage and
encryption are host-side.

**Two-layer credential model:**
1. **Shipped defaults** — a source may bundle default app-creds in
   `config.default.toml` under `[credentials.default]` (e.g. a client_id).
2. **Vault override** — a deploy overrides those via the encrypted vault (DB),
   set by an admin through `source.appconfig.set`. For operator-entered keys the
   resolution order is **vault → env**.

**Declare your keys** in `[credentials]`:

```toml
[credentials]
keys   = ["refresh_token", "client_id", "client_secret"]   # or object form (label/help_url) to show in Settings → Sources
minted = ["refresh_token"]                                  # keys the ceremony produces (vs operator-supplied)
# inject = "env"  — write ONLY for env injection; the default (per-call _meta) is written by omission
```

- **`minted`** are credentials the auth ceremony returns (`{ credential }`) —
  Google `refresh_token`, Telegram `session`. They are stored host-side keyed by
  connection and **never return to the browser**.
- **`_meta` injection** (the default, written by omission) — the host attaches credentials as a
  `_meta` object on **every** `tools/call`. The SDK extracts it and threads it to
  every handler, so you read `args.meta.<key>` in fetch/execute/auth and
  `meta.<key>` in probe. Validate your own keys and throw a clear
  missing-credential error (the shape is untyped `Record<string, unknown>`).
- **`inject = "env"`** (x-mcp only — the one written form) — the host puts the key in the child process
  environment at spawn (uppercased key name); saving a key in Settings respawns
  the source. Use this only when the underlying binary reads env, not `_meta`.

---

## 8. Errors and rate limiting

A fetch failure must **never crash the connector** — throw a typed error; the SDK
maps it to a JSON-RPC error and the host backs off the surface. The typed
classes and their codes:

| Throw | Wire code | Host reaction |
|---|---|---|
| `RateLimitError(retryAfterSecs)` | `-32002` + `data.retry_after` | back off `retry_after` seconds (host reads the typed field, not the message) |
| `CursorExpiredError(msg)` | `-32003` | reset the surface to bootstrap and re-sync |
| `ConnectorError(msg, data, code?)` | typed | `data.kind` (`auth`/`network`/`rate_limited`) classifies it host-side |
| plain `Error` | `-32000` | untyped generic failure |

On an upstream **HTTP 429**, throw `RateLimitError(retryAfter)` parsed from the
`Retry-After` header. Telegram's `FLOOD_WAIT` maps the same way (short waits are
absorbed inline with one retry; long ones surface). The contract test asserts an
upstream 429 surfaces as `-32002` with a numeric `data.retry_after`.

---

## 9. Testing — testkit, and running it by hand

Source tests run under **`bun test`** (not vitest) — a source runs under Bun at
spawn, so its tests run in the same runtime. Use `@magnis/testkit/source`:

- **`mockFetch(routes)`** — a fake `fetch` you inject via
  `buildConnectorConfig(mockFetch(...))`. This is why `buildConnectorConfig`
  MUST take `fetchFn` as a parameter.
- **`runSourceContract(config, fixtures)`** — the standard prove-out: asserts
  `initialize`, drains every surface to `hasMore: false` (round-tripping each
  cursor through JSON), checks the `execute` table, and asserts `429 → -32002 +
  retry_after`. Every source ships one.

```ts
// src/__tests__/<name>Contract.test.ts  (bun:test)
runSourceContract(buildConnectorConfig(mockFetch(routes)), fixtures);
```

**Run it by hand** — a source is a plain stdio MCP server, so drive it without
the host:

```bash
cd plugins/sources/<name>
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | bun run src/main.ts
```

Pipe successive JSON-RPC lines (`tools/call` for `magnis.sync.fetch`, with a
`_meta` credential) to walk fetch/execute exactly as the host does.

---

## 10. When to deviate — the Telegram exception

The SDK path (`runConnector` / `handleMessage`) is **canonical**: every source
should use it. Telegram is the one deliberate exception — it ships its own
dispatcher because it needs two things the SDK has no hook for: (1) an
`--auth-mode` spawn that serves **only** `magnis.auth.*` (and a sync spawn that
refuses them), and (2) keeping a live client alive across `begin → step`. If you
think you need to deviate, you almost certainly do not — reach for the SDK path
first, and treat a custom dispatcher as a last resort with a documented reason.

---

## 11. Conformance checklist

A source is done only when all hold:

- [ ] `bun run typecheck` clean; `bun run lint` clean (0 warnings, no `any`).
- [ ] One `surfaces/<name>/` folder per manifest surface; per-surface types +
      remote-id builders inside it. `src/` root holds only shared plumbing.
- [ ] `main.ts` is `runConnector(buildConnectorConfig())` and nothing else.
- [ ] `buildConnectorConfig(fetchFn = fetch)` takes an injectable fetch.
- [ ] Every fetcher emits envelopes with a stable non-empty `remote_id`, a valid
      `kind`, and `surface` equal to the requested surface.
- [ ] Pagination round-trips its cursor and never claims `hasMore` without one.
- [ ] `probeAuth` verifies against the real provider; auth ops implemented match
      the declared `[auth].type`.
- [ ] For `oauth2` / `phone_code`: an `auth/index.tsx` exists (plain elements +
      Tailwind, geometry inline) and drives the flow via the host
      (`window.location` for oauth2; `submit`/`exec` props for phone_code).
- [ ] `[credentials]` declares keys / `minted` / `inject`; the connector reads
      only `_meta` (or env for `inject = "env"`), never a secret store.
- [ ] Rate limits throw `RateLimitError` → `-32002` with `retry_after`.
- [ ] A `runSourceContract` test covers every surface + the rate-limit mapping,
      green under `bun run test:connectors`.
