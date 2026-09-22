import { PassThrough } from "node:stream";

import { describe, test, expect } from "bun:test";
import {
  ConnectorError,
  CursorExpiredError,
  CURSOR_EXPIRED_CODE,
  handleMessage,
  RateLimitError,
  RATE_LIMIT_CODE,
  runConnector,
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
  /**
   * @test-id: tst_src_sdk_runtime_001
   * @scenario: scn_source_runtime_shared_dispatch_001
   * @covers: packages/connector-sdk/index.ts::runConnector
   * @deterministic: yes; in-memory streams, barriers, handlers and writers
   * @fixtures: none
   *
   * Test environment: Connector SDK stdio runtime over an in-memory stream.
   * Clients: direct calls.
   * Mocks: in-memory Source handlers.
   * Data: held fetch/download calls, interactive/control calls and both modes.
   */
  test("tst_src_sdk_runtime_001 shares one bounded responsive Source runtime", async () => {
    let started = false;
    const missingSubscription = await handleMessage(
      {
        id: 100,
        method: "tools/call",
        params: { name: "listen_start", arguments: {} },
      },
      {
        ...cfg(),
        mode: "push",
        listenStart: async () => {
          started = true;
        },
      },
    );

    expect(missingSubscription).toMatchObject({ error: { code: -32602 } });
    expect(started).toBe(false);

    let releaseFetch: (() => void) | undefined;
    const fetchGate = new Promise<void>((resolve) => { releaseFetch = resolve; });
    let releaseDownloads: (() => void) | undefined;
    const downloadGate = new Promise<void>((resolve) => { releaseDownloads = resolve; });
    let markFetchStarted: (() => void) | undefined;
    const fetchStarted = new Promise<void>((resolve) => { markFetchStarted = resolve; });
    let markTwoDownloadsStarted: (() => void) | undefined;
    const twoDownloadsStarted = new Promise<void>((resolve) => { markTwoDownloadsStarted = resolve; });
    let downloadsStarted = 0;
    let stopped = "";
    const notifications: Record<string, unknown>[] = [];
    const replies = new Map<number, Record<string, unknown>>();
    const replyWaiters = new Map<number, () => void>();
    const waitForReply = async (id: number): Promise<Record<string, unknown>> => {
      const existing = replies.get(id);
      if (existing !== undefined) return existing;
      await new Promise<void>((resolve) => { replyWaiters.set(id, resolve); });
      const reply = replies.get(id);
      if (reply === undefined) throw new Error(`missing connector reply ${String(id)}`);
      return reply;
    };
    const input = new PassThrough();
    const config: ConnectorConfig = {
      ...cfg(async () => {
        markFetchStarted?.();
        await fetchGate;
        return { envelopes: [], nextCursor: null, hasMore: false };
      }),
      mode: "push",
      listenStart: async (_args, emit) => {
        emit({
          surface: "social",
          remote_id: "message-9",
          kind: "live",
          payload: {},
          position: { scope_id: "chat-7", id: 9 },
        });
      },
      listenStop: async ({ subscription_id }) => {
        stopped = subscription_id;
      },
      execute: {
        download_file: async () => {
          downloadsStarted += 1;
          if (downloadsStarted === 2) markTwoDownloadsStarted?.();
          await downloadGate;
          return { ok: true };
        },
        send_message: async () => ({ sent: true }),
      },
      auth: { begin: async () => ({ phase: "code" }) },
      probeAuth: async () => ({ subject: "verified-source" }),
      onNotification: (line) => { notifications.push(JSON.parse(line) as Record<string, unknown>); },
    };
    const running = runConnector(config, input, (line) => {
      const reply = JSON.parse(line) as Record<string, unknown>;
      const id = reply.id;
      if (typeof id !== "number") throw new Error("connector reply lacks numeric id");
      replies.set(id, reply);
      replyWaiters.get(id)?.();
      replyWaiters.delete(id);
    });
    const send = (id: number, name: string, args: Record<string, unknown>): void => {
      input.write(`${JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } })}\n`);
    };

    send(101, "magnis.sync.fetch", { surface: "social" });
    send(102, "magnis.execute", { action: "download_file" });
    send(103, "magnis.execute", { action: "download_file" });
    send(104, "magnis.execute", { action: "download_file" });
    send(105, "magnis.execute", { action: "send_message" });
    send(106, "listen_start", { subscription_id: "sub-1" });
    send(107, "listen_stop", { subscription_id: "sub-1" });

    await Promise.all([fetchStarted, twoDownloadsStarted]);
    expect((await waitForReply(105)).result).toEqual({ sent: true });
    await waitForReply(106);
    await waitForReply(107);
    expect(downloadsStarted).toBe(2);
    expect(stopped).toBe("sub-1");
    expect(notifications).toEqual([
      expect.objectContaining({
        method: "notifications/magnis/envelope",
        params: expect.objectContaining({ position: { scope_id: "chat-7", id: 9 } }),
      }),
    ]);

    releaseFetch?.();
    releaseDownloads?.();
    input.end();
    await running;
    expect(downloadsStarted).toBe(3);
    expect(replies.size).toBe(7);

    const sourceProbe = await handleMessage(
      { id: 108, method: "tools/call", params: { name: "magnis.auth.probe", arguments: {} } },
      config,
    );
    expect(sourceProbe).toMatchObject({ result: { subject: "verified-source" } });
    const sourceAuth = await handleMessage(
      { id: 109, method: "tools/call", params: { name: "magnis.auth.begin", arguments: {} } },
      config,
    );
    expect(sourceAuth).toMatchObject({ error: { code: -32601 } });
    process.argv.push("--auth-mode");
    try {
      const authFetch = await handleMessage(
        { id: 110, method: "tools/call", params: { name: "magnis.sync.fetch", arguments: { surface: "social" } } },
        config,
      );
      expect(authFetch).toMatchObject({ error: { code: -32601 } });
      const authBegin = await handleMessage(
        { id: 111, method: "tools/call", params: { name: "magnis.auth.begin", arguments: {} } },
        config,
      );
      expect(authBegin).toMatchObject({ result: { phase: "code" } });
    } finally {
      process.argv.splice(process.argv.lastIndexOf("--auth-mode"), 1);
    }
  });

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
