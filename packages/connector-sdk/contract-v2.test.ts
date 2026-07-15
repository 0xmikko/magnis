// S1 (sources-typescript-port): the SDK carries the FULL Magnis Sync Profile
// the host speaks — JSON cursors/direction/total/discovered, push
// (listen_start/stop + stamped envelope notifications + the legacy
// magnis.sync.listen alias), auth flows (begin/step/exchange/revoke) and
// magnis.execute. Wire shapes mirror backend/src/sources/mcp/runtime.rs and
// the Rust telegram connector EXACTLY (INV-TS-1).
import { describe, expect, it } from "bun:test";
import { handleMessage, type ConnectorConfig } from "./index";

function base(overrides: Partial<ConnectorConfig> = {}): ConnectorConfig {
  return {
    name: "fx",
    version: "0.0.1",
    surfaces: ["fx"],
    fetch: async (args) => ({
      envelopes: [],
      nextCursor: args.cursor ?? null,
      hasMore: false,
    }),
    ...overrides,
  };
}

describe("S1.1 fetch contract", () => {
  it("tst_sdk_cursor_001: object cursors round-trip verbatim (no numeric coercion)", async () => {
    let seen: unknown;
    const cfg = base({
      fetch: async (args) => {
        seen = args.cursor;
        return { envelopes: [], nextCursor: { page: "abc", ts: 42 }, hasMore: true };
      },
    });
    const reply = await handleMessage(
      {
        id: 1,
        method: "tools/call",
        params: {
          name: "magnis.sync.fetch",
          arguments: { surface: "fx", cursor: { page: "abc", ts: 41 } },
        },
      },
      cfg,
    );
    expect(seen).toEqual({ page: "abc", ts: 41 });
    expect((reply as any).result.nextCursor).toEqual({ page: "abc", ts: 42 });
  });

  it("tst_sdk_cursor_002: direction + total/discovered pass through", async () => {
    let dir: unknown;
    const cfg = base({
      fetch: async (args) => {
        dir = args.direction;
        return { envelopes: [], nextCursor: null, hasMore: false, total: 7, discovered: 3 };
      },
    });
    const reply = await handleMessage(
      {
        id: 2,
        method: "tools/call",
        params: { name: "magnis.sync.fetch", arguments: { surface: "fx", direction: "backward" } },
      },
      cfg,
    );
    expect(dir).toBe("backward");
    expect((reply as any).result.total).toBe(7);
    expect((reply as any).result.discovered).toBe(3);
  });
});

describe("S1.2 push contract", () => {
  it("tst_sdk_push_001: push mode advertises in capabilities; listen_start acks and emits stamped envelopes", async () => {
    const out: string[] = [];
    const cfg = base({
      mode: "push",
      listenStart: async (args, emit) => {
        emit({ surface: "fx", remote_id: "m1", kind: "live", payload: { hello: 1 } });
        void args;
      },
      onNotification: (line) => out.push(line),
    });
    const init = await handleMessage({ id: 1, method: "initialize" }, cfg);
    expect(
      (init as any).result.capabilities.experimental.magnis.sync.mode,
    ).toBe("push");

    const ack = await handleMessage(
      {
        id: 2,
        method: "tools/call",
        params: { name: "listen_start", arguments: { subscription_id: "sub:fx:default" } },
      },
      cfg,
    );
    expect((ack as any).result.subscription_id).toBe("sub:fx:default");
    expect(out.length).toBe(1);
    const notif = JSON.parse(out[0]);
    expect(notif.method).toBe("notifications/magnis/envelope");
    expect(notif.params.subscription_id).toBe("sub:fx:default");
    expect(notif.params.remote_id).toBe("m1");
    expect(notif.params.payload).toEqual({ hello: 1 });
    expect(notif.id).toBeUndefined(); // notification: no id, no reply expected
  });

  it("tst_sdk_push_002: listen_stop dispatches; unknown-subscription emits are dropped", async () => {
    const out: string[] = [];
    let stopped: unknown;
    let emitFn: ((e: any) => void) | undefined;
    const cfg = base({
      mode: "push",
      listenStart: async (_args, emit) => {
        emitFn = emit;
      },
      listenStop: async (args) => {
        stopped = args.subscription_id;
      },
      onNotification: (line) => out.push(line),
    });
    await handleMessage(
      { id: 1, method: "tools/call", params: { name: "listen_start", arguments: { subscription_id: "s1" } } },
      cfg,
    );
    await handleMessage(
      { id: 2, method: "tools/call", params: { name: "listen_stop", arguments: { subscription_id: "s1" } } },
      cfg,
    );
    expect(stopped).toBe("s1");
    // After stop, emits for the dead subscription are refused (no output).
    emitFn?.({ surface: "fx", remote_id: "x", kind: "live", payload: {} });
    expect(out.length).toBe(0);
  });

  it("tst_sdk_push_003: legacy magnis.sync.listen alias acks like the Rust telegram bin", async () => {
    const cfg = base({
      mode: "push",
      listenStart: async () => {},
    });
    const reply = await handleMessage(
      {
        id: 3,
        method: "tools/call",
        params: { name: "magnis.sync.listen", arguments: { _meta: { account_id: "acc7" } } },
      },
      cfg,
    );
    expect((reply as any).result.ok).toBe(true);
    expect((reply as any).result.subscription_id).toBe("sub:acc7");
  });
});

describe("S1.3 auth flows", () => {
  it("tst_sdk_auth_001: begin/step/exchange dispatch with args+meta; unknown auth tool → -32601", async () => {
    const calls: string[] = [];
    const cfg = base({
      auth: {
        begin: async (args, meta) => {
          calls.push(`begin:${String((args as any).flow)}:${String(meta?.k)}`);
          return { url: "https://auth" };
        },
        exchange: async () => ({ minted: { access_token: "t" } }),
      },
    });
    const b = await handleMessage(
      {
        id: 1,
        method: "tools/call",
        params: { name: "magnis.auth.begin", arguments: { flow: "oauth", _meta: { k: "v" } } },
      },
      cfg,
    );
    expect((b as any).result.url).toBe("https://auth");
    expect(calls).toEqual(["begin:oauth:v"]);

    const x = await handleMessage(
      { id: 2, method: "tools/call", params: { name: "magnis.auth.exchange", arguments: {} } },
      cfg,
    );
    expect((x as any).result.minted.access_token).toBe("t");

    const s = await handleMessage(
      { id: 3, method: "tools/call", params: { name: "magnis.auth.step", arguments: {} } },
      cfg,
    );
    expect((s as any).error.code).toBe(-32601); // step not provided by this connector
  });
});

describe("S1.4 magnis.execute", () => {
  it("tst_sdk_exec_001: dispatch by payload.action; unknown action → typed error", async () => {
    const cfg = base({
      execute: {
        send_message: async (args, meta) => ({ sent: (args as any).text, via: meta?.token }),
      },
    });
    const ok = await handleMessage(
      {
        id: 1,
        method: "tools/call",
        params: {
          name: "magnis.execute",
          arguments: { action: "send_message", text: "hi", _meta: { token: "tk" } },
        },
      },
      cfg,
    );
    expect((ok as any).result.sent).toBe("hi");
    expect((ok as any).result.via).toBe("tk");

    const bad = await handleMessage(
      { id: 2, method: "tools/call", params: { name: "magnis.execute", arguments: { action: "nope" } } },
      cfg,
    );
    expect((bad as any).error.code).toBe(-32601);
  });
});
