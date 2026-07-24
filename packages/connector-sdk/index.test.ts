import { describe, test, expect } from "bun:test";
import {
  ConnectorError,
  CursorExpiredError,
  CURSOR_EXPIRED_CODE,
  handleMessage,
  RateLimitError,
  RATE_LIMIT_CODE,
  type ConnectorConfig,
  type FetchArgs,
} from "./index";

function cfg(
  fetchImpl?: ConnectorConfig["fetch"],
): ConnectorConfig {
  return {
    name: "test-connector",
    version: "0.0.1",
    surfaces: ["social"],
    intervalSecs: 42,
    fetch:
      fetchImpl ??
      (async () => ({ envelopes: [], nextCursor: 0, hasMore: false })),
  };
}

describe("connector SDK dispatch", () => {
  test("tst_sdk_001 initialize advertises sync capabilities cred-less", async () => {
    const reply = await handleMessage({ id: 1, method: "initialize" }, cfg());
    expect(reply).not.toBeNull();
    const result = reply!.result as Record<string, any>;
    expect(result.protocolVersion).toBe("2025-06-18");
    const sync = result.capabilities.experimental.magnis.sync;
    expect(sync.surfaces).toEqual(["social"]);
    expect(sync.mode).toBe("poll");
    expect(sync.interval_secs).toBe(42);
    expect(result.serverInfo.name).toBe("test-connector");
  });

  test("tst_sdk_002 magnis.sync.fetch routes args and returns envelopes", async () => {
    let seen: FetchArgs | undefined;
    const reply = await handleMessage(
      {
        id: 2,
        method: "tools/call",
        params: {
          name: "magnis.sync.fetch",
          arguments: {
            surface: "social",
            cursor: 7,
            tracked_handles: ["@alice", "@bob"],
          },
        },
      },
      cfg(async (args) => {
        seen = args;
        return {
          envelopes: [
            {
              surface: "social",
              remote_id: "post-1",
              kind: "live",
              payload: { entity_type: "social.post", text: "hi" },
            },
          ],
          nextCursor: 8,
          hasMore: true,
        };
      }),
    );
    expect(seen?.surface).toBe("social");
    expect(seen?.cursor).toBe(7);
    expect(seen?.tracked_handles).toEqual(["@alice", "@bob"]);
    const result = reply!.result as Record<string, any>;
    expect(result.envelopes).toHaveLength(1);
    expect(result.envelopes[0].remote_id).toBe("post-1");
    expect(result.nextCursor).toBe(8);
    expect(result.hasMore).toBe(true);
  });

  test("tst_sdk_003 unknown tool is rejected (read-only — no write tools)", async () => {
    const reply = await handleMessage(
      {
        id: 3,
        method: "tools/call",
        params: { name: "social.posts.create", arguments: {} },
      },
      cfg(),
    );
    const err = reply!.error as Record<string, any>;
    expect(err.code).toBe(-32601);
  });

  test("tst_sdk_004 tools/list exposes only the read fetch tool", async () => {
    const reply = await handleMessage({ id: 4, method: "tools/list" }, cfg());
    const tools = (reply!.result as Record<string, any>).tools as any[];
    expect(tools.map((t) => t.name)).toEqual(["magnis.sync.fetch"]);
  });

  test("tst_sdk_005 notification (no id) yields no reply", async () => {
    const reply = await handleMessage(
      { method: "notifications/initialized" },
      cfg(),
    );
    expect(reply).toBeNull();
  });

  test("tst_sdk_006 a fetch RateLimitError → JSON-RPC error (host backs off, no crash)", async () => {
    const reply = await handleMessage(
      { id: 6, method: "tools/call", params: { name: "magnis.sync.fetch", arguments: { surface: "social" } } },
      cfg(async () => {
        throw new RateLimitError(90);
      }),
    );
    const err = reply!.error as Record<string, any>;
    expect(err.code).toBe(RATE_LIMIT_CODE);
    // The host reads the TYPED data.retry_after (runtime.rs RATE_LIMITED_CODE
    // contract, staging FLOOD_WAIT twin) — message text is informational only.
    expect(err.data).toEqual({ retry_after: 90 });
  });

  test("tst_sdk_006c a fetch CursorExpiredError → -32003 (host re-bootstraps)", async () => {
    // Twin: backend/src/sources/mcp/runtime.rs::CURSOR_EXPIRED_CODE. The host
    // maps THIS code — and only this code — to SourceErrorKind::CursorExpired,
    // which resets the sync phase to Bootstrap and clears the stale cursor.
    // Message text is informational only; the code is the contract.
    const reply = await handleMessage(
      { id: 62, method: "tools/call", params: { name: "magnis.sync.fetch", arguments: { surface: "email" } } },
      cfg(async () => {
        throw new CursorExpiredError("Gmail historyId expired (404)");
      }),
    );
    const err = reply!.error as Record<string, any>;
    expect(err.code).toBe(CURSOR_EXPIRED_CODE);
    expect(CURSOR_EXPIRED_CODE).toBe(-32003);
    expect(err.message).toBe("Gmail historyId expired (404)");
  });

  test("tst_sdk_006b a fetch ConnectorError → typed error data verbatim", async () => {
    // The StateMock archetypes program typed failures (`{kind:"auth"|"network"
    // |"rate_limited"|..}`) and the host reads `error.data`; the SDK must carry
    // the connector's data object through untouched, code included.
    const reply = await handleMessage(
      { id: 61, method: "tools/call", params: { name: "magnis.sync.fetch", arguments: { surface: "social" } } },
      cfg(async () => {
        throw new ConnectorError("boom", { kind: "network", message: "boom" });
      }),
    );
    const err = reply!.error as Record<string, any>;
    expect(err.code).toBe(-32000);
    expect(err.message).toBe("boom");
    expect(err.data).toEqual({ kind: "network", message: "boom" });
  });

  test("tst_sdk_007 a generic fetch error → JSON-RPC error, not a throw", async () => {
    const reply = await handleMessage(
      { id: 7, method: "tools/call", params: { name: "magnis.sync.fetch", arguments: { surface: "social" } } },
      cfg(async () => {
        throw new Error("upstream 500");
      }),
    );
    const err = reply!.error as Record<string, any>;
    expect(err.code).toBe(-32000);
    expect(err.message).toContain("upstream 500");
  });
});

// tst_sdk_008: magnis.execute is not part of the TS connector SDK (the only
// implementor moved to the contacts sync surface); the SDK rejects
// it like any unknown tool.
describe("connector SDK execute rejection", () => {
  const base = {
    name: "t",
    version: "0",
    surfaces: ["x"],
    fetch: async () => ({ envelopes: [], nextCursor: 0, hasMore: false }),
  };

  test("tst_sdk_008 magnis.execute without an execute handler → method error", async () => {
    const reply = await handleMessage(
      { jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "magnis.execute", arguments: {} } },
      base,
    );
    expect(reply!.error).toBeDefined();
  });
});
