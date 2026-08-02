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

// plugins/sources/mock-gmail/src/store.ts
import { appendFileSync, mkdirSync, readFileSync } from "fs";
import { dirname } from "path";
function injectFile() {
  const path = process.env.MOCK_INJECT_FILE;
  if (!path) {
    throw new Error("magnis-mock-gmail requires MOCK_INJECT_FILE (shared JSONL path)");
  }
  return path;
}
function readItems(surface) {
  const path = injectFile();
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return [];
  }
  const out = [];
  for (const line of raw.split(`
`)) {
    if (!line.trim())
      continue;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (parsed && typeof parsed === "object" && parsed.surface === surface) {
      out.push(parsed);
    }
  }
  return out;
}
function appendItem(surface, payload, remoteId) {
  const path = injectFile();
  try {
    mkdirSync(dirname(path), { recursive: true });
  } catch {}
  appendFileSync(path, JSON.stringify({ surface, payload, remote_id: remoteId }) + `
`);
  return readItems(surface).length;
}

// plugins/sources/mock-gmail/src/fetch.ts
function fetchMockGmail(args) {
  const surface = args.surface || "email";
  const cursor = typeof args.cursor === "number" && args.cursor >= 0 ? Math.floor(args.cursor) : 0;
  const items = readItems(surface);
  const envelopes = items.slice(cursor).map((item) => ({
    surface,
    payload: item.payload ?? {},
    remote_id: item.remote_id ?? null,
    kind: "live"
  }));
  return Promise.resolve({ envelopes, nextCursor: items.length, hasMore: false });
}

// plugins/sources/mock-gmail/src/inject.ts
import { randomUUID } from "crypto";
function str(v) {
  return typeof v === "string" ? v : undefined;
}
function asRecord(v) {
  return v && typeof v === "object" ? v : {};
}
function orNull(v) {
  return v === undefined ? null : v;
}
function buildEmail(req) {
  const messageId = str(req.message_id) ?? `mock-${randomUUID()}`;
  const rawAttachments = Array.isArray(req.attachments) ? req.attachments : [];
  const attachments = rawAttachments.map((raw) => {
    const a = asRecord(raw);
    return {
      attachment_id: str(a.attachment_id) ?? `att-${randomUUID()}`,
      filename: orNull(a.filename),
      mime_type: orNull(a.mime_type),
      size: a.size === undefined ? 0 : a.size
    };
  });
  const payload = {
    message_id: messageId,
    from_address: orNull(req.from_address),
    from_name: str(req.from_name) ?? "",
    subject: orNull(req.subject),
    body_text: orNull(req.body_text),
    sent_at: new Date().toISOString(),
    has_attachments: attachments.length > 0,
    attachments
  };
  const threadId = str(req.thread_id);
  if (threadId !== undefined)
    payload.thread_id = threadId;
  return { payload, remoteId: messageId };
}
function buildEvent(req) {
  const id = str(req.id) ?? `mock-${randomUUID()}`;
  const rawAttendees = Array.isArray(req.attendees) ? req.attendees : [];
  const attendees = rawAttendees.map((raw) => {
    const a = asRecord(raw);
    return {
      name: orNull(a.name),
      email: orNull(a.email)
    };
  });
  const payload = {
    id,
    title: orNull(req.title),
    starts_at: orNull(req.starts_at),
    ends_at: orNull(req.ends_at),
    attendees
  };
  const description = str(req.description);
  if (description !== undefined)
    payload.description = description;
  const location = str(req.location);
  if (location !== undefined)
    payload.location = location;
  return { payload, remoteId: `gcal:${id}` };
}
function appendOrZero(surface, payload, remoteId) {
  try {
    return appendItem(surface, payload, remoteId);
  } catch {
    return 0;
  }
}
function injectEmail(req) {
  const { payload, remoteId } = buildEmail(req);
  return { queued: true, total: appendOrZero("email", payload, remoteId) };
}
function injectEvent(req) {
  const { payload, remoteId } = buildEvent(req);
  return { queued: true, total: appendOrZero("meetings", payload, remoteId) };
}

// plugins/sources/mock-gmail/src/http.ts
async function body(req) {
  try {
    const parsed = await req.json();
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
async function handleHttp(req) {
  const { pathname } = new URL(req.url);
  if (req.method === "POST" && pathname === "/inject") {
    return Response.json(injectEmail(await body(req)));
  }
  if (req.method === "POST" && pathname === "/inject-event") {
    return Response.json(injectEvent(await body(req)));
  }
  if (req.method === "GET" && pathname === "/health") {
    return new Response("ok");
  }
  if (req.method === "GET" && pathname === "/status") {
    return Response.json({
      email: readItems("email").length,
      meetings: readItems("meetings").length
    });
  }
  return new Response("Not Found", { status: 404 });
}
function maybeRunHttp() {
  const raw = process.env.MOCK_EMAIL_PORT;
  if (!raw)
    return;
  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    return;
  try {
    Bun.serve({ port, hostname: "0.0.0.0", fetch: handleHttp });
    process.stderr.write(`magnis-mock-gmail: injection server on :${String(port)}
`);
  } catch (e) {
    process.stderr.write(`magnis-mock-gmail: injection port ${String(port)} unavailable (${e instanceof Error ? e.message : String(e)}); MCP-only
`);
  }
}

// plugins/sources/mock-gmail/src/main.ts
maybeRunHttp();
await runConnector({
  name: "magnis-mock-gmail",
  version: "0.1.0",
  surfaces: ["email", "meetings"],
  intervalSecs: 5,
  fetch: fetchMockGmail
});
process.exit(0);
