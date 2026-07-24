// @bun
var __require = import.meta.require;

// packages/connector-sdk/index.ts
var RATE_LIMIT_CODE = -32002;
var CURSOR_EXPIRED_CODE = -32003;
var GENERIC_FETCH_ERROR_CODE = -32000;

class RateLimitError extends Error {
  retryAfterSecs;
  constructor(retryAfterSecs) {
    super(`rate limited; retry_after=${String(retryAfterSecs)}`);
    this.retryAfterSecs = retryAfterSecs;
    this.name = "RateLimitError";
  }
}

class CursorExpiredError extends Error {
  constructor(message) {
    super(message);
    this.name = "CursorExpiredError";
  }
}

class ConnectorError extends Error {
  data;
  code;
  constructor(message, data, code = GENERIC_FETCH_ERROR_CODE) {
    super(message);
    this.data = data;
    this.code = code;
    this.name = "ConnectorError";
  }
}
function errorReply(id, e) {
  if (e instanceof ConnectorError) {
    return { jsonrpc: "2.0", id, error: { code: e.code, message: e.message, data: e.data } };
  }
  if (e instanceof RateLimitError) {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: RATE_LIMIT_CODE,
        message: e.message,
        data: { retry_after: e.retryAfterSecs }
      }
    };
  }
  if (e instanceof CursorExpiredError) {
    return {
      jsonrpc: "2.0",
      id,
      error: { code: CURSOR_EXPIRED_CODE, message: e.message }
    };
  }
  const message = e instanceof Error ? e.message : String(e);
  return { jsonrpc: "2.0", id, error: { code: GENERIC_FETCH_ERROR_CODE, message } };
}
var liveSubscriptions = new Set;
function extractMeta(args) {
  return args._meta && typeof args._meta === "object" ? args._meta : undefined;
}
function makeEmitter(config, subscriptionId) {
  const write = config.onNotification ?? ((line) => {
    process.stdout.write(line + `
`);
  });
  return (envelope) => {
    if (!liveSubscriptions.has(subscriptionId))
      return;
    write(JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/magnis/envelope",
      params: {
        subscription_id: subscriptionId,
        surface: envelope.surface,
        remote_id: envelope.remote_id,
        kind: envelope.kind,
        payload: envelope.payload
      }
    }));
  };
}
function capabilities(config) {
  return {
    tools: {},
    experimental: {
      magnis: {
        sync: {
          surfaces: config.surfaces,
          mode: config.mode ?? "poll",
          interval_secs: config.intervalSecs ?? 300
        }
      }
    }
  };
}
async function handleMessage(msg, config) {
  const id = msg.id;
  const method = msg.method ?? "";
  if (id === undefined || id === null)
    return null;
  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2025-06-18",
        capabilities: capabilities(config),
        serverInfo: { name: config.name, version: config.version }
      }
    };
  }
  if (method === "tools/call") {
    const name = msg.params?.name ?? "";
    if (name === "magnis.auth.probe" && config.probeAuth) {
      const args2 = msg.params?.arguments ?? {};
      const meta2 = args2._meta && typeof args2._meta === "object" ? args2._meta : undefined;
      try {
        const result = await config.probeAuth(meta2);
        return { jsonrpc: "2.0", id, result };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          jsonrpc: "2.0",
          id,
          error: { code: GENERIC_FETCH_ERROR_CODE, message, data: { kind: "auth", message } }
        };
      }
    }
    const rawArgs = msg.params?.arguments ?? {};
    const metaArg = extractMeta(rawArgs);
    if (name === "listen_start" && config.listenStart) {
      const subscriptionId = typeof rawArgs.subscription_id === "string" && rawArgs.subscription_id ? rawArgs.subscription_id : "sub:legacy";
      liveSubscriptions.add(subscriptionId);
      try {
        await config.listenStart({ subscription_id: subscriptionId, meta: metaArg }, makeEmitter(config, subscriptionId));
        return { jsonrpc: "2.0", id, result: { ok: true, subscription_id: subscriptionId } };
      } catch (e) {
        liveSubscriptions.delete(subscriptionId);
        const message = e instanceof Error ? e.message : String(e);
        return { jsonrpc: "2.0", id, error: { code: GENERIC_FETCH_ERROR_CODE, message } };
      }
    }
    if (name === "listen_stop" && config.listenStop) {
      const subscriptionId = typeof rawArgs.subscription_id === "string" ? rawArgs.subscription_id : "sub:legacy";
      liveSubscriptions.delete(subscriptionId);
      try {
        await config.listenStop({ subscription_id: subscriptionId });
        return { jsonrpc: "2.0", id, result: { ok: true } };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return { jsonrpc: "2.0", id, error: { code: GENERIC_FETCH_ERROR_CODE, message } };
      }
    }
    if (name === "magnis.sync.listen" && config.listenStart) {
      const account = metaArg && typeof metaArg.account_id === "string" ? metaArg.account_id : undefined;
      const subscriptionId = account ? `sub:${account}` : "sub:legacy";
      liveSubscriptions.add(subscriptionId);
      try {
        await config.listenStart({ subscription_id: subscriptionId, meta: metaArg }, makeEmitter(config, subscriptionId));
        return { jsonrpc: "2.0", id, result: { ok: true, subscription_id: subscriptionId } };
      } catch (e) {
        liveSubscriptions.delete(subscriptionId);
        const message = e instanceof Error ? e.message : String(e);
        return { jsonrpc: "2.0", id, error: { code: GENERIC_FETCH_ERROR_CODE, message } };
      }
    }
    if (name.startsWith("magnis.auth.") && name !== "magnis.auth.probe") {
      const op = name.slice("magnis.auth.".length);
      const handler = config.auth?.[op];
      if (!handler) {
        return { jsonrpc: "2.0", id, error: { code: -32601, message: `unknown tool ${name}` } };
      }
      try {
        const result = await handler(rawArgs, metaArg);
        return { jsonrpc: "2.0", id, result };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          jsonrpc: "2.0",
          id,
          error: { code: GENERIC_FETCH_ERROR_CODE, message, data: { kind: "auth", message } }
        };
      }
    }
    if (name === "magnis.execute") {
      const action = typeof rawArgs.action === "string" ? rawArgs.action : "";
      const handler = config.execute?.[action];
      if (!handler) {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `unknown execute action '${action}'` }
        };
      }
      try {
        const result = await handler(rawArgs, metaArg);
        return { jsonrpc: "2.0", id, result };
      } catch (e) {
        return errorReply(id, e);
      }
    }
    if (name !== "magnis.sync.fetch") {
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `unknown tool ${name}` }
      };
    }
    const args = rawArgs;
    const surface = typeof args.surface === "string" ? args.surface : config.surfaces[0] ?? "";
    const cursor = args.cursor;
    const direction = args.direction === "forward" || args.direction === "backward" ? args.direction : undefined;
    const tracked = Array.isArray(args.tracked_handles) ? args.tracked_handles.filter((h) => typeof h === "string") : undefined;
    const limit = typeof args.limit === "number" ? args.limit : undefined;
    const meta = metaArg;
    try {
      const result = await config.fetch({
        surface,
        cursor,
        direction,
        tracked_handles: tracked,
        limit,
        meta,
        raw: args
      });
      return { jsonrpc: "2.0", id, result };
    } catch (e) {
      return errorReply(id, e);
    }
  }
  if (method === "tools/list") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        tools: [
          {
            name: "magnis.sync.fetch",
            description: "Fetch a page of canonical envelopes for a surface.",
            inputSchema: {
              type: "object",
              properties: {
                surface: { type: "string" },
                cursor: { type: "integer" },
                tracked_handles: { type: "array", items: { type: "string" } },
                limit: { type: "integer" }
              },
              required: ["surface"]
            }
          }
        ]
      }
    };
  }
  return { jsonrpc: "2.0", id, error: { code: -32601, message: `unknown method ${method}` } };
}
async function runConnector(config) {
  const { createInterface } = await import("readline");
  const rl = createInterface({ input: process.stdin });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed)
      continue;
    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const reply = await handleMessage(msg, config);
    if (reply)
      process.stdout.write(JSON.stringify(reply) + `
`);
  }
}

// plugins/sources/google/src/connector.ts
import { mkdir, writeFile } from "fs/promises";
import { dirname } from "path";

// plugins/sources/google/src/http.ts
class GoogleRateLimitError extends RateLimitError {
  constructor(retryAfterSecs) {
    super(retryAfterSecs);
    this.message = `Google rate limited: retry after ${String(retryAfterSecs)}s`;
  }
}

class AuthExpiredError extends Error {
  constructor(text) {
    super(`Google authorization expired: ${text}`);
    this.name = "AuthExpiredError";
  }
}

class HistoryExpiredError extends CursorExpiredError {
  constructor() {
    super("Gmail historyId expired (404)");
    this.name = "HistoryExpiredError";
  }
}

class ContactsCursorExpiredError extends CursorExpiredError {
  constructor() {
    super("Google contacts pageToken expired (400 FAILED_PRECONDITION)");
    this.name = "ContactsCursorExpiredError";
  }
}
function isFatal(e) {
  return e instanceof RateLimitError || e instanceof AuthExpiredError || e instanceof HistoryExpiredError;
}
var MAX_RETRIES = 3;
var HTTP_REQUEST_TIMEOUT_MS = 30000;

class HttpTimeoutError extends Error {
  url;
  ms;
  constructor(url, ms) {
    super(`Google request to ${url} timed out after ${String(ms)}ms`);
    this.url = url;
    this.ms = ms;
    this.name = "HttpTimeoutError";
  }
}
async function fetchWithTimeout(fetchFn, url, init, timeoutMs = HTTP_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController;
  const timeoutError = new HttpTimeoutError(url, timeoutMs);
  const timer = setTimeout(() => {
    controller.abort(timeoutError);
  }, timeoutMs);
  try {
    return await fetchFn(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (controller.signal.aborted)
      throw timeoutError;
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
async function fetchWithRetry(fetchFn, url, init) {
  let attempt = 0;
  for (;; ) {
    try {
      return await fetchWithTimeout(fetchFn, url, init);
    } catch (e) {
      if (attempt >= MAX_RETRIES)
        throw e;
      attempt += 1;
      await new Promise((r) => setTimeout(r, 300 * 2 ** attempt));
    }
  }
}
function checkRateLimit(resp) {
  if (resp.status !== 429)
    return;
  const retryAfter = Number.parseInt(resp.headers.get("retry-after") ?? "", 10) || 60;
  throw new GoogleRateLimitError(retryAfter);
}

// plugins/sources/google/src/auth.ts
function credsFromMeta(meta) {
  if (meta === undefined) {
    throw new Error("missing _meta with Google credentials");
  }
  const get = (k) => {
    const v = meta[k];
    if (typeof v !== "string" || v === "") {
      throw new Error(`missing credential '${k}' in _meta`);
    }
    return v;
  };
  return {
    refresh_token: get("refresh_token"),
    client_id: get("client_id"),
    client_secret: get("client_secret")
  };
}
async function refreshAccessToken(creds, fetchFn) {
  const body = new URLSearchParams({
    client_id: creds.client_id,
    client_secret: creds.client_secret,
    refresh_token: creds.refresh_token,
    grant_type: "refresh_token"
  }).toString();
  const resp = await fetchWithRetry(fetchFn, "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  if (!resp.ok) {
    const text = await resp.text();
    if (text.includes("invalid_grant"))
      throw new AuthExpiredError(text);
    throw new Error(`Token refresh failed: ${text}`);
  }
  const json = await resp.json();
  if (typeof json.access_token !== "string") {
    throw new Error("Token refresh failed: response missing access_token");
  }
  return json.access_token;
}

// plugins/sources/google/src/helpers.ts
function rawStr(raw, key) {
  const v = raw?.[key];
  return typeof v === "string" ? v : undefined;
}
function formatUtc(d) {
  const iso = d.toISOString();
  return iso.endsWith(".000Z") ? `${iso.slice(0, -5)}Z` : iso;
}

// plugins/sources/google/src/progress.ts
function asObj(v) {
  return v !== null && typeof v === "object" ? v : undefined;
}
function progressCursor(priorCursor, pageLen, total) {
  const c = asObj(priorCursor);
  const priorDiscovered = typeof c?.discovered === "number" ? c.discovered : 0;
  const priorTotal = typeof c?.total === "number" ? c.total : undefined;
  return { discovered: priorDiscovered + pageLen, total: total ?? priorTotal };
}
function mergeProgress(cursor, progress) {
  cursor.discovered = progress.discovered;
  if (progress.total !== undefined)
    cursor.total = progress.total;
}

// plugins/sources/google/src/surfaces/meetings/schema.ts
var calendarRemoteId = (eventId) => `gcal:${eventId}`;

// plugins/sources/google/src/validate.ts
function missing(ctx, field) {
  return new Error(`${ctx}: missing field \`${field}\``);
}
function badType(ctx, field, expected) {
  return new Error(`${ctx}: invalid type for \`${field}\`, expected ${expected}`);
}
function asObject(v, ctx) {
  if (v === null || typeof v !== "object" || Array.isArray(v)) {
    throw new Error(`${ctx}: invalid type, expected an object`);
  }
  return v;
}
function reqString(o, field, ctx) {
  const v = o[field];
  if (typeof v === "string")
    return v;
  if (v === undefined || v === null)
    throw missing(ctx, field);
  throw badType(ctx, field, "a string");
}
function optString(o, field, ctx) {
  const v = o[field];
  if (v === undefined || v === null)
    return null;
  if (typeof v !== "string")
    throw badType(ctx, field, "a string");
  return v;
}
function optNumber(o, field, ctx) {
  const v = o[field];
  if (v === undefined || v === null)
    return null;
  if (typeof v !== "number")
    throw badType(ctx, field, "a number");
  return v;
}
function optBool(o, field, ctx) {
  const v = o[field];
  if (v === undefined || v === null)
    return null;
  if (typeof v !== "boolean")
    throw badType(ctx, field, "a boolean");
  return v;
}
function defaultBool(o, field, ctx) {
  const v = o[field];
  if (v === undefined)
    return false;
  if (typeof v !== "boolean")
    throw badType(ctx, field, "a boolean");
  return v;
}
function optObject(o, field, ctx) {
  const v = o[field];
  if (v === undefined || v === null)
    return null;
  if (typeof v !== "object" || Array.isArray(v)) {
    throw badType(ctx, field, "an object");
  }
  return v;
}
function reqObject(o, field, ctx) {
  const v = o[field];
  if (v === undefined || v === null)
    throw missing(ctx, field);
  if (typeof v !== "object" || Array.isArray(v)) {
    throw badType(ctx, field, "an object");
  }
  return v;
}
function defaultObject(o, field, ctx) {
  const v = o[field];
  if (v === undefined)
    return {};
  if (v === null || typeof v !== "object" || Array.isArray(v)) {
    throw badType(ctx, field, "an object");
  }
  return v;
}
function optObjectArray(o, field, ctx) {
  const v = o[field];
  if (v === undefined || v === null)
    return null;
  return objectArray(v, field, ctx);
}
function defaultObjectArray(o, field, ctx) {
  const v = o[field];
  if (v === undefined)
    return [];
  return objectArray(v, field, ctx);
}
function defaultStringArray(o, field, ctx) {
  const v = o[field];
  if (v === undefined)
    return [];
  if (!Array.isArray(v))
    throw badType(ctx, field, "a sequence");
  return v.map((item, i) => {
    if (typeof item !== "string")
      badTypeThrow(ctx, field, i, "a string");
    return item;
  });
}
function optStringArray(o, field, ctx) {
  const v = o[field];
  if (v === undefined || v === null)
    return null;
  return defaultStringArray(o, field, ctx);
}
function badTypeThrow(ctx, field, index, expected) {
  throw new Error(`${ctx}: invalid type for \`${field}[${String(index)}]\`, expected ${expected}`);
}
function objectArray(v, field, ctx) {
  if (!Array.isArray(v))
    throw badType(ctx, field, "a sequence");
  return v.map((item, i) => {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      badTypeThrow(ctx, field, i, "an object");
    }
    return item;
  });
}

// plugins/sources/google/src/surfaces/meetings/calendar.ts
function parseGcalDateTime(o, field, ctx) {
  const dt = optObject(o, field, ctx);
  if (dt === null)
    return null;
  const c = `${ctx}.${field}`;
  return {
    dateTime: optString(dt, "dateTime", c),
    date: optString(dt, "date", c)
  };
}
function parseGcalEventsResponse(v) {
  const ctx = "GcalEventsResponse";
  const o = asObject(v, ctx);
  const items = optObjectArray(o, "items", ctx);
  return {
    items: items === null ? null : items.map((ev, i) => {
      const c = `${ctx}.items[${String(i)}]`;
      const attendees = optObjectArray(ev, "attendees", c);
      return {
        id: reqString(ev, "id", c),
        summary: optString(ev, "summary", c),
        description: optString(ev, "description", c),
        location: optString(ev, "location", c),
        status: optString(ev, "status", c),
        start: parseGcalDateTime(ev, "start", c),
        end: parseGcalDateTime(ev, "end", c),
        attendees: attendees === null ? null : attendees.map((a, j) => ({
          email: optString(a, "email", `${c}.attendees[${String(j)}]`),
          displayName: optString(a, "displayName", `${c}.attendees[${String(j)}]`)
        })),
        hangoutLink: optString(ev, "hangoutLink", c)
      };
    }),
    nextPageToken: optString(o, "nextPageToken", ctx)
  };
}
function resolveDatetime(dt) {
  if (dt?.dateTime !== null && dt?.dateTime !== undefined) {
    const t = Date.parse(dt.dateTime);
    if (Number.isNaN(t))
      throw new Error(`bad datetime '${dt.dateTime}'`);
    return [formatUtc(new Date(t)), false];
  }
  if (dt?.date !== null && dt?.date !== undefined) {
    const iso = `${dt.date}T00:00:00Z`;
    const t = Date.parse(iso);
    if (Number.isNaN(t))
      throw new Error(`bad date '${dt.date}'`);
    return [formatUtc(new Date(t)), true];
  }
  return [formatUtc(new Date), false];
}
function gcalEventToCalendarEvent(ev) {
  const [startsAt, allDay] = resolveDatetime(ev.start);
  const [endsAt] = resolveDatetime(ev.end);
  const attendees = (ev.attendees ?? []).flatMap((a) => a.email !== null && a.email !== undefined ? [{ name: a.displayName ?? null, email: a.email }] : []);
  return {
    id: ev.id,
    title: ev.summary ?? "Untitled Event",
    description: ev.description ?? null,
    location: ev.location ?? null,
    starts_at: startsAt,
    ends_at: endsAt,
    all_day: allDay,
    status: ev.status ?? "confirmed",
    attendees,
    conference_link: ev.hangoutLink ?? null
  };
}
async function listEventsPage(token, timeMin, timeMax, pageToken, fetchFn) {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250"
  });
  if (pageToken !== undefined)
    params.set("pageToken", pageToken);
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`;
  const resp = await fetchWithRetry(fetchFn, url, {
    headers: { authorization: `Bearer ${token}` }
  });
  checkRateLimit(resp);
  if (!resp.ok) {
    throw new Error(`Calendar list events failed: ${await resp.text()}`);
  }
  return parseGcalEventsResponse(await resp.json());
}
var DAY_MS = 86400000;
async function fetchEventsPage(token, cursor, window, fetchFn) {
  const timeMin = window.time_min ?? new Date(Date.now() - 30 * DAY_MS).toISOString();
  const timeMax = window.time_max ?? new Date(Date.now() + 90 * DAY_MS).toISOString();
  const c = cursor !== null && typeof cursor === "object" ? cursor : undefined;
  const pageToken = typeof c?.page_token === "string" ? c.page_token : undefined;
  const page = await listEventsPage(token, timeMin, timeMax, pageToken, fetchFn);
  const envelopes = [];
  for (const ev of page.items ?? []) {
    if (ev.status === "cancelled")
      continue;
    let calEvent;
    try {
      calEvent = gcalEventToCalendarEvent(ev);
    } catch (e) {
      console.error(`magnis-google: failed to convert calendar event ${ev.id}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    envelopes.push({
      surface: "meetings",
      payload: calEvent,
      remote_id: calendarRemoteId(ev.id),
      kind: "snapshot"
    });
  }
  const progress = progressCursor(cursor, envelopes.length, undefined);
  let nextCursor = null;
  if (typeof page.nextPageToken === "string") {
    nextCursor = { page_token: page.nextPageToken };
    mergeProgress(nextCursor, progress);
  }
  return { envelopes, nextCursor, discovered: progress.discovered };
}

// plugins/sources/google/src/surfaces/contacts/contacts.ts
import { createHash } from "crypto";

// plugins/sources/google/src/surfaces/contacts/schema.ts
var contactRemoteId = (stableId) => `gpeople:${stableId}`;

// plugins/sources/google/src/surfaces/contacts/contacts.ts
function parseMetadata(o, ctx) {
  const m = defaultObject(o, "metadata", ctx);
  return { primary: defaultBool(m, "primary", `${ctx}.metadata`) };
}
function parseGpeopleConnectionsResponse(v) {
  const ctx = "GpeopleConnectionsResponse";
  const o = asObject(v, ctx);
  const connections = defaultObjectArray(o, "connections", ctx).map((p, i) => {
    const c = `${ctx}.connections[${String(i)}]`;
    return {
      resourceName: reqString(p, "resourceName", c),
      names: defaultObjectArray(p, "names", c).map((n, j) => ({
        displayName: optString(n, "displayName", `${c}.names[${String(j)}]`),
        givenName: optString(n, "givenName", `${c}.names[${String(j)}]`),
        familyName: optString(n, "familyName", `${c}.names[${String(j)}]`),
        metadata: parseMetadata(n, `${c}.names[${String(j)}]`)
      })),
      emailAddresses: defaultObjectArray(p, "emailAddresses", c).map((e, j) => ({
        value: optString(e, "value", `${c}.emailAddresses[${String(j)}]`),
        type: optString(e, "type", `${c}.emailAddresses[${String(j)}]`),
        metadata: parseMetadata(e, `${c}.emailAddresses[${String(j)}]`)
      })),
      phoneNumbers: defaultObjectArray(p, "phoneNumbers", c).map((ph, j) => ({
        value: optString(ph, "value", `${c}.phoneNumbers[${String(j)}]`),
        canonicalForm: optString(ph, "canonicalForm", `${c}.phoneNumbers[${String(j)}]`),
        type: optString(ph, "type", `${c}.phoneNumbers[${String(j)}]`),
        metadata: parseMetadata(ph, `${c}.phoneNumbers[${String(j)}]`)
      })),
      organizations: defaultObjectArray(p, "organizations", c).map((g, j) => ({
        name: optString(g, "name", `${c}.organizations[${String(j)}]`),
        title: optString(g, "title", `${c}.organizations[${String(j)}]`),
        current: optBool(g, "current", `${c}.organizations[${String(j)}]`)
      })),
      photos: defaultObjectArray(p, "photos", c).map((ph, j) => ({
        url: optString(ph, "url", `${c}.photos[${String(j)}]`),
        metadata: parseMetadata(ph, `${c}.photos[${String(j)}]`)
      })),
      urls: defaultObjectArray(p, "urls", c).map((u, j) => ({
        value: optString(u, "value", `${c}.urls[${String(j)}]`),
        type: optString(u, "type", `${c}.urls[${String(j)}]`)
      }))
    };
  });
  return {
    connections,
    nextPageToken: optString(o, "nextPageToken", ctx)
  };
}
function pickPrimary(items) {
  return items.find((x) => x.metadata?.primary === true) ?? items[0];
}
function stableContactId(resourceName) {
  return createHash("sha256").update(resourceName, "utf-8").digest("hex").slice(0, 16);
}
function gpeoplePersonToContact(p) {
  const primaryName = pickPrimary(p.names ?? []);
  const displayName = primaryName?.displayName ?? (() => {
    const g = primaryName?.givenName ?? null;
    const f = primaryName?.familyName ?? null;
    if (g !== null && f !== null)
      return `${g} ${f}`;
    return g ?? f ?? null;
  })();
  const emails = (p.emailAddresses ?? []).flatMap((e) => e.value !== null && e.value !== undefined ? [
    {
      address: e.value,
      label: e.type ?? null,
      is_primary: e.metadata?.primary === true
    }
  ] : []);
  const phones = (p.phoneNumbers ?? []).flatMap((ph) => {
    const number = ph.canonicalForm ?? ph.value ?? null;
    return number !== null ? [
      {
        number,
        label: ph.type ?? null,
        is_primary: ph.metadata?.primary === true
      }
    ] : [];
  });
  if (displayName === null && emails.length === 0 && phones.length === 0) {
    return null;
  }
  const organizations = (p.organizations ?? []).map((o) => ({
    name: o.name ?? null,
    title: o.title ?? null,
    is_current: o.current ?? false
  }));
  const photoUrl = pickPrimary(p.photos ?? [])?.url ?? null;
  const profileUrl = (p.urls ?? []).find((u) => u.type?.toLowerCase() === "profile");
  const externalUrl = profileUrl !== undefined ? profileUrl.value ?? null : null;
  return {
    id: stableContactId(p.resourceName),
    display_name: displayName,
    given_name: primaryName?.givenName ?? null,
    family_name: primaryName?.familyName ?? null,
    emails,
    phones,
    organizations,
    photo_url: photoUrl,
    external_url: externalUrl
  };
}
function isFailedPrecondition(body) {
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return false;
  }
  if (parsed === null || typeof parsed !== "object")
    return false;
  const err = parsed.error;
  if (err === null || typeof err !== "object")
    return false;
  return err.status === "FAILED_PRECONDITION";
}
async function listConnectionsPage(token, pageToken, fetchFn) {
  const params = new URLSearchParams({
    personFields: "names,emailAddresses,phoneNumbers,organizations,photos,urls",
    pageSize: "100"
  });
  if (pageToken !== undefined)
    params.set("pageToken", pageToken);
  const url = `https://people.googleapis.com/v1/people/me/connections?${params}`;
  const resp = await fetchWithRetry(fetchFn, url, {
    headers: { authorization: `Bearer ${token}` }
  });
  checkRateLimit(resp);
  if (!resp.ok) {
    const body = await resp.text();
    if (resp.status === 400 && pageToken !== undefined && isFailedPrecondition(body)) {
      throw new ContactsCursorExpiredError;
    }
    throw new Error(`People API list_connections failed: HTTP ${String(resp.status)} \u2014 ${body}`);
  }
  return parseGpeopleConnectionsResponse(await resp.json());
}
async function fetchContactsPage(token, cursor, fetchFn) {
  const c = cursor !== null && typeof cursor === "object" ? cursor : undefined;
  const pageToken = typeof c?.page_token === "string" ? c.page_token : undefined;
  const page = await listConnectionsPage(token, pageToken, fetchFn);
  const envelopes = [];
  for (const person of page.connections ?? []) {
    const contact = gpeoplePersonToContact(person);
    if (contact === null)
      continue;
    envelopes.push({
      surface: "contacts",
      payload: contact,
      remote_id: contactRemoteId(contact.id),
      kind: "snapshot"
    });
  }
  const progress = progressCursor(cursor, envelopes.length, undefined);
  let nextCursor = null;
  if (typeof page.nextPageToken === "string") {
    nextCursor = { page_token: page.nextPageToken };
    mergeProgress(nextCursor, progress);
  }
  return { envelopes, nextCursor, discovered: progress.discovered };
}

// plugins/sources/google/src/fixture.ts
import { readFileSync } from "fs";

// plugins/sources/google/src/surfaces/email/mime.ts
function decodeBase64url(data) {
  if (!/^[A-Za-z0-9\-_]*={0,2}$/.test(data))
    return null;
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return Uint8Array.from(Buffer.from(normalized, "base64"));
  } catch {
    return null;
  }
}
function decodeBody(body) {
  const data = body?.data;
  if (typeof data !== "string")
    return null;
  const bytes = decodeBase64url(data);
  if (bytes === null)
    return null;
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}
function findPartContent(parts, mimeType) {
  for (const part of parts) {
    if (part.mimeType === mimeType) {
      const decoded = decodeBody(part.body);
      if (decoded !== null)
        return decoded;
    }
    if (part.parts) {
      const found = findPartContent(part.parts, mimeType);
      if (found !== null)
        return found;
    }
  }
  return null;
}
function nonEmpty(value) {
  return value !== null && value.trim() !== "" ? value : null;
}
function extractBodyContent(payload) {
  const multipartText = payload.parts ? findPartContent(payload.parts, "text/plain") : null;
  const multipartHtml = payload.parts ? findPartContent(payload.parts, "text/html") : null;
  const singlePartBody = decodeBody(payload.body);
  const bodyText = nonEmpty(multipartText ?? (payload.mimeType === "text/plain" ? singlePartBody : null));
  const bodyHtml = nonEmpty(multipartHtml ?? (payload.mimeType === "text/html" ? singlePartBody : null));
  return { bodyText, bodyHtml };
}
function collectAttachments(payload) {
  const attachments = [];
  const walk = (parts) => {
    for (const part of parts) {
      if (part.filename && part.body?.attachmentId) {
        attachments.push({
          attachment_id: part.body.attachmentId,
          filename: part.filename,
          mime_type: part.mimeType ?? "",
          size: part.body.size ?? 0
        });
      }
      if (part.parts)
        walk(part.parts);
    }
  };
  if (payload.parts)
    walk(payload.parts);
  return attachments;
}

// plugins/sources/google/src/surfaces/email/gmail.ts
var GMAIL_FETCH_CONCURRENCY = 8;
function parseHeaders(o, field, ctx) {
  const raw = optObjectArray(o, field, ctx);
  if (raw === null)
    return null;
  return raw.map((h, i) => ({
    name: reqString(h, "name", `${ctx}.${field}[${String(i)}]`),
    value: reqString(h, "value", `${ctx}.${field}[${String(i)}]`)
  }));
}
function parseBody(o, field, ctx) {
  const b = optObject(o, field, ctx);
  if (b === null)
    return null;
  const c = `${ctx}.${field}`;
  return {
    attachmentId: optString(b, "attachmentId", c),
    size: optNumber(b, "size", c),
    data: optString(b, "data", c)
  };
}
function parseParts(o, field, ctx) {
  const raw = optObjectArray(o, field, ctx);
  if (raw === null)
    return null;
  return raw.map((p, i) => {
    const c = `${ctx}.${field}[${String(i)}]`;
    parseHeaders(p, "headers", c);
    return {
      mimeType: optString(p, "mimeType", c),
      filename: optString(p, "filename", c),
      body: parseBody(p, "body", c),
      parts: parseParts(p, "parts", c)
    };
  });
}
function parseGmailMessage(v) {
  const ctx = "GmailMessage";
  const o = asObject(v, ctx);
  const payloadRaw = optObject(o, "payload", ctx);
  let payload = null;
  if (payloadRaw !== null) {
    const c = `${ctx}.payload`;
    payload = {
      mimeType: optString(payloadRaw, "mimeType", c),
      headers: parseHeaders(payloadRaw, "headers", c),
      body: parseBody(payloadRaw, "body", c),
      parts: parseParts(payloadRaw, "parts", c)
    };
  }
  return {
    id: reqString(o, "id", ctx),
    threadId: optString(o, "threadId", ctx),
    labelIds: optStringArray(o, "labelIds", ctx),
    snippet: optString(o, "snippet", ctx),
    payload,
    internalDate: optString(o, "internalDate", ctx)
  };
}
function parseGmailProfile(v) {
  const ctx = "GmailProfile";
  const o = asObject(v, ctx);
  return {
    historyId: reqString(o, "historyId", ctx),
    messagesTotal: optNumber(o, "messagesTotal", ctx)
  };
}
function parseListMessagesResponse(v) {
  const ctx = "ListMessagesResponse";
  const o = asObject(v, ctx);
  const refs = optObjectArray(o, "messages", ctx);
  return {
    messages: refs === null ? null : refs.map((m, i) => ({ id: reqString(m, "id", `${ctx}.messages[${String(i)}]`) })),
    nextPageToken: optString(o, "nextPageToken", ctx)
  };
}
function parseHistoryEvents(o, field, ctx, withLabelIds) {
  return defaultObjectArray(o, field, ctx).map((e, i) => {
    const c = `${ctx}.${field}[${String(i)}]`;
    const msg = reqObject(e, "message", c);
    if (withLabelIds)
      defaultStringArray(e, "labelIds", c);
    optString(msg, "threadId", `${c}.message`);
    return { message: { id: reqString(msg, "id", `${c}.message`) } };
  });
}
function parseHistoryListResponse(v) {
  const ctx = "HistoryListResponse";
  const o = asObject(v, ctx);
  const entries = defaultObjectArray(o, "history", ctx).map((e, i) => {
    const c = `${ctx}.history[${String(i)}]`;
    return {
      messagesAdded: parseHistoryEvents(e, "messagesAdded", c, false),
      messagesDeleted: parseHistoryEvents(e, "messagesDeleted", c, false),
      labelsAdded: parseHistoryEvents(e, "labelsAdded", c, true),
      labelsRemoved: parseHistoryEvents(e, "labelsRemoved", c, true)
    };
  });
  return {
    history: entries,
    nextPageToken: optString(o, "nextPageToken", ctx),
    historyId: reqString(o, "historyId", ctx)
  };
}
function parseDateHeader(raw) {
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : new Date(t);
}
function internalDateToDate(millisStr) {
  const millis = Number(millisStr);
  return Number.isInteger(millis) ? new Date(millis) : null;
}
function getHeader(headers, name) {
  const lower = name.toLowerCase();
  const found = headers.find((h) => h.name.toLowerCase() === lower);
  return found ? found.value : null;
}
function parseEmailAddress(raw) {
  const lt = raw.indexOf("<");
  const gt = raw.indexOf(">");
  if (lt >= 0 && gt >= 0) {
    const name = raw.slice(0, lt).trim().replace(/^"+|"+$/g, "");
    const address = raw.slice(lt + 1, gt).trim();
    return { name: name === "" ? null : name, address };
  }
  return { name: null, address: raw.trim() };
}
function parseEmailAddresses(raw) {
  return raw.split(",").map((s) => s.trim()).filter((s) => s !== "").map(parseEmailAddress);
}
function gmailMessageToMailMessage(msg) {
  const payload = msg.payload;
  if (!payload)
    throw new Error(`message ${msg.id} has no payload`);
  const headers = payload.headers ?? [];
  const subject = getHeader(headers, "Subject") ?? "";
  const fromRaw = getHeader(headers, "From") ?? "";
  const toRaw = getHeader(headers, "To") ?? "";
  const ccRaw = getHeader(headers, "Cc") ?? "";
  const bccRaw = getHeader(headers, "Bcc") ?? "";
  const dateRaw = getHeader(headers, "Date");
  const messageIdHeader = getHeader(headers, "Message-ID");
  const sentAt = (dateRaw !== null ? parseDateHeader(dateRaw) : null) ?? (msg.internalDate !== null && msg.internalDate !== undefined ? internalDateToDate(msg.internalDate) : null) ?? new Date(0);
  const labels = msg.labelIds ?? [];
  const isRead = !labels.includes("UNREAD");
  const isStarred = labels.includes("STARRED");
  const snippet = msg.snippet ?? "";
  const body = extractBodyContent(payload);
  const attachments = collectAttachments(payload);
  const trimmedSnippet = snippet.trim();
  const bodyText = body.bodyText !== null && body.bodyText.trim() !== "" ? body.bodyText : trimmedSnippet !== "" ? trimmedSnippet : null;
  return {
    id: msg.id,
    thread_id: msg.threadId ?? null,
    message_id_header: messageIdHeader,
    subject,
    from: parseEmailAddress(fromRaw),
    to: parseEmailAddresses(toRaw),
    cc: parseEmailAddresses(ccRaw),
    bcc: parseEmailAddresses(bccRaw),
    sent_at: formatUtc(sentAt),
    snippet,
    body_text: bodyText,
    body_html: body.bodyHtml,
    labels,
    is_read: isRead,
    is_starred: isStarred,
    has_attachments: attachments.length > 0,
    attachments
  };
}
function flattenMailPayload(payload) {
  if ("from" in payload) {
    const from = payload.from;
    payload.from_name = from && typeof from === "object" ? from.name ?? null : null;
    payload.from_address = from && typeof from === "object" ? from.address ?? null : null;
    delete payload.from;
  }
  for (const field of ["to", "cc", "bcc"]) {
    const arr = payload[field];
    if (Array.isArray(arr)) {
      const addrs = arr.map((v) => v !== null && typeof v === "object" ? v.address : undefined).filter((a) => typeof a === "string");
      payload[`${field}_addresses`] = addrs.join(", ");
      delete payload[field];
    }
  }
}
function resolveHistoryActions(entries) {
  const actions = new Map;
  for (const entry of entries) {
    const added = new Set((entry.messagesAdded ?? []).map((e) => e.message.id));
    const deleted = new Set((entry.messagesDeleted ?? []).map((e) => e.message.id));
    const labels = new Set([
      ...(entry.labelsAdded ?? []).map((e) => e.message.id),
      ...(entry.labelsRemoved ?? []).map((e) => e.message.id)
    ]);
    for (const id of deleted)
      actions.set(id, "delete");
    for (const id of added) {
      if (!deleted.has(id))
        actions.set(id, "fetch");
    }
    for (const id of labels) {
      if (!deleted.has(id) && !added.has(id) && !actions.has(id)) {
        actions.set(id, "fetch");
      }
    }
  }
  return actions;
}
function sortedActions(actions) {
  return [...actions.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
}
function mimeEncodeHeader(value) {
  for (let idx = 0;idx < value.length; idx++) {
    if (value.charCodeAt(idx) > 127) {
      return `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`;
    }
  }
  return value;
}
function formatRecipient(name, address) {
  return name ? `${mimeEncodeHeader(name)} <${address}>` : address;
}
function parseAddressList(v, field) {
  if (v === undefined)
    return [];
  if (!Array.isArray(v))
    throw new Error(`field \`${field}\` must be an array`);
  return v.map((item, i) => {
    const o = item;
    if (o === null || typeof o !== "object" || typeof o.address !== "string") {
      throw new Error(`field \`${field}[${String(i)}]\` missing string \`address\``);
    }
    return {
      name: typeof o.name === "string" ? o.name : null,
      address: o.address
    };
  });
}
var BASE64_STANDARD = /^[A-Za-z0-9+/]*={0,2}$/;
function parseMailDraft(value) {
  try {
    const raw = value ?? {};
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("draft must be an object");
    }
    const o = raw;
    if (!("to" in o))
      throw new Error("missing field `to`");
    if (typeof o.subject !== "string")
      throw new Error("missing field `subject`");
    if (typeof o.body_text !== "string") {
      throw new Error("missing field `body_text`");
    }
    const attachmentsRaw = o.attachments ?? [];
    if (!Array.isArray(attachmentsRaw)) {
      throw new Error("field `attachments` must be an array");
    }
    const attachments = attachmentsRaw.map((raw2, i) => {
      const a = raw2;
      if (a === null || typeof a !== "object" || typeof a.filename !== "string" || typeof a.mime_type !== "string" || typeof a.data !== "string") {
        throw new Error(`field \`attachments[${String(i)}]\` needs string filename/mime_type/data`);
      }
      if (!BASE64_STANDARD.test(a.data) || a.data.length % 4 !== 0) {
        throw new Error(`field \`attachments[${String(i)}].data\` is not valid base64`);
      }
      return {
        filename: a.filename,
        mime_type: a.mime_type,
        data: Uint8Array.from(Buffer.from(a.data, "base64"))
      };
    });
    return {
      to: parseAddressList(o.to, "to"),
      cc: parseAddressList(o.cc, "cc"),
      bcc: parseAddressList(o.bcc, "bcc"),
      subject: o.subject,
      body_text: o.body_text,
      body_html: typeof o.body_html === "string" ? o.body_html : null,
      in_reply_to: typeof o.in_reply_to === "string" ? o.in_reply_to : null,
      attachments
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Invalid MailDraft payload: ${msg}`, { cause: e });
  }
}
function buildRawMessage(draft) {
  const toStr = draft.to.map((a) => formatRecipient(a.name, a.address)).join(", ");
  const ccStr = draft.cc.map((a) => formatRecipient(a.name, a.address)).join(", ");
  const headers = [
    `To: ${toStr}`,
    `Subject: ${mimeEncodeHeader(draft.subject)}`,
    "MIME-Version: 1.0"
  ];
  if (ccStr !== "")
    headers.push(`Cc: ${ccStr}`);
  if (draft.in_reply_to) {
    headers.push(`In-Reply-To: ${draft.in_reply_to}`);
    headers.push(`References: ${draft.in_reply_to}`);
  }
  if (draft.attachments.length === 0) {
    headers.push("Content-Type: text/plain; charset=UTF-8");
    return `${headers.join(`\r
`)}\r
\r
${draft.body_text}`;
  }
  const boundary = `----=_Part_${crypto.randomUUID().replace(/-/g, "")}`;
  headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  const parts = [];
  parts.push(`--${boundary}\r
Content-Type: text/plain; charset=UTF-8\r
\r
${draft.body_text}`);
  for (const att of draft.attachments) {
    const b64 = Buffer.from(att.data).toString("base64");
    parts.push(`--${boundary}\r
` + `Content-Type: ${att.mime_type}; name="${att.filename}"\r
` + `Content-Disposition: attachment; filename="${att.filename}"\r
` + `Content-Transfer-Encoding: base64\r
` + `\r
` + b64);
  }
  parts.push(`--${boundary}--`);
  return `${headers.join(`\r
`)}\r
\r
${parts.join(`\r
`)}`;
}
function encodeBase64UrlNoPad(s) {
  return Buffer.from(s, "utf-8").toString("base64url");
}
async function getProfile(token, fetchFn) {
  const resp = await fetchWithRetry(fetchFn, "https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { authorization: `Bearer ${token}` } });
  checkRateLimit(resp);
  if (!resp.ok) {
    throw new Error(`Gmail get profile failed: ${await resp.text()}`);
  }
  return parseGmailProfile(await resp.json());
}
async function listMessagesPage(token, pageToken, fetchFn) {
  let url = "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50";
  if (pageToken !== undefined)
    url += `&pageToken=${pageToken}`;
  const resp = await fetchWithRetry(fetchFn, url, {
    headers: { authorization: `Bearer ${token}` }
  });
  checkRateLimit(resp);
  if (!resp.ok) {
    throw new Error(`Gmail list messages failed: ${await resp.text()}`);
  }
  return parseListMessagesResponse(await resp.json());
}
async function fetchMessage(token, gmailMsgId, fetchFn) {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${gmailMsgId}?format=full`;
  const resp = await fetchWithRetry(fetchFn, url, {
    headers: { authorization: `Bearer ${token}` }
  });
  checkRateLimit(resp);
  if (!resp.ok) {
    throw new Error(`GET message ${gmailMsgId} failed (${String(resp.status)}): ${await resp.text()}`);
  }
  return parseGmailMessage(await resp.json());
}
async function listHistory(token, startHistoryId, pageToken, fetchFn) {
  let url = `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${startHistoryId}&maxResults=500`;
  if (pageToken !== undefined)
    url += `&pageToken=${pageToken}`;
  const resp = await fetchWithRetry(fetchFn, url, {
    headers: { authorization: `Bearer ${token}` }
  });
  checkRateLimit(resp);
  if (resp.status === 404)
    throw new HistoryExpiredError;
  if (!resp.ok) {
    throw new Error(`Gmail list history failed: ${await resp.text()}`);
  }
  return parseHistoryListResponse(await resp.json());
}
async function sendMessage(token, draft, fetchFn) {
  const raw = encodeBase64UrlNoPad(buildRawMessage(draft));
  const resp = await fetchWithRetry(fetchFn, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ raw })
  });
  checkRateLimit(resp);
  if (!resp.ok) {
    throw new Error(`Gmail send failed (${String(resp.status)}): ${await resp.text()}`);
  }
  const body = asObject(await resp.json(), "SendResponse");
  return {
    message_id: reqString(body, "id", "SendResponse"),
    thread_id: optString(body, "threadId", "SendResponse")
  };
}
async function downloadAttachment(token, messageId, attachmentId, fetchFn) {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`;
  const resp = await fetchWithRetry(fetchFn, url, {
    headers: { authorization: `Bearer ${token}` }
  });
  checkRateLimit(resp);
  if (!resp.ok)
    throw new Error(`Attachment download failed: ${String(resp.status)}`);
  const body = asObject(await resp.json(), "AttachmentResponse");
  const data = optString(body, "data", "AttachmentResponse");
  if (data === null)
    throw new Error("No attachment data");
  const bytes = decodeBase64url(data);
  if (bytes === null)
    throw new Error("Base64 decode failed");
  return bytes;
}
async function mapConcurrent(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;; ) {
      const i = next++;
      if (i >= items.length)
        return;
      const item = items[i];
      if (item === undefined)
        throw new Error("mapLimit: item index out of range");
      results[i] = await fn(item);
    }
  });
  await Promise.all(workers);
  return results;
}
function errText(e) {
  return e instanceof Error ? e.message : String(e);
}
function snapshotEnvelopesFromFetched(fetched) {
  const envelopes = [];
  for (const { id, msg, err } of fetched) {
    if (err !== undefined) {
      if (isFatal(err))
        throw err;
      console.error(`magnis-google: skipping message ${id} (fetch failed: ${errText(err)})`);
      continue;
    }
    if (msg === undefined)
      continue;
    try {
      const mail = gmailMessageToMailMessage(msg);
      const payload = { ...mail };
      flattenMailPayload(payload);
      envelopes.push({ surface: "email", payload, remote_id: id, kind: "snapshot" });
    } catch (e) {
      console.error(`magnis-google: skipping message ${id} (convert failed: ${errText(e)})`);
    }
  }
  return envelopes;
}
async function fetchSnapshotEnvelopes(token, ids, fetchFn) {
  const fetched = await mapConcurrent(ids, GMAIL_FETCH_CONCURRENCY, async (id) => {
    try {
      return { id, msg: await fetchMessage(token, id, fetchFn) };
    } catch (err) {
      return { id, err };
    }
  });
  return snapshotEnvelopesFromFetched(fetched);
}
function cursorObj(cursor) {
  return cursor !== null && typeof cursor === "object" ? cursor : undefined;
}
async function fetchMessagePage(token, cursor, fetchFn) {
  const c = cursorObj(cursor);
  const pageToken = typeof c?.page_token === "string" ? c.page_token : undefined;
  let historyId;
  let freshTotal;
  if (pageToken === undefined) {
    const profile = await getProfile(token, fetchFn);
    historyId = profile.historyId;
    freshTotal = typeof profile.messagesTotal === "number" ? profile.messagesTotal : undefined;
  } else {
    historyId = typeof c?.history_id === "string" ? c.history_id : undefined;
  }
  const page = await listMessagesPage(token, pageToken, fetchFn);
  const ids = (page.messages ?? []).map((m) => m.id);
  const envelopes = await fetchSnapshotEnvelopes(token, ids, fetchFn);
  const progress = progressCursor(cursor, ids.length, freshTotal);
  const hasMore = typeof page.nextPageToken === "string";
  const nextCursor = {};
  if (hasMore)
    nextCursor.page_token = page.nextPageToken;
  if (historyId !== undefined)
    nextCursor.history_id = historyId;
  mergeProgress(nextCursor, progress);
  return {
    envelopes,
    nextCursor,
    hasMore,
    total: progress.total ?? null,
    discovered: progress.discovered
  };
}
async function fetchHistoryChanges(token, cursor, fetchFn) {
  const c = cursorObj(cursor);
  const historyId = typeof c?.history_id === "string" ? c.history_id : undefined;
  if (historyId === undefined)
    throw new HistoryExpiredError;
  const historyPageToken = typeof c?.history_page_token === "string" ? c.history_page_token : undefined;
  const resp = await listHistory(token, historyId, historyPageToken, fetchFn);
  const actions = sortedActions(resolveHistoryActions(resp.history ?? []));
  const envelopes = actions.filter(([, action]) => action === "delete").map(([msgId]) => ({
    surface: "email",
    payload: {},
    remote_id: msgId,
    kind: "delete"
  }));
  const fetchIds = actions.filter(([, action]) => action === "fetch").map(([msgId]) => msgId);
  envelopes.push(...await fetchSnapshotEnvelopes(token, fetchIds, fetchFn));
  const progress = progressCursor(cursor, 0, undefined);
  const hasMore = typeof resp.nextPageToken === "string";
  const nextCursor = hasMore ? { history_id: historyId, history_page_token: resp.nextPageToken } : { history_id: resp.historyId };
  mergeProgress(nextCursor, progress);
  return {
    envelopes,
    nextCursor,
    hasMore,
    total: progress.total ?? null,
    discovered: progress.discovered
  };
}

// plugins/sources/google/src/fixture.ts
function fixturePath() {
  return process.env.GOOGLE_FIXTURE_FILE;
}
var EMPTY = { messages: [], events: [], connections: [] };
function load() {
  const path = fixturePath();
  if (path === undefined)
    return EMPTY;
  let raw;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (e) {
    console.error(`magnis-google: cannot read GOOGLE_FIXTURE_FILE ${path}: ${e instanceof Error ? e.message : String(e)}`);
    return EMPTY;
  }
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch (e) {
    console.error(`magnis-google: malformed GOOGLE_FIXTURE_FILE ${path}: ${e instanceof Error ? e.message : String(e)}`);
    return EMPTY;
  }
  const d = doc ?? {};
  return {
    messages: Array.isArray(d.messages) ? d.messages : [],
    events: Array.isArray(d.events) ? d.events : [],
    connections: Array.isArray(d.connections) ? d.connections : []
  };
}
function messageToEnvelope(raw) {
  try {
    const msg = raw;
    const mail = gmailMessageToMailMessage(msg);
    const payload = { ...mail };
    flattenMailPayload(payload);
    return { surface: "email", payload, remote_id: msg.id, kind: "snapshot" };
  } catch (e) {
    console.error(`magnis-google: fixture message convert failed: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}
function eventToEnvelope(raw) {
  const ev = raw;
  if (ev.status === "cancelled")
    return null;
  try {
    const cal = gcalEventToCalendarEvent(ev);
    return {
      surface: "meetings",
      payload: cal,
      remote_id: calendarRemoteId(ev.id),
      kind: "snapshot"
    };
  } catch (e) {
    console.error(`magnis-google: fixture event convert failed: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}
function connectionToEnvelope(raw) {
  try {
    const contact = gpeoplePersonToContact(raw);
    if (contact === null)
      return null;
    return {
      surface: "contacts",
      payload: contact,
      remote_id: contactRemoteId(contact.id),
      kind: "snapshot"
    };
  } catch (e) {
    console.error(`magnis-google: fixture connection convert failed: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}
function fixtureFetchResult(surface) {
  const fx = load();
  let envelopes;
  switch (surface) {
    case "email":
      envelopes = fx.messages.map(messageToEnvelope).filter((e) => e !== null);
      break;
    case "meetings":
      envelopes = fx.events.map(eventToEnvelope).filter((e) => e !== null);
      break;
    case "contacts":
      envelopes = fx.connections.map(connectionToEnvelope).filter((e) => e !== null);
      break;
    default:
      envelopes = [];
  }
  return { envelopes, nextCursor: null, hasMore: false };
}
function fixtureExecuteResult(action, args) {
  switch (action) {
    case "send_message":
      return {
        message_id: `fixture-${crypto.randomUUID()}`,
        thread_id: null,
        recorded: true,
        action: "send_message"
      };
    case "download_file":
      return {
        local_path: args.dest ?? null,
        size_bytes: 0,
        recorded: true,
        action: "download_file"
      };
    default:
      return { recorded: true, action };
  }
}

// plugins/sources/google/src/oauth.ts
var GOOGLE_ISS = ["accounts.google.com", "https://accounts.google.com"];
function base64UrlDecode(s) {
  if (!/^[A-Za-z0-9\-_]*={0,2}$/.test(s))
    return null;
  try {
    return Uint8Array.from(Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64"));
  } catch {
    return null;
  }
}
function audMatches(aud, expected) {
  if (typeof aud === "string")
    return aud === expected;
  if (Array.isArray(aud))
    return aud.some((v) => v === expected);
  return false;
}
function validateIdTokenClaims(idToken, expectedAud, expectedNonce, nowUnix) {
  const payloadB64 = idToken.split(".")[1];
  if (payloadB64 === undefined)
    throw new Error("id_token is not a JWT");
  const bytes = base64UrlDecode(payloadB64);
  if (bytes === null)
    throw new Error("id_token payload not base64url");
  let claims;
  try {
    claims = JSON.parse(new TextDecoder().decode(bytes));
  } catch (e) {
    throw new Error(`id_token claims not JSON: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
  }
  if (typeof claims.iss !== "string" || !GOOGLE_ISS.includes(claims.iss)) {
    throw new Error(`id_token iss not Google: ${String(claims.iss)}`);
  }
  if (!audMatches(claims.aud, expectedAud)) {
    throw new Error("id_token aud != client_id");
  }
  if (claims.azp !== undefined && claims.azp !== null && claims.azp !== expectedAud) {
    throw new Error("id_token azp != client_id");
  }
  if (typeof claims.exp !== "number" || claims.exp <= nowUnix) {
    throw new Error("id_token expired");
  }
  if (claims.nonce !== expectedNonce) {
    throw new Error("id_token nonce mismatch");
  }
  if (typeof claims.sub !== "string") {
    throw new Error("id_token claims not JSON: missing sub");
  }
  return {
    sub: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null
  };
}
function metaStr(meta, key) {
  const v = meta[key];
  if (typeof v !== "string" || v === "") {
    throw new Error(`magnis.auth.exchange: missing _meta.${key}`);
  }
  return v;
}
async function exchange(meta, fetchFn, nowUnix = Math.floor(Date.now() / 1000)) {
  const m = meta ?? {};
  const clientId = metaStr(m, "client_id");
  const code = metaStr(m, "code");
  const codeVerifier = metaStr(m, "code_verifier");
  const redirectUri = metaStr(m, "redirect_uri");
  const nonce = metaStr(m, "nonce");
  const clientSecret = typeof m.client_secret === "string" && m.client_secret !== "" ? m.client_secret : undefined;
  const form = new URLSearchParams({
    code,
    client_id: clientId,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    code_verifier: codeVerifier
  });
  if (clientSecret !== undefined)
    form.set("client_secret", clientSecret);
  const resp = await fetchWithRetry(fetchFn, "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString()
  });
  if (!resp.ok) {
    throw new Error(`token exchange failed: ${await resp.text()}`);
  }
  const body = await resp.json();
  if (typeof body.refresh_token !== "string") {
    throw new Error("token response missing refresh_token (add prompt=consent/access_type=offline)");
  }
  if (typeof body.id_token !== "string") {
    throw new Error("token response missing id_token");
  }
  const claims = validateIdTokenClaims(body.id_token, clientId, nonce, nowUnix);
  if (typeof body.access_token === "string") {
    const ui = await fetchWithRetry(fetchFn, "https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${body.access_token}` } });
    if (ui.ok) {
      const info = await ui.json();
      if (info.sub !== claims.sub) {
        throw new Error("userinfo sub != id_token sub");
      }
    }
  }
  const label = claims.email ?? claims.sub;
  return {
    credential: body.refresh_token,
    identity: { key: claims.sub, label }
  };
}
async function revoke(meta, fetchFn) {
  const token = metaStr(meta ?? {}, "refresh_token");
  const resp = await fetchWithRetry(fetchFn, "https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }).toString()
  });
  return { revoked: resp.ok || resp.status === 400 };
}

// plugins/sources/google/src/schema.ts
var SURFACES = ["email", "meetings", "contacts"];

// plugins/sources/google/src/connector.ts
function buildConnectorConfig(fetchFn = fetch) {
  const accessToken = (meta) => refreshAccessToken(credsFromMeta(meta), fetchFn);
  const fetchHandler = async (args) => {
    const surface = args.surface;
    if (fixturePath() !== undefined)
      return fixtureFetchResult(surface);
    const direction = args.direction ?? "backward";
    const cursor = args.cursor;
    const token = await accessToken(args.meta);
    switch (surface) {
      case "email": {
        const r = direction === "forward" ? await fetchHistoryChanges(token, cursor, fetchFn) : await fetchMessagePage(token, cursor, fetchFn);
        return {
          envelopes: r.envelopes,
          nextCursor: r.nextCursor,
          hasMore: r.hasMore,
          total: r.total,
          discovered: r.discovered
        };
      }
      case "meetings": {
        const window = {
          time_min: rawStr(args.raw, "time_min"),
          time_max: rawStr(args.raw, "time_max")
        };
        const r = await fetchEventsPage(token, cursor, window, fetchFn);
        return {
          envelopes: r.envelopes,
          nextCursor: r.nextCursor,
          hasMore: r.nextCursor !== null,
          discovered: r.discovered
        };
      }
      case "contacts": {
        const r = await fetchContactsPage(token, cursor, fetchFn);
        return {
          envelopes: r.envelopes,
          nextCursor: r.nextCursor,
          hasMore: r.nextCursor !== null,
          discovered: r.discovered
        };
      }
      default:
        throw new Error(`unknown surface '${surface}'`);
    }
  };
  const sendMessageHandler = async (args, meta) => {
    if (fixturePath() !== undefined) {
      return fixtureExecuteResult("send_message", args);
    }
    const token = await accessToken(meta);
    const draft = parseMailDraft(args.draft);
    return sendMessage(token, draft, fetchFn);
  };
  const downloadFileHandler = async (args, meta) => {
    if (fixturePath() !== undefined) {
      return fixtureExecuteResult("download_file", args);
    }
    const token = await accessToken(meta);
    const sourceRef = args.source_ref;
    if (sourceRef === undefined) {
      throw new Error("download_file: missing source_ref");
    }
    const dest = args.dest;
    if (typeof dest !== "string")
      throw new Error("download_file: missing dest");
    const messageId = sourceRef.message_id;
    if (typeof messageId !== "string") {
      throw new Error("download_file: missing message_id in source_ref");
    }
    const attachmentId = sourceRef.attachment_id;
    if (typeof attachmentId !== "string") {
      throw new Error("download_file: missing attachment_id in source_ref");
    }
    const bytes = await downloadAttachment(token, messageId, attachmentId, fetchFn);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, bytes);
    return { local_path: dest, size_bytes: bytes.length };
  };
  const executeHandlers = {
    send_message: sendMessageHandler,
    download_file: downloadFileHandler
  };
  const execute = new Proxy(executeHandlers, {
    get(target, prop) {
      if (typeof prop !== "string")
        return;
      const known = target[prop];
      if (known !== undefined)
        return known;
      return (args) => {
        if (fixturePath() !== undefined)
          return Promise.resolve(fixtureExecuteResult(prop, args));
        return Promise.reject(new Error(`Unknown gmail execute action: ${prop}`));
      };
    }
  });
  return {
    name: "magnis-google",
    version: "1.0.0",
    surfaces: SURFACES,
    mode: "poll",
    intervalSecs: 30,
    fetch: fetchHandler,
    auth: {
      exchange: (_args, meta) => exchange(meta, fetchFn),
      revoke: (_args, meta) => revoke(meta, fetchFn)
    },
    execute
  };
}

// plugins/sources/google/src/main.ts
await runConnector(buildConnectorConfig());
