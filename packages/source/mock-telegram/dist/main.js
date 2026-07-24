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

// plugins/sources/mock-telegram/src/store.ts
import { appendFileSync, mkdirSync, readFileSync } from "fs";
import { dirname } from "path";
var SURFACE = "telegram";
function injectFile() {
  const path = process.env.MOCK_INJECT_FILE;
  if (!path) {
    throw new Error("magnis-mock-telegram requires MOCK_INJECT_FILE (shared JSONL path)");
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
    if (parsed !== null && typeof parsed === "object" && "surface" in parsed && parsed.surface === surface) {
      out.push(parsed);
    }
  }
  return out;
}
function appendItem(payload, remoteId, kind) {
  const path = injectFile();
  try {
    mkdirSync(dirname(path), { recursive: true });
  } catch {}
  appendFileSync(path, JSON.stringify({ surface: SURFACE, payload, remote_id: remoteId, kind }) + `
`);
  return readItems(SURFACE).length;
}

// plugins/sources/mock-telegram/src/fetch.ts
function fetchMockTelegram(args) {
  const surface = args.surface || SURFACE;
  const cursor = typeof args.cursor === "number" && args.cursor >= 0 ? Math.floor(args.cursor) : 0;
  const items = readItems(surface);
  const envelopes = items.slice(cursor).map((item) => ({
    surface,
    payload: item.payload ?? {},
    remote_id: item.remote_id ?? null,
    kind: typeof item.kind === "string" ? item.kind : "live"
  }));
  return Promise.resolve({ envelopes, nextCursor: items.length, hasMore: false });
}

// plugins/sources/mock-telegram/src/envelope.ts
function int(v) {
  return typeof v === "number" && Number.isInteger(v) ? v : undefined;
}
function str(v) {
  return typeof v === "string" ? v : undefined;
}
function bool(v, fallback) {
  return typeof v === "boolean" ? v : fallback;
}
function chatRemoteId(chatId) {
  return `tg:chat:${String(chatId)}`;
}
function messageRemoteId(chatId, messageId) {
  return `tg:msg:${String(chatId)}:${String(messageId)}`;
}
function buildChat(req) {
  const chatId = int(req.chat_id);
  if (chatId === undefined)
    return null;
  const rawTitle = str(req.title) ?? "";
  const payload = {
    entity_type: "telegram_chat",
    chat_id: chatId,
    title: rawTitle === "" ? `Chat ${String(chatId)}` : rawTitle,
    type: str(req.type) ?? "private",
    is_pinned: bool(req.is_pinned, false),
    pin_order: typeof req.pin_order === "number" && Number.isInteger(req.pin_order) && req.pin_order >= 0 ? req.pin_order : 0,
    unread_count: int(req.unread_count) ?? 0,
    unread_mark: bool(req.unread_mark, false),
    read_inbox_max_id: int(req.read_inbox_max_id) ?? 0,
    read_outbox_max_id: int(req.read_outbox_max_id) ?? 0,
    unread_mentions_count: int(req.unread_mentions_count) ?? 0,
    top_message: int(req.top_message) ?? 0
  };
  const memberCount = int(req.member_count);
  if (memberCount !== undefined)
    payload.member_count = memberCount;
  const username = str(req.username);
  if (username !== undefined)
    payload.username = username;
  const avatarUrl = str(req.avatar_url);
  if (avatarUrl !== undefined)
    payload.avatar_url = avatarUrl;
  return { payload, remoteId: chatRemoteId(chatId) };
}
function buildMessage(req) {
  const chatId = int(req.chat_id);
  if (chatId === undefined)
    return null;
  const messageId = int(req.message_id) ?? readItems(SURFACE).length + 1;
  const payload = {
    message_id: messageId,
    chat_id: chatId,
    text: str(req.text) ?? "",
    date: str(req.date) ?? new Date().toISOString(),
    is_outgoing: bool(req.is_outgoing, false)
  };
  const chatTitle = str(req.chat_title);
  if (chatTitle !== undefined)
    payload.chat_title = chatTitle;
  const senderName = str(req.sender_name);
  if (senderName !== undefined)
    payload.sender_name = senderName;
  const senderId = int(req.sender_id);
  if (senderId !== undefined)
    payload.sender_id = senderId;
  const replyTo = int(req.reply_to_msg_id);
  if (replyTo !== undefined)
    payload.reply_to_msg_id = replyTo;
  return { payload, remoteId: messageRemoteId(chatId, messageId) };
}

// plugins/sources/mock-telegram/src/http.ts
function appendOrZero(payload, remoteId, kind) {
  try {
    return appendItem(payload, remoteId, kind);
  } catch {
    return 0;
  }
}
function injectChat(req) {
  const built = buildChat(req);
  if (!built)
    return { queued: false, error: "chat_id (integer) required" };
  const total = appendOrZero(built.payload, built.remoteId, "snapshot");
  return { queued: true, total, remote_id: built.remoteId };
}
function injectMessage(req) {
  const built = buildMessage(req);
  if (!built)
    return { queued: false, error: "chat_id (integer) required" };
  const total = appendOrZero(built.payload, built.remoteId, "live");
  return { queued: true, total, remote_id: built.remoteId };
}
function status() {
  const items = readItems(SURFACE);
  const chats = items.filter((i) => i.kind === "snapshot").length;
  return { chats, messages: items.length - chats, total: items.length };
}
async function body(req) {
  try {
    const parsed = await req.json();
    return parsed !== null && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
async function handleHttp(req) {
  const { pathname } = new URL(req.url);
  if (req.method === "POST" && pathname === "/inject-chat") {
    return Response.json(injectChat(await body(req)));
  }
  if (req.method === "POST" && pathname === "/inject-message") {
    return Response.json(injectMessage(await body(req)));
  }
  if (req.method === "GET" && pathname === "/health") {
    return new Response("ok");
  }
  if (req.method === "GET" && pathname === "/status") {
    return Response.json(status());
  }
  return new Response("Not Found", { status: 404 });
}
function maybeRunHttp() {
  const raw = process.env.MOCK_TELEGRAM_PORT;
  if (!raw)
    return;
  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    return;
  try {
    Bun.serve({ port, hostname: "0.0.0.0", fetch: handleHttp });
    process.stderr.write(`magnis-mock-telegram: control server on :${String(port)}
`);
  } catch (e) {
    process.stderr.write(`magnis-mock-telegram: control port ${String(port)} unavailable (${e instanceof Error ? e.message : String(e)}); MCP-only
`);
  }
}

// plugins/sources/mock-telegram/src/main.ts
maybeRunHttp();
await runConnector({
  name: "magnis-mock-telegram",
  version: "0.1.0",
  surfaces: [SURFACE],
  intervalSecs: 2,
  fetch: fetchMockTelegram
});
process.exit(0);
