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

// plugins/sources/local/src/surfaces/notes/fetch.ts
import { createHash } from "crypto";

// plugins/sources/local/src/surfaces/notes/scan.ts
import { readdirSync, readFileSync, statSync } from "fs";
import { extname, join, relative } from "path";
function notesDir() {
  const dir = process.env.NOTES_DIR;
  if (dir)
    return dir;
  const storage = process.env.STORAGE_DIR;
  if (storage)
    return join(storage, "notes");
  throw new Error("magnis-local requires NOTES_DIR or STORAGE_DIR");
}
function scan(base) {
  const out = [];
  const stack = [base];
  while (stack.length > 0) {
    const dir = stack.pop();
    if (dir === undefined)
      break;
    let names;
    try {
      names = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      const p = join(dir, name);
      let stats;
      try {
        stats = statSync(p);
      } catch {
        continue;
      }
      if (stats.isDirectory()) {
        stack.push(p);
        continue;
      }
      if (extname(p) !== ".md")
        continue;
      let body;
      try {
        body = readFileSync(p, "utf8");
      } catch {
        continue;
      }
      out.push({
        path: relative(base, p),
        filename: name,
        body,
        size: stats.size,
        mtime: Math.floor(stats.mtimeMs / 1000)
      });
    }
  }
  out.sort((a, b) => b.mtime - a.mtime || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return out;
}

// plugins/sources/local/src/surfaces/notes/fetch.ts
function fetchLocalNotes(args) {
  const entries = scan(notesDir());
  const cursor = args.cursor;
  const cursorMtime = cursor && typeof cursor === "object" && typeof cursor.last_mtime === "number" ? cursor.last_mtime : 0;
  const first = entries[0];
  const newest = first !== undefined ? first.mtime : null;
  const envelopes = entries.filter((e) => args.direction !== "forward" || e.mtime > cursorMtime).map((e) => ({
    surface: "notes",
    payload: {
      path: e.path,
      filename: e.filename,
      body: e.body,
      size: e.size,
      mtime: e.mtime,
      content_hash: createHash("sha256").update(e.body, "utf8").digest("hex")
    },
    remote_id: e.path
  }));
  return Promise.resolve({
    envelopes,
    nextCursor: newest === null ? null : { last_mtime: newest },
    hasMore: false
  });
}

// plugins/sources/local/src/connector.ts
function buildConnectorConfig() {
  return {
    name: "magnis-local",
    version: "0.1.0",
    surfaces: ["notes"],
    intervalSecs: 60,
    fetch: fetchLocalNotes
  };
}

// plugins/sources/local/src/main.ts
await runConnector(buildConnectorConfig());
