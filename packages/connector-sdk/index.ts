// Magnis bun-connector SDK — the shared MCP-over-stdio framework for TS source
// connectors (X / LinkedIn). A connector is an external process the host spawns
// (by convention `bun run src/main.ts` when the package ships src/main.ts —
// manifest v3; [spawn] appears only as an override); it speaks the
// Magnis Sync Profile (line-delimited JSON-RPC) on stdin/stdout. The wire
// contract, exactly:
//   - initialize → { protocolVersion, capabilities.experimental.magnis.sync, serverInfo }
//   - tools/call magnis.sync.fetch { surface, cursor } → { envelopes, nextCursor, hasMore }
//   - notifications (no id) → no reply
// Read-only: connectors expose ONLY the fetch tool (no write tools).
//
// The PURE CONTRACT types (Envelope, FetchArgs, FetchResult, ConnectorConfig +
// its handler shapes) now live in ./contract/source — reviewable in isolation.
// They are re-exported below so every `import ... from "@magnis/connector-sdk"`
// resolves unchanged; only the runtime (runConnector, handleMessage, the error
// classes, the JSON-RPC codes) lives here.

export * from "./contract/source";
export * from "./codec";
export * from "./server";

import type { ConnectorConfig, DatasetActionArgs, Envelope, SyncTarget } from "./contract/source";

/** JSON-RPC error codes shared with the host runtime.
 * RATE_LIMIT carries `retry_after=<secs>` in the message so the host backs off
 * for the right window instead of crashing the connector (INV — S6). */
// Host contract: the host reads `error.data.retry_after` (typed), NOT the
// message.
export const RATE_LIMIT_CODE = -32002;
// Host contract: the host reads the CODE alone — never the message — so only
// an explicit throw of `CursorExpiredError` re-bootstraps. Everything else
// stays a hard failure.
export const CURSOR_EXPIRED_CODE = -32003;
const GENERIC_FETCH_ERROR_CODE = -32000;
const INVALID_PARAMS_CODE = -32602;
const MAX_INFLIGHT_TOOL_CALLS = 8;
const MAX_INFLIGHT_DOWNLOADS = 2;

/** Throw this from a connector `fetch` on an upstream 429 so the host backs off
 * for `retryAfterSecs` rather than treating it as a hard failure. */
export class RateLimitError extends Error {
  constructor(readonly retryAfterSecs: number) {
    super(`rate limited; retry_after=${String(retryAfterSecs)}`);
    this.name = "RateLimitError";
  }
}

/** Throw this from a connector `fetch` when the cursor/watermark the host
 * handed back is stale or invalid upstream (Gmail's historyId 404, a dropped
 * delta token, …) so the host resets the sync phase to Bootstrap and re-syncs
 * from scratch — rather than parking the source at `state=failed` forever.
 * Not a failure: the host deliberately does not inflate the error streak. */
export class CursorExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CursorExpiredError";
  }
}

/** Throw this to answer with a TYPED JSON-RPC error: `data` reaches the host
 * verbatim (it reads `data.kind` to classify the failure — auth / network /
 * rate_limited / …). A plain Error stays untyped (`-32000`, message only). */
export class ConnectorError extends Error {
  constructor(
    message: string,
    readonly data: Record<string, unknown>,
    readonly code: number = GENERIC_FETCH_ERROR_CODE,
  ) {
    super(message);
    this.name = "ConnectorError";
  }
}

/** The shared throw → JSON-RPC error mapping for the tool handlers. */
function errorReply(id: unknown, e: unknown): Record<string, unknown> {
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
        data: { retry_after: e.retryAfterSecs },
      },
    };
  }
  if (e instanceof CursorExpiredError) {
    return {
      jsonrpc: "2.0",
      id,
      error: { code: CURSOR_EXPIRED_CODE, message: e.message },
    };
  }
  const message = e instanceof Error ? e.message : String(e);
  return { jsonrpc: "2.0", id, error: { code: GENERIC_FETCH_ERROR_CODE, message } };
}

/** Live subscriptions this process holds. Module-level: one connector
 * process serves one host. */
const liveSubscriptions = new Set<string>();

function extractMeta(args: Record<string, unknown>): Record<string, unknown> | undefined {
  return args._meta && typeof args._meta === "object"
    ? (args._meta as Record<string, unknown>)
    : undefined;
}

function makeEmitter(
  config: ConnectorConfig,
  subscriptionId: string,
): (envelope: Envelope) => void {
  const write =
    config.onNotification ??
    ((line: string): void => {
      process.stdout.write(line + "\n");
    });
  return (envelope: Envelope) => {
    // A stop kills the subscription; late emits are refused, not routed.
    if (!liveSubscriptions.has(subscriptionId)) return;
    write(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/magnis/envelope",
        params: {
          subscription_id: subscriptionId,
          surface: envelope.surface,
          remote_id: envelope.remote_id,
          kind: envelope.kind,
          payload: envelope.payload,
          ...(envelope.position === undefined ? {} : { position: envelope.position }),
        },
      }),
    );
  };
}

interface JsonRpc {
  jsonrpc?: string;
  id?: unknown;
  method?: string;
  params?: { name?: string; arguments?: Record<string, unknown> };
}

function capabilities(config: ConnectorConfig): Record<string, unknown> {
  const mode = config.mode ?? "poll";
  return {
    tools: {},
    experimental: {
      magnis: {
        sync: {
          surfaces: config.surfaces,
          mode,
          ...(mode === "push" ? {} : { interval_secs: config.intervalSecs ?? 300 }),
        },
      },
    },
  };
}

/** Pure dispatch — maps one inbound JSON-RPC message to a reply (or null for a
 * notification / no-id). Side-effect-free except the caller-provided fetch. */
export async function handleMessage(
  msg: JsonRpc,
  config: ConnectorConfig,
): Promise<Record<string, unknown> | null> {
  const id = msg.id;
  const method = msg.method ?? "";
  if (id === undefined || id === null) return null; // notification

  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2025-06-18",
        capabilities: capabilities(config),
        serverInfo: { name: config.name, version: config.version },
      },
    };
  }

  if (method === "tools/call") {
    const name = msg.params?.name ?? "";
    const authMode = process.argv.includes("--auth-mode");
    const authOperation = name.startsWith("magnis.auth.") && name !== "magnis.auth.probe";
    if (authOperation !== authMode) {
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `tool '${name}' is not available in ${authMode ? "auth" : "source"} mode` },
      };
    }
    if (name === "magnis.auth.probe" && config.probeAuth) {
      const args = (msg.params?.arguments ?? {});
      const meta =
        args._meta && typeof args._meta === "object"
          ? (args._meta as Record<string, unknown>)
          : undefined;
      try {
        const result = await config.probeAuth(meta);
        return { jsonrpc: "2.0", id, result };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          jsonrpc: "2.0",
          id,
          error: { code: GENERIC_FETCH_ERROR_CODE, message, data: { kind: "auth", message } },
        };
      }
    }
    const rawArgs = (msg.params?.arguments ?? {});
    const metaArg = extractMeta(rawArgs);

    // ── push sessions ───────────────────────────────────────────────────────
    if (name === "listen_start" && config.listenStart) {
      if (typeof rawArgs.subscription_id !== "string" || rawArgs.subscription_id === "") {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: INVALID_PARAMS_CODE, message: "missing required arg 'subscription_id'" },
        };
      }
      const subscriptionId = rawArgs.subscription_id;
      liveSubscriptions.add(subscriptionId);
      try {
        await config.listenStart(
          { subscription_id: subscriptionId, meta: metaArg },
          makeEmitter(config, subscriptionId),
        );
        return { jsonrpc: "2.0", id, result: { ok: true, subscription_id: subscriptionId } };
      } catch (e) {
        liveSubscriptions.delete(subscriptionId);
        return errorReply(id, e);
      }
    }
    if (name === "listen_stop" && config.listenStop) {
      if (typeof rawArgs.subscription_id !== "string" || rawArgs.subscription_id === "") {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: INVALID_PARAMS_CODE, message: "missing required arg 'subscription_id'" },
        };
      }
      const subscriptionId = rawArgs.subscription_id;
      liveSubscriptions.delete(subscriptionId);
      try {
        await config.listenStop({ subscription_id: subscriptionId });
        return { jsonrpc: "2.0", id, result: { ok: true } };
      } catch (e) {
        return errorReply(id, e);
      }
    }

    // ── auth flows ──────────────────────────────────────────────────────────
    if (name.startsWith("magnis.auth.") && name !== "magnis.auth.probe") {
      const op = name.slice("magnis.auth.".length) as "begin" | "step" | "exchange" | "revoke";
      const handler = config.auth?.[op];
      if (!handler) {
        return { jsonrpc: "2.0", id, error: { code: -32601, message: `unknown tool ${name}` } };
      }
      try {
        const result = await handler(rawArgs, metaArg);
        return { jsonrpc: "2.0", id, result };
      } catch (e) {
        return errorReply(id, e);
      }
    }

    // ── outbound actions ────────────────────────────────────────────────────
    if (name === "magnis.dataset.invoke") {
      const action = typeof rawArgs.action === "string" ? rawArgs.action : "";
      const handler = config.datasetActions?.[action];
      if (!handler) {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `unknown dataset action '${action}'` },
        };
      }
      const payload =
        rawArgs.payload !== null && typeof rawArgs.payload === "object" && !Array.isArray(rawArgs.payload)
          ? (rawArgs.payload as Record<string, unknown>)
          : undefined;
      const settings =
        rawArgs.settings !== null && typeof rawArgs.settings === "object" && !Array.isArray(rawArgs.settings)
          ? (rawArgs.settings as Record<string, unknown>)
          : undefined;
      if (
        payload === undefined ||
        settings === undefined ||
        typeof rawArgs.invocation_id !== "string" ||
        typeof rawArgs.action_time !== "string"
      ) {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32602, message: "invalid dataset invocation" },
        };
      }
      try {
        const args: DatasetActionArgs = {
          action,
          invocation_id: rawArgs.invocation_id,
          action_time: rawArgs.action_time,
          settings,
          payload,
          meta: metaArg,
        };
        const result = await handler(args);
        return { jsonrpc: "2.0", id, result };
      } catch (e) {
        return errorReply(id, e);
      }
    }

    if (name === "magnis.execute") {
      const action = typeof rawArgs.action === "string" ? rawArgs.action : "";
      const handler = config.execute?.[action];
      if (!handler) {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `unknown execute action '${action}'` },
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
        error: { code: -32601, message: `unknown tool ${name}` },
      };
    }
    const args = rawArgs;
    const surface =
      typeof args.surface === "string" ? args.surface : config.surfaces[0] ?? "";
    const cursor = args.cursor; // arbitrary JSON, verbatim
    const direction =
      args.direction === "forward" || args.direction === "backward"
        ? args.direction
        : undefined;
    const tracked = Array.isArray(args.tracked_handles)
      ? (args.tracked_handles.filter((h) => typeof h === "string"))
      : undefined;
    const limit = typeof args.limit === "number" ? args.limit : undefined;
    const scopeId = typeof args.scope_id === "string" ? args.scope_id : undefined;
    const target = args.target !== null && typeof args.target === "object" && !Array.isArray(args.target)
      ? args.target as SyncTarget
      : undefined;
    const forwardCheckpoint = args.forward_checkpoint;
    const meta = metaArg;
    // A fetch failure must NOT crash the connector — return a JSON-RPC error so
    // the host degrades the surface (and backs off on a rate limit, S6).
    try {
      const result = await config.fetch({
        surface,
        cursor,
        direction,
        scope_id: scopeId,
        target,
        forward_checkpoint: forwardCheckpoint,
        tracked_handles: tracked,
        limit,
        meta,
        raw: args,
      });
      return { jsonrpc: "2.0", id, result };
    } catch (e) {
      return errorReply(id, e);
    }
  }

  // tools/list and anything else: advertise the single read tool (cred-less —
  // initialize/list never need a key; auth fails at fetch).
  if (method === "tools/list") {
    const tools: Record<string, unknown>[] = [
      {
        name: "magnis.sync.fetch",
        description: "Fetch a page of canonical envelopes for a surface.",
        inputSchema: {
          type: "object",
          properties: {
            surface: { type: "string" },
            cursor: {},
            scope_id: { type: "string" },
            target: { type: "object" },
            forward_checkpoint: {},
            tracked_handles: { type: "array", items: { type: "string" } },
            limit: { type: "integer" },
          },
          required: ["surface"],
        },
      },
    ];
    if (config.datasetActions !== undefined) {
      tools.push({
        name: "magnis.dataset.invoke",
        description: "Invoke one manifest-declared dataset action.",
        inputSchema: {
          type: "object",
          required: ["action", "invocation_id", "action_time", "payload"],
          properties: {
            action: { type: "string" },
            invocation_id: { type: "string" },
            action_time: { type: "string", format: "date-time" },
            payload: { type: "object" },
          },
          additionalProperties: false,
        },
      });
    }
    return {
      jsonrpc: "2.0",
      id,
      result: { tools },
    };
  }

  return { jsonrpc: "2.0", id, error: { code: -32601, message: `unknown method ${method}` } };
}

class Semaphore {
  private available: number;
  private readonly waiters: (() => void)[] = [];

  constructor(permits: number) {
    this.available = permits;
  }

  async acquire(): Promise<void> {
    if (this.available > 0) {
      this.available -= 1;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
  }

  release(): void {
    const next = this.waiters.shift();
    if (next === undefined) this.available += 1;
    else next();
  }
}

function isDownload(msg: JsonRpc): boolean {
  return msg.method === "tools/call" && msg.params?.name === "magnis.execute"
    && msg.params.arguments?.action === "download_file";
}

function isControl(msg: JsonRpc): boolean {
  return msg.method === "tools/call" && msg.params?.name === "listen_stop";
}

/** Run the connector: line-delimited JSON-RPC on stdin → replies on stdout.
 * @tested-by: tst_src_sdk_runtime_001
 * @invariant: one slow provider call or the bounded download pool cannot block
 * unrelated Source work or listener shutdown. */
export async function runConnector(
  config: ConnectorConfig,
  input: NodeJS.ReadableStream = process.stdin,
  write: (line: string) => void = (line) => { process.stdout.write(line + "\n"); },
): Promise<void> {
  const { createInterface } = await import("node:readline");
  const calls = new Semaphore(MAX_INFLIGHT_TOOL_CALLS);
  const downloads = new Semaphore(MAX_INFLIGHT_DOWNLOADS);
  const pending = new Set<Promise<void>>();
  const rl = createInterface({ input });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch {
      continue;
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) continue;
    const msg = parsed as JsonRpc;
    const pool = isControl(msg) ? null : isDownload(msg) ? downloads : calls;
    const work = (async (): Promise<void> => {
      if (pool !== null) await pool.acquire();
      try {
        const reply = await handleMessage(msg, config);
        if (reply !== null) write(JSON.stringify(reply));
      } catch (error: unknown) {
        process.stderr.write(`connector dispatch failed: ${String(error)}\n`);
      } finally {
        pool?.release();
      }
    })();
    pending.add(work);
    void work.then(() => { pending.delete(work); });
  }
  await Promise.all(pending);
}
