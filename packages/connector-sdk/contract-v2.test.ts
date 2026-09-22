// The SDK carries the complete Magnis Sync Profile spoken by the host:
// targets/checkpoints/progress, push sessions, auth flows and actions.
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

  it("tst_sdk_cursor_002: standard target, checkpoint and progress pass through", async () => {
    let seen: Record<string, unknown> | undefined;
    const cfg = base({
      fetch: async (args) => {
        seen = args as unknown as Record<string, unknown>;
        return {
          envelopes: [],
          progress: {
            kind: "completeTarget" as const,
            forwardCheckpoint: { kind: "replace" as const, value: 91 },
          },
          traversed: { "chat-7": [42, 91] as [number, number] },
          total: 7,
          discovered: 3,
        };
      },
    });
    const reply = await handleMessage(
      {
        id: 2,
        method: "tools/call",
        params: {
          name: "magnis.sync.fetch",
          arguments: {
            surface: "fx",
            direction: "backward",
            scope_id: "chat-7",
            target: { kind: "gap", start: 42, end: 91 },
            forward_checkpoint: 41,
          },
        },
      },
      cfg,
    );
    expect(seen).toMatchObject({
      direction: "backward",
      scope_id: "chat-7",
      target: { kind: "gap", start: 42, end: 91 },
      forward_checkpoint: 41,
    });
    expect((reply as any).result.progress).toEqual({
      kind: "completeTarget",
      forwardCheckpoint: { kind: "replace", value: 91 },
    });
    expect((reply as any).result.traversed).toEqual({ "chat-7": [42, 91] });
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
        emit({
          surface: "fx",
          remote_id: "m1",
          kind: "live",
          payload: { hello: 1 },
          position: { scope_id: "chat-7", id: 9 },
        });
        void args;
      },
      onNotification: (line) => out.push(line),
    });
    const init = await handleMessage({ id: 1, method: "initialize" }, cfg);
    expect(
      (init as any).result.capabilities.experimental.magnis.sync.mode,
    ).toBe("push");
    expect(
      (init as any).result.capabilities.experimental.magnis.sync.interval_secs,
    ).toBeUndefined();

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
    const out0 = out[0];
    if (out0 === undefined) throw new Error("contract-v2: missing notification 0");
    const notif = JSON.parse(out0);
    expect(notif.method).toBe("notifications/magnis/envelope");
    expect(notif.params.subscription_id).toBe("sub:fx:default");
    expect(notif.params.remote_id).toBe("m1");
    expect(notif.params.payload).toEqual({ hello: 1 });
    expect(notif.params.position).toEqual({ scope_id: "chat-7", id: 9 });
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

  it("tst_sdk_push_003: subscriptions require ids and the legacy alias is absent", async () => {
    const cfg = base({
      mode: "push",
      listenStart: async () => {},
      listenStop: async () => {},
    });
    const missingStart = await handleMessage(
      {
        id: 3,
        method: "tools/call",
        params: { name: "listen_start", arguments: {} },
      },
      cfg,
    );
    expect((missingStart as any).error.code).toBe(-32602);

    const missingStop = await handleMessage(
      {
        id: 4,
        method: "tools/call",
        params: { name: "listen_stop", arguments: {} },
      },
      cfg,
    );
    expect((missingStop as any).error.code).toBe(-32602);

    const legacy = await handleMessage(
      {
        id: 5,
        method: "tools/call",
        params: { name: "magnis.sync.listen", arguments: { _meta: { account_id: "acc7" } } },
      },
      cfg,
    );
    expect((legacy as any).error.code).toBe(-32601);
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
    const authModeArg = process.argv.push("--auth-mode") - 1;
    try {
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
    } finally {
      process.argv.splice(authModeArg, 1);
    }
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

describe("dataset actions", () => {
  it("tst_sdk_dataset_001 dispatches opaque invocation metadata and returns live envelopes", async () => {
    const cfg = base({
      datasetActions: {
        emit_message: async (args) => ({
          envelopes: [
            {
              surface: "fx",
              remote_id: `dataset:${args.invocation_id}:0`,
              kind: "live",
              payload: {
                ...args.payload,
                mailbox: args.settings.mailbox,
                action_time: args.action_time,
              },
            },
          ],
        }),
      },
    });
    const reply = await handleMessage(
      {
        id: 30,
        method: "tools/call",
        params: {
          name: "magnis.dataset.invoke",
          arguments: {
            action: "emit_message",
            invocation_id: "inv-1",
            action_time: "2026-08-05T10:00:00Z",
            settings: { mailbox: "primary" },
            payload: { text: "hello" },
          },
        },
      },
      cfg,
    );
    expect(reply).toMatchObject({
      result: {
        envelopes: [
          {
            surface: "fx",
            remote_id: "dataset:inv-1:0",
            kind: "live",
            payload: {
              text: "hello",
              mailbox: "primary",
              action_time: "2026-08-05T10:00:00Z",
            },
          },
        ],
      },
    });
  });

  it("tst_sdk_dataset_002 rejects undeclared and malformed invocations", async () => {
    const cfg = base({ datasetActions: { known: async () => ({ envelopes: [] }) } });
    const unknown = await handleMessage(
      {
        id: 31,
        method: "tools/call",
        params: {
          name: "magnis.dataset.invoke",
          arguments: {
            action: "missing",
            invocation_id: "i",
            action_time: "t",
            settings: {},
            payload: {},
          },
        },
      },
      cfg,
    );
    expect(unknown).toMatchObject({ error: { code: -32601 } });
    const malformed = await handleMessage(
      {
        id: 32,
        method: "tools/call",
        params: { name: "magnis.dataset.invoke", arguments: { action: "known" } },
      },
      cfg,
    );
    expect(malformed).toMatchObject({ error: { code: -32602 } });
  });
});
