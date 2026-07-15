// Magnis bun-connector SDK — the shared MCP-over-stdio framework for TS source
// connectors (X / LinkedIn). A connector is an external process the host spawns
// (manifest [spawn] command="bun" args=["run","src/main.ts"]); it speaks the
// Magnis Sync Profile (line-delimited JSON-RPC) on stdin/stdout. Mirrors the
// Rust mock-gmail wire contract exactly:
//   - initialize → { protocolVersion, capabilities.experimental.magnis.sync, serverInfo }
//   - tools/call magnis.sync.fetch { surface, cursor } → { envelopes, nextCursor, hasMore }
//   - notifications (no id) → no reply
// Read-only: connectors expose ONLY the fetch tool (no write tools).

/** One canonical sync envelope the host routes to the owning module's surface. */
export interface Envelope {
  surface: string;
  remote_id: string;
  kind: "snapshot" | "live" | "delete";
  payload: Record<string, unknown>;
}

export interface FetchArgs {
  surface: string;
  cursor?: number;
  /** Tracked handles for this platform — set DEC-8 (host passes the opt-in set). */
  tracked_handles?: string[];
  limit?: number;
  /** Host-injected credentials (DEC-6): the `_meta` object the host attaches to
   * each tools/call — e.g. `{ bearer_token }` (X) / `{ anysite_key }` (LinkedIn). */
  meta?: Record<string, unknown>;
}

export interface FetchResult {
  envelopes: Envelope[];
  nextCursor: number;
  hasMore: boolean;
}

/** JSON-RPC error codes shared with the host (backend runtime/runtime.rs).
 * RATE_LIMIT carries `retry_after=<secs>` in the message so the host backs off
 * for the right window instead of crashing the connector (INV — S6). */
// Twin: backend/src/sources/mcp/runtime.rs::RATE_LIMITED_CODE and the telegram
// connector — the host reads `error.data.retry_after` (typed), NOT the message.
export const RATE_LIMIT_CODE = -32002;
const GENERIC_FETCH_ERROR_CODE = -32000;

/** Throw this from a connector `fetch` on an upstream 429 so the host backs off
 * for `retryAfterSecs` rather than treating it as a hard failure. */
export class RateLimitError extends Error {
  constructor(readonly retryAfterSecs: number) {
    super(`rate limited; retry_after=${retryAfterSecs}`);
    this.name = "RateLimitError";
  }
}

export interface ConnectorConfig {
  name: string;
  version: string;
  /** Surfaces this connector feeds (e.g. ["social"]). */
  surfaces: string[];
  /** Poll cadence advertised in capabilities. */
  intervalSecs?: number;
  /** The read handler — called for magnis.sync.fetch. Read-only. */
  fetch: (args: FetchArgs) => Promise<FetchResult>;
  /** ProbeAuth (sync-status plan §2.4) — called for magnis.auth.probe. MUST
   * hit the real provider with the injected key and return the verified
   * subject. Absent → magnis.auth.probe stays rejected (source cannot be
   * provisioned). */
  probeAuth?: (meta: Record<string, unknown> | undefined) => Promise<{ subject: string }>;
}

type JsonRpc = {
  jsonrpc?: string;
  id?: unknown;
  method?: string;
  params?: { name?: string; arguments?: Record<string, unknown> };
};

function capabilities(config: ConnectorConfig): Record<string, unknown> {
  return {
    tools: {},
    experimental: {
      magnis: {
        sync: {
          surfaces: config.surfaces,
          mode: "poll",
          interval_secs: config.intervalSecs ?? 300,
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
if (name === "magnis.auth.probe" && config.probeAuth) {
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
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
    if (name !== "magnis.sync.fetch") {
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `unknown tool ${name}` },
      };
    }
    const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
    const surface =
      typeof args.surface === "string" ? args.surface : config.surfaces[0] ?? "";
    const cursor = typeof args.cursor === "number" ? args.cursor : 0;
    const tracked = Array.isArray(args.tracked_handles)
      ? (args.tracked_handles.filter((h) => typeof h === "string") as string[])
      : undefined;
    const limit = typeof args.limit === "number" ? args.limit : undefined;
    const meta =
      args._meta && typeof args._meta === "object"
        ? (args._meta as Record<string, unknown>)
        : undefined;
    // A fetch failure must NOT crash the connector — return a JSON-RPC error so
    // the host degrades the surface (and backs off on a rate limit, S6).
    try {
      const result = await config.fetch({ surface, cursor, tracked_handles: tracked, limit, meta });
      return { jsonrpc: "2.0", id, result };
    } catch (e) {
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
      const message = e instanceof Error ? e.message : String(e);
      return { jsonrpc: "2.0", id, error: { code: GENERIC_FETCH_ERROR_CODE, message } };
    }
  }

  // tools/list and anything else: advertise the single read tool (cred-less,
  // DEC-7 — initialize/list never need a key; auth fails at fetch).
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
                limit: { type: "integer" },
              },
              required: ["surface"],
            },
          },
        ],
      },
    };
  }

  return { jsonrpc: "2.0", id, error: { code: -32601, message: `unknown method ${method}` } };
}

/** Run the connector: line-delimited JSON-RPC on stdin → replies on stdout.
 * Runtime entry — the pure logic lives in `handleMessage` (unit-tested). */
export async function runConnector(config: ConnectorConfig): Promise<void> {
  const { createInterface } = await import("node:readline");
  const rl = createInterface({ input: process.stdin });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let msg: JsonRpc;
    try {
      msg = JSON.parse(trimmed) as JsonRpc;
    } catch {
      continue;
    }
    const reply = await handleMessage(msg, config);
    if (reply) process.stdout.write(JSON.stringify(reply) + "\n");
  }
}
