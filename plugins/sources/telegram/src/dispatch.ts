// JSON-RPC wire dispatch — TS twin of plugins/sources/telegram/src/main.rs
// (`run_mcp_stdio` method routing + `handle_tools_call`).
//
// ── WHY NOT `runConnector` FROM @magnis/connector-sdk ──────────────────────
// This connector deliberately owns its dispatch instead of routing through the
// SDK's `handleMessage`/`runConnector`. Wire parity with the Rust `telegram`
// binary is the invariant (the host must not tell the twins apart), and the Rust
// telegram wire predates — and differs from — the SDK's conventions on SIX
// points that the SDK cannot express today:
//
//   1. Generic tool-failure code is -32601 here; the SDK hard-codes -32000.
//   2. Push notification params are {subscription_id, account_id, payload,
//      remote_id} — the SDK's emitter always stamps `surface` + `kind` too.
//   3. `listen_start` REQUIRES subscription_id (-32602 when missing); the SDK
//      silently defaults it to "sub:legacy". Its errors are -32602, not -32000.
//   4. `listen_stop` answers {ok, subscription_id, cancelled} and NEVER errors;
//      the SDK answers a bare {ok:true} and can error.
//   5. `capabilities` omits `interval_secs` entirely (push source); the SDK
//      always emits it (default 300).
//   6. The mode gate (`--auth-mode` serves ONLY magnis.auth.*) has no SDK hook,
//      and the SDK's read loop is strictly SEQUENTIAL, whereas the Rust binary
//      spawns each tools/call (bounded by a semaphore) so a long bootstrap fetch
//      never starves an interactive send — an observable difference.
//
// Bending the SDK to all six would mean six per-connector override hooks (and
// would risk the wire of the five connectors already on it: x, linkedin,
// google-ts, mock-x, mock-linkedin). So the SDK is left UNTOUCHED and we import
// only what genuinely matches: its shared `RATE_LIMIT_CODE` constant, so the
// rate-limit contract stays defined in exactly one place.

import { RATE_LIMIT_CODE } from "@magnis/connector-sdk";
import { RATE_LIMITED_PREFIX } from "./client";
import * as auth from "./auth";
import * as commands from "./commands";
import type { DialogPager } from "./client";
import type { TgOps } from "./commands";
import * as fixture from "./fixture";
import type { LineWriter, SubscriptionRegistry } from "./subscriptions";

// ── JSON-RPC error codes (protocol contract with the host) ────────────────
//
// Generic tool failure (the connector's historical code). AUTH_REQUIRED_CODE
// mirrors the host's runtime.rs: it tells the host to surface a typed auth error
// (SyncStatus::AuthRequired, UI "Re-auth needed") instead of a generic red sync
// error. RATE_LIMITED_CODE + `data.retry_after` maps to SourceError::RateLimit.
export const TOOL_ERROR_CODE = -32601;
export const AUTH_REQUIRED_CODE = -32001;
export const RATE_LIMITED_CODE = RATE_LIMIT_CODE; // -32002, shared with the SDK
const AUTH_FLOW_ERROR_CODE = -32000;
const INVALID_PARAMS_CODE = -32602;

/** Sync Profile capabilities. NOTE: no `interval_secs` key — telegram is push. */
export function capabilities(): Record<string, unknown> {
  return {
    tools: {},
    experimental: { magnis: { sync: { surfaces: ["telegram"], mode: "push" } } },
  };
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Classify an error from a live tool op into `(code, message)`. A Telegram
 * auth/session failure (RPC code 401 — AUTH_KEY_UNREGISTERED, SESSION_REVOKED)
 * gets AUTH_REQUIRED_CODE; a long FLOOD_WAIT (the RATE_LIMITED sentinel, already
 * converted by the send wrapper) gets RATE_LIMITED_CODE; everything else keeps
 * the generic code. */
export function classifyToolError(err: unknown): [number, string] {
  const message = errText(err);
  if (message.startsWith(RATE_LIMITED_PREFIX)) return [RATE_LIMITED_CODE, message];
  // Telegram signals auth/session failures as RPC error code 401. Match the
  // structured error, not the message text.
  const rpc = err as { code?: number } | null;
  if (rpc !== null && typeof rpc === "object" && rpc.code === 401) {
    return [AUTH_REQUIRED_CODE, message];
  }
  return [TOOL_ERROR_CODE, message];
}

/** Build the JSON-RPC `error` object for a failed fetch/execute. A
 * RATE_LIMITED_CODE error parses `{secs}` out of the `RATE_LIMITED:{secs}`
 * sentinel and attaches `data: { retry_after: secs }` so the host reads a TYPED
 * retry_after (the connector's only structured error payload today). */
export function toolErrorReply(code: number, message: string): Record<string, unknown> {
  if (code === RATE_LIMITED_CODE && message.startsWith(RATE_LIMITED_PREFIX)) {
    const rest = message.slice(RATE_LIMITED_PREFIX.length).trim();
    if (/^\d+$/.test(rest)) {
      const secs = Number(rest);
      return {
        code,
        message: `rate limited; retry after ${secs}s`,
        data: { retry_after: secs },
      };
    }
  }
  return { code, message };
}

/** Resolves the live client for a call's `_meta`. Injectable so tests never
 * touch gramjs or the network. */
export type ClientResolver = (
  args: Record<string, unknown>,
) => Promise<{ ops: TgOps; pager: DialogPager; accountId: string }>;

/** Production resolver — imports gramjs LAZILY so fixture-mode runs (and the
 * unit tests) never load the MTProto stack. */
const defaultResolveClient: ClientResolver = async (args) => {
  const { credsFromMeta, accountIdFromMeta } = await import("./client");
  const { pool, LiveDialogPager } = await import("./live");
  const creds = credsFromMeta(args);
  const accountId = accountIdFromMeta(args);
  const client = await pool().getOrCreate(accountId, creds);
  return { ops: client, pager: new LiveDialogPager(client, accountId), accountId };
};

export interface DispatchDeps {
  /** `--auth-mode` spawn: serve ONLY magnis.auth.*; a sync spawn refuses them. */
  authMode: boolean;
  registry: SubscriptionRegistry;
  /** Writes notification lines (push envelopes) to the host. */
  write: LineWriter;
  resolveClient?: ClientResolver;
  /** Flood-retry sleeper (tests inject a no-op). */
  sleep?: (secs: number) => Promise<void>;
}

export interface JsonRpcMessage {
  jsonrpc?: string;
  id?: unknown;
  method?: string;
  params?: { name?: string; arguments?: Record<string, unknown> };
}

const SERVER_NAME = "magnis-telegram";
const SERVER_VERSION = "1.0.0";

/** `magnis.sync.fetch`. Fixture mode short-circuits BEFORE any cred parsing (it
 * needs no `_meta` at all). */
async function fetchTool(
  args: Record<string, unknown>,
  deps: DispatchDeps,
): Promise<Record<string, unknown>> {
  const direction = typeof args.direction === "string" ? args.direction : "backward";
  const cursor = args.cursor;

  if (fixture.fixturePath() !== undefined) return fixture.fetchResult(direction, cursor);

  const resolve = deps.resolveClient ?? defaultResolveClient;
  const { ops, pager, accountId } = await resolve(args);
  return await commands.fetch(ops, pager, accountId, direction, cursor);
}

/** `magnis.execute`. Fixture mode records/echoes; live mode drives the client. */
async function executeTool(
  args: Record<string, unknown>,
  deps: DispatchDeps,
): Promise<Record<string, unknown>> {
  if (fixture.fixturePath() !== undefined) return fixture.executeResult(args);

  const resolve = deps.resolveClient ?? defaultResolveClient;
  const { ops, accountId } = await resolve(args);
  return await commands.execute(ops, accountId, args, {
    sleep: deps.sleep ?? commands.realSleep,
  });
}

/** Handle one inbound JSON-RPC message → its reply (or null for a notification /
 * no-id message, which gets no response). */
export async function handleMessage(
  msg: JsonRpcMessage,
  deps: DispatchDeps,
): Promise<Record<string, unknown> | null> {
  const method = msg.method ?? "";
  const id = msg.id;

  if (method === "initialize") {
    if (id === undefined || id === null) return null;
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2025-06-18",
        capabilities: capabilities(),
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      },
    };
  }

  if (method === "tools/list") {
    if (id === undefined || id === null) return null;
    // TODO(telegram follow-up): the Rust connector advertises 3 opinionated
    // tools here for direct Claude/agent use (list_chats, list_messages,
    // send_message). The HOST only calls magnis.sync.fetch / magnis.execute /
    // magnis.auth.* / listen_start / listen_stop, so they are SKIPPED — as is
    // the `magnis.test.sleep` concurrency test seam.
    return { jsonrpc: "2.0", id, result: { tools: [] } };
  }

  if (method !== "tools/call") return null; // notifications/initialized etc.
  if (id === undefined || id === null) return null;

  const name = msg.params?.name ?? "";
  const args = msg.params?.arguments ?? {};

  // Mode-spawn gate: reject cross-mode tool calls up front (defense in depth).
  if (name.startsWith("magnis.auth.") !== deps.authMode) {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: TOOL_ERROR_CODE,
        message: `tool '${name}' is not available in ${deps.authMode ? "auth" : "sync"} mode`,
      },
    };
  }

  switch (name) {
    case "listen_start": {
      const subId = typeof args.subscription_id === "string" ? args.subscription_id : "";
      if (subId === "") {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: INVALID_PARAMS_CODE, message: "missing required arg 'subscription_id'" },
        };
      }
      try {
        await deps.registry.startFromEnv(subId, args, deps.write);
        return { jsonrpc: "2.0", id, result: { ok: true, subscription_id: subId } };
      } catch (e) {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: INVALID_PARAMS_CODE, message: errText(e) },
        };
      }
    }

    case "listen_stop": {
      const subId = typeof args.subscription_id === "string" ? args.subscription_id : "";
      // ALWAYS ok — an unknown/empty id simply reports cancelled=false.
      const cancelled = subId === "" ? false : deps.registry.stop(subId);
      return {
        jsonrpc: "2.0",
        id,
        result: { ok: true, subscription_id: subId, cancelled },
      };
    }

    // Backward-compat: the legacy single-subscription tool (NOT advertised).
    // Routes through the registry with a stable default sub_id derived from
    // account_id, so callers that never adopted listen_stop still get one
    // cancellable subscription per account.
    case "magnis.sync.listen": {
      const { accountIdFromMeta } = await import("./client");
      let subId: string;
      try {
        subId = `sub:${accountIdFromMeta(args)}`;
      } catch {
        subId = "sub:legacy";
      }
      try {
        await deps.registry.startFromEnv(subId, args, deps.write);
        return { jsonrpc: "2.0", id, result: { ok: true, subscription_id: subId } };
      } catch (e) {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: INVALID_PARAMS_CODE, message: errText(e) },
        };
      }
    }

    case "magnis.sync.fetch":
    case "magnis.execute": {
      try {
        const result =
          name === "magnis.sync.fetch"
            ? await fetchTool(args, deps)
            : await executeTool(args, deps);
        return { jsonrpc: "2.0", id, result };
      } catch (e) {
        const [code, message] = classifyToolError(e);
        return { jsonrpc: "2.0", id, error: toolErrorReply(code, message) };
      }
    }

    // Host-driven MTProto login. One connector instance per session keeps the
    // client + phoneCodeHash alive across begin → step.
    case "magnis.auth.begin":
    case "magnis.auth.step":
    case "magnis.auth.revoke": {
      try {
        const result =
          name === "magnis.auth.begin"
            ? await auth.begin(args)
            : name === "magnis.auth.step"
              ? await auth.step(args)
              : await auth.revoke(args);
        return { jsonrpc: "2.0", id, result };
      } catch (e) {
        return { jsonrpc: "2.0", id, error: { code: AUTH_FLOW_ERROR_CODE, message: errText(e) } };
      }
    }

    default:
      return {
        jsonrpc: "2.0",
        id,
        error: { code: TOOL_ERROR_CODE, message: `unknown tool ${name}` },
      };
  }
}
