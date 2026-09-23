import { PassThrough } from "node:stream";
import { expect, spyOn, test } from "bun:test";
import { runConnector } from "@magnis/connector-sdk";
import bigInt from "big-integer";
import { Api } from "telegram";

import * as live from "./live";
import { buildConnectorConfig, type ConnectorDeps } from "./connector";
import { resetAuthFlow } from "./auth";
import { SubscriptionRegistry } from "./subscriptions";
import { LiveDialogPager } from "./live";
import { MTPROTO_REQUEST_TIMEOUT_MS, SOURCE_PAGE_BUDGET_MS, MtprotoTimeoutError, floodWaitSecs } from "./client";
import { AccountAdmission, type AdmissionEvent } from "./request-admission";
import { fetch, runBootstrap } from "./surfaces/telegram/commands";
import { liveUpdatePushes } from "./subscriptions";
import { caseEvidence, createTransport, setupConfig, VirtualClock, type Transmission } from "./testing/mtproto-transport";

function outcome(promise: Promise<unknown>): Promise<{ kind: "resolved" | "rejected"; value: unknown }> {
  return promise.then((value) => ({ kind: "resolved", value }), (value: unknown) => ({ kind: "rejected", value }));
}

function stateResponse(): Api.updates.State {
  return new Api.updates.State({ pts: 1, qts: 1, date: 1, seq: 1, unreadCount: 0 });
}

function envelopes(result: Record<string, unknown>): Record<string, unknown>[] {
  if (!Array.isArray(result.envelopes)) throw new Error("Source did not emit envelopes");
  return result.envelopes as Record<string, unknown>[];
}

function fixtureChat(id: number): Api.Chat {
  return new Api.Chat({ id: bigInt(id), title: `fixture-${String(id)}`, photo: new Api.ChatPhotoEmpty(), participantsCount: 2, date: 1700000000, version: 1 });
}

function fixtureMessage(chatId: number, id: number): Api.Message {
  return new Api.Message({ id, peerId: new Api.PeerChat({ chatId: bigInt(chatId) }), date: 1700000000 + id, message: `fixture-${String(chatId)}-${String(id)}`, out: false, pinned: id === 1 });
}

function commandStream(overrides: ConnectorDeps & { authMode?: boolean } = {}) {
  const input = new PassThrough();
  const records: Record<string, unknown>[] = [];
  const replies = new Map<number, Record<string, unknown>>();
  const waiting = new Map<number, (reply: Record<string, unknown>) => void>();
  const registry = new SubscriptionRegistry();
  const write = (line: string): void => {
    const record = JSON.parse(line) as Record<string, unknown>;
    records.push(record);
    if (typeof record.id === "number") {
      replies.set(record.id, record);
      waiting.get(record.id)?.(record);
      waiting.delete(record.id);
    }
  };
  const authModeArg = overrides.authMode === true ? process.argv.push("--auth-mode") - 1 : -1;
  const running = runConnector(
    { ...buildConnectorConfig({ ...overrides, registry }), onNotification: write },
    input,
    write,
  );
  return {
    input, records, replies, registry,
    send: (id: number, name: string, args: Record<string, unknown>): void => {
      input.write(JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }) + "\n");
    },
    reply: (id: number): Promise<Record<string, unknown>> => {
      const existing = replies.get(id);
      return existing ? Promise.resolve(existing) : new Promise((resolve) => { waiting.set(id, resolve); });
    },
    finish: async (): Promise<void> => {
      input.end();
      try { await running; }
      finally { if (authModeArg >= 0) process.argv.splice(authModeArg, 1); }
    },
  };
}

const unusedPager = { dialogPage: async () => ({ dialogs: [], next_offset: null, total: null }) };
const gapArgs = (chatId: number, start: number, end: number, total = end) => ({
  surface: "telegram",
  direction: "backward" as const,
  scope_id: String(chatId),
  target: { kind: "gap" as const, start, end },
  forward_checkpoint: {
    takeout: { id: "1", phase: "download", ranges: [{ min_id: start, max_id: end }],
      range_index: 1, range_started: false, dialog_offset: null, pinned_count: 0,
      publish_index: 1, download_index: 1 },
    chats: { [String(chatId)]: { chat: { chat_id: chatId, title: `Chat ${String(chatId)}`, chat_type: "private",
      is_pinned: false, pin_order: 0, unread_count: 0, unread_mark: false,
      read_inbox_max_id: 0, read_outbox_max_id: 0, unread_mentions_count: 0,
      top_message: end, message_count: end }, peer: { ty: "chat", id: chatId },
      message_count: total, ranges: [0], last_msg_id: end } },
  },
});

function providerRequest(sent: Transmission): unknown {
  let request: unknown = sent.state.request;
  if (request instanceof Api.InvokeWithTakeout) request = request.query;
  if (request instanceof Api.InvokeWithMessagesRange) request = request.query;
  return request;
}

function flushCommands(): Promise<void> {
  return new Promise((resolve) => { setImmediate(resolve); });
}

/** @test-id: tst_src_tgflood_005
 * @scenario: scn_tgflood_007
 * @covers: actual Source dispatcher, registry and guarded SDK setup
 * @deterministic: yes
 * @fixtures: real SessionPool and SDK; fake connection and monotonic clock
 */
test("tst_src_tgflood_005 the Source command loop preserves runtime flood replies", async () => {
  const evidence = caseEvidence("tst_src_tgflood_005", "real-stdio");
  const clock = new VirtualClock();
  const setupEvents: AdmissionEvent[] = [];
  const options: ConstructorParameters<typeof live.SessionPool>[0] = { clock, diagnostics: (event) => { setupEvents.push(event); } };
  const sessions = new live.SessionPool(options);
  const guard = sessions.admissionFor("fixture-stdio");
  const choosePool = spyOn(live, "pool").mockReturnValue(sessions);
  const stream = commandStream();
  const f = await createTransport(clock, guard, true, async (transport, session) => {
    options.transport = transport;
    stream.send(1, "listen_start", {
      subscription_id: "fixture-listen", _meta: { account_id: "fixture-stdio", api_id: 1, api_hash: "fixture-only", session },
    });
    return stream.reply(1);
  });
  const previousSecret = process.env.TGFLOOD_TEST_DIAGNOSTIC_SECRET;
  process.env.TGFLOOD_TEST_DIAGNOSTIC_SECRET = "fixture-env-secret";
  try {
    await f.reply(await f.application(0), new Api.RpcError({ errorCode: 420, errorMessage: "FLOOD_WAIT_4" }));
    await f.connected;
    expect(await stream.reply(1)).toMatchObject({ id: 1, error: { code: -32002, data: { retry_after: 4 } } });
    expect(f.writes).toHaveLength(1);
    stream.send(2, "listen_start", { subscription_id: "bad-meta" });
    expect(await stream.reply(2)).toMatchObject({ error: { code: -32602 } });
    expect(setupEvents.some((event) => event.origin === "remoteFlood")).toBe(true);
    expect(JSON.stringify(setupEvents)).not.toContain("fixture-env-secret");
  } finally {
    if (previousSecret === undefined) delete process.env.TGFLOOD_TEST_DIAGNOSTIC_SECRET;
    else process.env.TGFLOOD_TEST_DIAGNOSTIC_SECRET = previousSecret;
    stream.registry.stop("fixture-listen");
    await stream.finish();
    await f.close();
    choosePool.mockRestore();
  }

  const runningClock = new VirtualClock();
  const diagnostics: AdmissionEvent[] = [];
  const runningOptions: ConstructorParameters<typeof live.SessionPool>[0] = {
    clock: runningClock, diagnostics: (event) => { diagnostics.push(event); },
  };
  const runningPool = new live.SessionPool(runningOptions);
  const runningGuard = runningPool.admissionFor("fixture-stdio-main");
  const poolFactory = spyOn(live, "pool").mockReturnValue(runningPool);
  const io = commandStream();
  let meta: Record<string, unknown> = {};
  const actual = await createTransport(runningClock, runningGuard, true, (transport, session) => {
    runningOptions.transport = transport;
    meta = { account_id: "fixture-stdio-main", api_id: 1, api_hash: "fixture-only", session };
    io.send(10, "listen_start", { subscription_id: "active", _meta: meta });
    return io.reply(10);
  });
  try {
    await actual.reply(await actual.application(0), setupConfig());
    await actual.connected;
    expect(await io.reply(10)).toMatchObject({ result: { ok: true } });
    const self = actual.client.getMe(true);
    const user = new Api.User({ id: bigInt(999), self: true, firstName: "fixture" });
    await actual.reply(await actual.application(1), { getBytes: (): Buffer => {
      const header = Buffer.alloc(8); header.writeUInt32LE(0x1cb5c415); header.writeInt32LE(1, 4);
      return Buffer.concat([header, user.getBytes()]);
    } });
    await self;
    let index = 2;
    let id = 20;
    const counts = new Map([[101, 120], [102, 70], [103, 5]]);
    const answer = async (): Promise<void> => {
      const sent = await actual.application(index++);
      const request = providerRequest(sent);
      if (request instanceof Api.messages.GetDialogs) {
        const dialogs = [...counts].map(([chat, count], i) => new Api.Dialog({ pinned: i < 2,
          peer: new Api.PeerChat({ chatId: bigInt(chat) }), topMessage: count, readInboxMaxId: 0,
          readOutboxMaxId: 0, unreadCount: 0, unreadMentionsCount: 0, unreadReactionsCount: 0, notifySettings: new Api.PeerNotifySettings({}) }));
        await actual.reply(sent, new Api.messages.Dialogs({ dialogs, chats: [...counts.keys()].map(fixtureChat), users: [],
          messages: [...counts].map(([chat, count]) => fixtureMessage(chat, count)) }));
      } else if (request instanceof Api.messages.GetHistory && request.peer instanceof Api.InputPeerChat) {
        const chat = request.peer.chatId.toJSNumber();
        const count = counts.get(chat);
        if (count === undefined) throw new Error("Unexpected Source history peer");
        // The bootstrap hydration and bounded fetch both use provider pages.
        expect(request.limit).toBeLessThanOrEqual(100);
        const messages = Array.from({ length: count }, (_, i) => fixtureMessage(chat, count - i))
          .filter((message) => request.offsetId === 0 || message.id < request.offsetId).slice(0, request.limit);
        await actual.reply(sent, new Api.messages.MessagesSlice({ count, messages, chats: [fixtureChat(chat)], users: [] }));
      } else throw new Error(`Unexpected Source request ${sent.method}`);
    };
    io.send(id, "magnis.sync.fetch", { ...gapArgs(101, 1, 70), _meta: meta });
    const failed = await actual.application(index++);
    expect(providerRequest(failed)).toBeInstanceOf(Api.messages.GetHistory);
    await actual.reply(failed, new Api.RpcError({ errorCode: 420, errorMessage: "FLOOD_WAIT_4" }));
    expect(await io.reply(id++)).toMatchObject({ error: { code: -32002, data: { retry_after: 4 } } });
    expect(io.replies.get(20)).not.toHaveProperty("result");
    const heldAt = actual.writes.length;
    io.send(id, "magnis.sync.fetch", { ...gapArgs(101, 1, 70), _meta: meta });
    expect(await io.reply(id++)).toMatchObject({ error: { code: -32002 } });
    io.send(id, "magnis.execute", { action: "download_file", source_ref: { chat_id: 101, message_id: 1 },
      dest: ".tmp/code-production/telegram-flood-safety/D1-S5/never-written.bin", _meta: meta });
    expect(await io.reply(id++)).toMatchObject({ error: { code: -32002 } });
    await actual.incoming(new Api.Updates({ date: 1700000122, seq: 1, users: [], chats: [fixtureChat(101)], updates: [
      new Api.UpdateNewMessage({ message: fixtureMessage(101, 121), pts: 1, ptsCount: 1 }),
      new Api.UpdateNewMessage({ message: fixtureMessage(101, 122), pts: 2, ptsCount: 1 }),
    ] }));
    await flushCommands();
    const pushes = io.records.filter((record) => record.method === "notifications/magnis/envelope");
    expect(pushes).toHaveLength(2);
    expect(actual.writes).toHaveLength(heldAt);
    expect(runningGuard.remoteFloods).toBe(1);
    runningClock.advance(4000);
    const emitted: Record<string, unknown>[] = [];
    for (const [chat, count] of counts) {
      io.send(id, "magnis.sync.fetch", { ...gapArgs(chat, 1, count), _meta: meta });
      const providerPages = Math.ceil(count / 100);
      for (let page = 0; page < providerPages; page++) await answer();
      const page = (await io.reply(id++)).result as Record<string, unknown>;
      emitted.push(...envelopes(page));
      expect(page.progress).toMatchObject({ kind: "completeTarget" });
      expect(page.traversed).toEqual({ [String(chat)]: [1, count] });
    }
    const identities = new Set(emitted.map((item) => item.remote_id).filter((value): value is string => typeof value === "string" && value.startsWith("tg:msg:")));
    for (const push of pushes) identities.add(String((push.params as Record<string, unknown>).remote_id));
    const expected = [...counts].flatMap(([chat, count]) => Array.from({ length: count }, (_, i) => `tg:msg:${String(chat)}:${String(i + 1)}`));
    expect([...identities].sort()).toEqual([...expected, "tg:msg:101:121", "tg:msg:101:122"].sort());
    expect(identities.size).toBe(197);
    const start = id;
    for (let i = 0; i < 8; i++) {
      io.send(id++, "magnis.sync.fetch", { ...gapArgs(101, 1, 70), _meta: meta });
    }
    runningClock.advance(4000);
    const blocked = await actual.application(index++);
    await flushCommands();
    expect(runningGuard.queued).toBe(7);
    io.send(id, "listen_stop", { subscription_id: "active" });
    await flushCommands();
    // Stop must have replied while all eight work commands still own their slots.
    expect(io.replies.get(id++)).toMatchObject({ result: { ok: true } });
    expect(io.replies.has(start)).toBe(false);
    await actual.reply(blocked, new Api.RpcError({ errorCode: 420, errorMessage: "FLOOD_WAIT_4" }));
    for (let i = 0; i < 8; i++) expect(await io.reply(start + i)).toMatchObject({ error: { code: -32002 } });
    expect(actual.maximumInFlight()).toBe(1);
    const captured = JSON.stringify(diagnostics);
    expect(diagnostics.length).toBeGreaterThan(0);
    for (const secret of [String(meta.session), "fixture-only", "fixture-101-121", "fixture-phone"]) expect(captured).not.toContain(secret);
    expect(actual.writes).toHaveLength(8);
    evidence(actual, runningClock, { expectedTransmissions: 8, expectedMessages: 197, actualMessages: identities.size,
      identities: ["101:1..122", "102:1..70", "103:1..5"], failedFetchResults: 0, stoppedWithOccupiedSlots: 8 });
  } finally {
    io.registry.stop("active");
    await actual.close();
    await io.finish();
    poolFactory.mockRestore();
  }

  for (const phase of ["begin", "step"] as const) {
    const evidence = caseEvidence("tst_src_tgflood_005", `auth-${phase}`);
    const authClock = new VirtualClock();
    const authEvents: AdmissionEvent[] = [];
    const authGuard = new AccountAdmission(`fixture-auth-${phase}`, authClock, (event) => { authEvents.push(event); });
    const transportOptions: NonNullable<Parameters<typeof live.createAuthClientFactory>[1]> = {};
    const factory = live.createAuthClientFactory(authGuard, transportOptions);
    const authIo = commandStream({ authMode: true, authFactory: factory });
    const authTransport = await createTransport(authClock, authGuard, true, (transport) => {
      Object.assign(transportOptions, transport);
      authIo.send(1, "magnis.auth.begin", { _meta: { api_id: 1, api_hash: "fixture-only", phone: "+10000000000" } });
      return authIo.reply(1);
    });
    try {
      let sent = await authTransport.application(0);
      if (phase === "step") {
        await authTransport.reply(sent, setupConfig());
        sent = await authTransport.application(1);
        expect(sent.method).toBe("auth.SendCode");
        await authTransport.reply(sent, new Api.auth.SentCode({ type: new Api.auth.SentCodeTypeApp({ length: 5 }), phoneCodeHash: "fixture-code-hash" }));
        expect(await authIo.reply(1)).toMatchObject({ result: { state: "code_sent" } });
        authIo.send(2, "magnis.auth.step", { _meta: { code: "12345" } });
        sent = await authTransport.application(2);
        expect(sent.method).toBe("auth.SignIn");
      }
      await authTransport.reply(sent, new Api.RpcError({ errorCode: 420, errorMessage: "FLOOD_WAIT_4" }));
      expect(await authIo.reply(phase === "begin" ? 1 : 2)).toMatchObject({ error: { code: -32002, data: { retry_after: 4 } } });
      authIo.send(3, "magnis.auth.begin", {});
      expect(await authIo.reply(3)).toMatchObject({ error: { code: -32000 } });
      expect(authGuard.remoteFloods).toBe(1);
      expect(authTransport.writes).toHaveLength(phase === "begin" ? 1 : 3);
      const captured = JSON.stringify(authEvents);
      for (const secret of ["+10000000000", "12345", "fixture-only", "fixture-code-hash"]) expect(captured).not.toContain(secret);
      evidence(authTransport, authClock, { expectedTransmissions: phase === "begin" ? 1 : 3, wireError: -32002, retryAfter: 4 });
    } finally {
      await authTransport.close();
      await authIo.finish();
      resetAuthFlow();
    }
  }

  // The host imports the bundle: initialize/EOF must work without import.meta.main.
  const child = Bun.spawn([process.execPath, "-e", "await import('./plugins/sources/telegram/src/main.ts')"], {
    cwd: new URL("../../../..", import.meta.url).pathname,
    stdin: "pipe", stdout: "pipe", stderr: "pipe",
    env: {},
  });
  try {
    child.stdin.write("null\n" + JSON.stringify({ jsonrpc: "2.0", id: 91, method: "initialize" }) + "\n");
    child.stdin.end();
    const output = await new Response(child.stdout).text();
    expect(await child.exited).toBe(0);
    expect(output.trim()).not.toBe("");
    const records = output.trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ id: 91, result: { serverInfo: { name: "magnis-telegram" } } });
    expect(await new Response(child.stderr).text()).toBe("");
  } finally { child.kill(); }
});

const ORIGINS = [
  { name: "messages.GetDialogs", request: () => new Api.messages.GetDialogs({ offsetDate: 0, offsetId: 0, offsetPeer: new Api.InputPeerEmpty(), limit: 50, hash: bigInt.zero }) },
  { name: "messages.GetHistory", request: () => new Api.messages.GetHistory({ peer: new Api.InputPeerChat({ chatId: bigInt(1) }), offsetId: 0, offsetDate: 0, addOffset: 0, limit: 50, maxId: 0, minId: 0, hash: bigInt.zero }) },
  { name: "updates.GetState", request: () => new Api.updates.GetState() },
  { name: "upload.GetFile", request: () => new Api.upload.GetFile({ location: new Api.InputDocumentFileLocation({ id: bigInt(1), accessHash: bigInt(2), fileReference: Buffer.alloc(0), thumbSize: "" }), offset: bigInt.zero, limit: 4096 }) },
  { name: "messages.SendMessage", request: () => new Api.messages.SendMessage({ peer: new Api.InputPeerChat({ chatId: bigInt(1) }), message: "synthetic action", randomId: bigInt(9) }) },
  { name: "auth.SendCode", request: () => new Api.auth.SendCode({ phoneNumber: "fixture-only", apiId: 1, apiHash: "fixture-only", settings: new Api.CodeSettings({}) }) },
] as const;

/** @test-id: tst_src_tgflood_003
 * @scenario: scn_tgflood_004
 * @covers: shared resumable peer discovery, isolated cancellation and history recovery
 * @deterministic: yes
 * @fixtures: real Source/SDK with serialized dialog/history/update replies and fake I/O
 */
test("tst_src_tgflood_003 peer misses share a continuation through floods and cancellation", async () => {
  const evidence = caseEvidence("tst_src_tgflood_003", "discovery-recovery");
  const nativeTimeout = globalThis.setTimeout;
  const clock = new VirtualClock();
  const f = await createTransport(clock);
  let wireIndex = 0;
  const dialogResponse = (ids: number[], slice: boolean): Api.messages.Dialogs | Api.messages.DialogsSlice => {
    const data = { dialogs: ids.map((id) => new Api.Dialog({ pinned: id <= 2,
      peer: new Api.PeerChat({ chatId: bigInt(id) }), topMessage: 1000 + id,
      readInboxMaxId: 0, readOutboxMaxId: 0, unreadCount: 0, unreadMentionsCount: 0,
      unreadReactionsCount: 0, notifySettings: new Api.PeerNotifySettings({}) })),
      messages: ids.map((id) => fixtureMessage(id, 1000 + id)), chats: ids.map(fixtureChat), users: [] };
    return slice ? new Api.messages.DialogsSlice({ ...data, count: 200 }) : new Api.messages.Dialogs(data);
  };
  try {
    const a = outcome(f.tg.resolvePeer(201));
    const b = outcome(f.tg.resolvePeer(202));
    const first = await f.application(wireIndex++);
    if (!(first.state.request instanceof Api.messages.GetDialogs)) throw new Error("Expected real discovery request");
    expect(first.state.request.offsetId).toBe(0);
    const firstIds = Array.from({ length: first.state.request.limit }, (_, index) => index + 1);
    const lastId = firstIds.at(-1);
    if (lastId === undefined) throw new Error("Empty discovery fixture");
    await f.reply(first, dialogResponse(firstIds, true));
    const failedPage = await f.application(wireIndex++);
    if (!(failedPage.state.request instanceof Api.messages.GetDialogs)) throw new Error("Discovery must not hydrate history");
    expect(failedPage.state.request.offsetId).toBe(1000 + lastId);
    expect(failedPage.state.request.excludePinned).toBe(true);
    const continuation = failedPage.state.request.getBytes();
    await f.reply(failedPage, new Api.RpcError({ errorCode: 420, errorMessage: "FLOOD_WAIT_4" }));
    expect((await a).value).toMatchObject({ code: 420, seconds: 4 });
    expect((await b).value).toMatchObject({ code: 420, seconds: 4 });
    const held = await outcome(f.tg.resolvePeer(201));
    expect(held.value).toMatchObject({ code: 420, seconds: 4 });
    expect(f.writes).toHaveLength(wireIndex);
    expect(await f.tg.resolvePeer(1)).toMatchObject({ id: bigInt(1) });
    expect(await f.tg.resolvePeer(2)).toMatchObject({ id: bigInt(2) });
    clock.advance(4000);
    const cancel = new AbortController();
    const cancelled = outcome(f.tg.resolvePeer(201, cancel.signal));
    const surviving = outcome(f.tg.resolvePeer(202));
    const resumed = await f.application(wireIndex++);
    expect(resumed.state.request.getBytes()).toEqual(continuation);
    cancel.abort(new Error("fixture cancelled one lookup"));
    expect((await cancelled).value).toMatchObject({ message: "fixture cancelled one lookup" });
    await f.reply(resumed, dialogResponse([201, 202, 103], false));
    expect((await surviving).value).toMatchObject({ id: bigInt(202) });
    expect(await f.tg.resolvePeer(201)).toMatchObject({ id: bigInt(201) });
    expect((await outcome(f.tg.resolvePeer(9999))).value).toMatchObject({ message: "chat 9999 not found in any dialog" });
    expect(f.writes).toHaveLength(wireIndex);
    expect(f.writes.filter((sent) => sent.state.request instanceof Api.messages.GetDialogs && sent.state.request.offsetId === 0)).toHaveLength(1);
    expect(f.admission.remoteFloods).toBe(1);

    const self = new Api.User({ id: bigInt(999), accessHash: bigInt(3), self: true, firstName: "Fixture" });
    const me = f.client.getMe(true);
    await f.reply(await f.application(wireIndex++), { getBytes: (): Buffer => {
      const header = Buffer.alloc(8); header.writeUInt32LE(0x1cb5c415); header.writeUInt32LE(1, 4);
      return Buffer.concat([header, self.getBytes()]);
    } });
    await me;
    let delivered: (() => void) | undefined;
    const live = new Promise<void>((resolve) => { delivered = resolve; });
    f.tg.addLiveHandler(() => { delivered?.(); });
    await f.incoming(new Api.Updates({ updates: [new Api.UpdateNewMessage({ message: fixtureMessage(888, 1), pts: 1, ptsCount: 1 })],
      chats: [fixtureChat(888)], users: [self], date: 1700000001, seq: 1 }));
    await live;
    expect(await f.tg.resolvePeer(888)).toMatchObject({ id: bigInt(888) });
    expect(f.writes).toHaveLength(wireIndex);

    let expireHistory: (() => void) | undefined;
    let historyTimeoutMs = 0;
    const timeoutHost: { setTimeout(callback: (...args: unknown[]) => void, delay?: number, ...args: unknown[]): ReturnType<typeof setTimeout> } = globalThis;
    const timer = spyOn(timeoutHost, "setTimeout").mockImplementation((callback, delay, ...args) => {
      const handle = nativeTimeout(callback, delay, ...args);
      if (delay !== undefined && delay > 0 && delay <= MTPROTO_REQUEST_TIMEOUT_MS) {
        clearTimeout(handle);
        historyTimeoutMs = delay;
        expireHistory = () => callback(...args);
      }
      return handle;
    });
    try {
      const timedOut = outcome(fetch(f.tg, unusedPager, "fixture-A", gapArgs(201, 1, 120)));
      const uncertain = await f.application(wireIndex++);
      expect(historyTimeoutMs).toBe(SOURCE_PAGE_BUDGET_MS);
      if (!expireHistory) throw new Error("History timeout was not armed");
      expireHistory();
      expect((await timedOut).value).toBeInstanceOf(MtprotoTimeoutError);
      expect((await timedOut).value).not.toHaveProperty("envelopes");
      expect((await timedOut).value).not.toHaveProperty("hasMore");
      // A late SDK success settles its slot, never the failed Source receipt.
      await f.reply(uncertain, new Api.messages.Messages({ messages: [fixtureMessage(201, 120)], chats: [fixtureChat(201)], users: [] }));

      const cursor = { chats: { "1": { last_msg_id: 7 } }, pinned_count: 2 };
      historyTimeoutMs = 0;
      const hydration = outcome(runBootstrap(cursor, new LiveDialogPager(f.tg, "fixture-A")));
      await f.reply(await f.application(wireIndex++), dialogResponse([201], false));
      const snapshot = await f.application(wireIndex++);
      expect(snapshot.method).toBe("messages.GetHistory");
      expect(historyTimeoutMs).toBe(MTPROTO_REQUEST_TIMEOUT_MS);
      if (!expireHistory) throw new Error("Hydration timeout was not armed");
      expireHistory();
      const failedSnapshot = await hydration;
      expect(failedSnapshot.kind).toBe("rejected");
      expect(failedSnapshot.value).toBeInstanceOf(MtprotoTimeoutError);
      expect(failedSnapshot.value).not.toHaveProperty("envelopes");
      expect(failedSnapshot.value).not.toHaveProperty("cursor");
      expect(cursor).toEqual({ chats: { "1": { last_msg_id: 7 } }, pinned_count: 2 });
      await f.reply(snapshot, new Api.messages.Messages({ messages: [fixtureMessage(201, 120)], chats: [fixtureChat(201)], users: [] }));
    } finally { timer.mockRestore(); }

    const counts = new Map([[201, 120], [202, 70], [103, 5]]);
    const emitted: string[] = [];
    for (const [chat, count] of counts) {
      const reading = fetch(f.tg, unusedPager, "fixture-A", gapArgs(chat, 1, count));
      let before = count + 1;
      for (;;) {
        const sent = await f.application(wireIndex++);
        const request = providerRequest(sent);
        if (!(request instanceof Api.messages.GetHistory)) throw new Error("Cached peer caused another discovery scan");
        expect(request.offsetId).toBe(before);
        expect(request.limit).toBe(100);
        const messages = Array.from({ length: count }, (_, index) => count - index)
          .filter((id) => before === 0 || id < before).slice(0, 100).map((id) => fixtureMessage(chat, id));
        await f.reply(sent, new Api.messages.MessagesSlice({ count, messages, chats: [fixtureChat(chat)], users: [] }));
        const last = messages.at(-1);
        if (last === undefined || last.id === 1) break;
        before = last.id;
      }
      const page = await reading;
      const batch = envelopes(page);
      emitted.push(...batch.map((item) => String(item.remote_id)));
      expect(batch).toHaveLength(count);
      expect(page.progress).toMatchObject({ kind: "completeTarget" });
      expect(page.traversed).toEqual({ [String(chat)]: [1, count] });
    }
    expect(emitted).toHaveLength(195);
    expect(new Set(emitted)).toEqual(new Set([...counts].flatMap(([chat, count]) =>
      Array.from({ length: count }, (_, index) => `tg:msg:${String(chat)}:${String(index + 1)}`))));
    // Three discovery requests plus the independently requested snapshot page.
    expect(f.writes.filter((sent) => sent.method === "messages.GetDialogs")).toHaveLength(4);
    expect(f.maximumInFlight()).toBe(1);
    expect(f.writes).toHaveLength(11);
    evidence(f, clock, { expectedTransmissions: 11, expectedMessages: 195, actualMessages: emitted.length,
      identities: ["201:1..120", "202:1..70", "103:1..5"], timeoutResults: 0, discoveryStartPages: 1 });
  } finally { await f.close(); }
});

/** @test-id: tst_src_tgflood_001
 * @scenario: scn_tgflood_001
 * @covers: account-wide admission across real SDK application requests
 * @deterministic: yes
 * @fixtures: real SDK, fake MTProto I/O and monotonic clock
 */
test("tst_src_tgflood_001 healthy requests use a free application slot without deliberate delay", async () => {
  const evidence = caseEvidence("tst_src_tgflood_001", "history-live-media");
  const clock = new VirtualClock();
  const f = await createTransport(clock, undefined, true);
  try {
    const setup = await f.application(0);
    expect(setup.method).toBe("InvokeWithLayer");
    await f.reply(setup, setupConfig());
    expect(await f.connected).toBe(true);
    const first = outcome(f.client.invoke(new Api.updates.GetState()));
    const second = outcome(f.client.invoke(new Api.updates.GetState()));
    await f.ping();
    expect(f.writes).toHaveLength(2);
    const sent = await f.application(1);
    expect(f.writes).toHaveLength(2);
    const response = new Api.updates.State({ pts: 1, qts: 1, date: 1, seq: 1, unreadCount: 0 });
    await f.reply(sent, response);
    expect((await first).kind).toBe("resolved");
    const next = await f.application(2);
    expect(next.at - sent.at).toBe(0);
    await f.reply(next, response);
    expect((await second).kind).toBe("resolved");
    const counts = new Map([[101, 120], [102, 70], [103, 5]]);
    const chats = [...counts.keys()].map(fixtureChat);
    const histories = new Map([...counts].map(([chat, count]) => [chat, Array.from({ length: count }, (_, i) => fixtureMessage(chat, count - i))]));
    let wireIndex = f.writes.length;
    const answer = async (): Promise<void> => {
      const sent = await f.application(wireIndex++);
      const request = providerRequest(sent);
      if (request instanceof Api.messages.GetDialogs) {
        const dialogs = [...counts].map(([chat, count], i) => new Api.Dialog({ pinned: i < 2,
          peer: new Api.PeerChat({ chatId: bigInt(chat) }), topMessage: count, readInboxMaxId: 0,
          readOutboxMaxId: 0, unreadCount: 0, unreadMentionsCount: 0, unreadReactionsCount: 0, notifySettings: new Api.PeerNotifySettings({}) }));
        await f.reply(sent, new Api.messages.Dialogs({ dialogs, messages: [...counts].map(([id, count]) => fixtureMessage(id, count)), chats, users: [] }));
      } else if (request instanceof Api.messages.GetHistory && request.peer instanceof Api.InputPeerChat) {
        const id = request.peer.chatId.toJSNumber();
        const history = histories.get(id);
        const count = counts.get(id);
        if (!history || count === undefined) throw new Error("Unexpected history peer");
        // Bootstrap hydration and bounded fetch are both served up to the request.
        expect(request.limit).toBeLessThanOrEqual(100);
        const page = history.filter((message) => request.offsetId === 0 || message.id < request.offsetId).slice(0, request.limit);
        await f.reply(sent, new Api.messages.MessagesSlice({ count, messages: page, chats: [fixtureChat(id)], users: [] }));
      } else throw new Error(`Unexpected history request ${sent.method}`);
    };
    const bootstrap = runBootstrap(null, new LiveDialogPager(f.tg, "fixture-A"));
    for (let i = 0; i < 4; i++) await answer();
    const boot = await bootstrap;
    const emitted = envelopes(boot);
    expect(emitted.filter((item) => typeof item.remote_id === "string" && item.remote_id.startsWith("tg:chat:"))).toMatchObject([
      { payload: { is_pinned: true, pin_order: 0 } }, { payload: { is_pinned: true, pin_order: 1 } }, { payload: { is_pinned: false, pin_order: 0 } },
    ]);
    expect(boot).toMatchObject({ hasMore: false, traversed: { "101": [21, 120], "102": [1, 70], "103": [1, 5] } });
    const filling = fetch(f.tg, unusedPager, "fixture-A", gapArgs(101, 1, 20, 120));
    await answer();
    const page = await filling;
    const batch = envelopes(page);
    expect(batch.length).toBeLessThanOrEqual(50);
    expect(page).toMatchObject({
      traversed: { "101": [1, 20] },
      progress: { kind: "completeTarget", forwardCheckpoint: { kind: "replace" } },
    });
    emitted.push(...batch);
    const actual = emitted.map((envelope) => envelope.remote_id).filter((id): id is string => typeof id === "string" && id.startsWith("tg:msg:"));
    const expected = [...histories].flatMap(([chat, history]) => history.map((message) => `tg:msg:${String(chat)}:${String(message.id)}`));
    expect(actual.length).toBe(195);
    expect(new Set(actual)).toEqual(new Set(expected));

    // Resolve self through a real request before processing incoming updates.
    const self = new Api.User({ id: bigInt(999), accessHash: bigInt(3), self: true, firstName: "Fixture" });
    const me = f.client.getMe(true);
    const meRequest = await f.application(wireIndex++);
    expect(meRequest.method).toBe("users.GetUsers");
    await f.reply(meRequest, { getBytes: (): Buffer => {
      const header = Buffer.alloc(8);
      header.writeUInt32LE(0x1cb5c415); header.writeUInt32LE(1, 4);
      return Buffer.concat([header, self.getBytes()]);
    } });
    await me;
    const liveIds: string[] = [];
    let delivered: (() => void) | undefined;
    const incomingDone = new Promise<void>((resolve) => { delivered = resolve; });
    f.tg.addLiveHandler((message) => {
      liveIds.push(...liveUpdatePushes(message, "fixture-A").map((push) => push.remote_id));
      if (liveIds.length === 2) delivered?.();
    });
    const pendingHistory = outcome(f.client.invoke(new Api.updates.GetState()));
    const pendingHistorySend = await f.application(wireIndex++);
    await f.incoming(new Api.Updates({ updates: [121, 122].map((id) => new Api.UpdateNewMessage({ message: fixtureMessage(101, id), pts: id, ptsCount: 1 })), chats: [fixtureChat(101)], users: [self], date: 1700000122, seq: 1 }));
    await incomingDone;
    expect(liveIds).toEqual(["tg:msg:101:121", "tg:msg:101:122"]);
    expect(f.writes).toHaveLength(wireIndex);
    await f.reply(pendingHistorySend, stateResponse());
    expect((await pendingHistory).kind).toBe("resolved");

    const exported = await f.exportedSender(1);
    expect(exported).not.toBe(f.sender);
    const document = new Api.Document({ id: bigInt(7), accessHash: bigInt(8), fileReference: Buffer.from([1, 2]), date: 1700000000,
      mimeType: "application/octet-stream", size: bigInt(262151), dcId: 1, attributes: [new Api.DocumentAttributeFilename({ fileName: "fixture.bin" })] });
    const download = f.client.downloadMedia(new Api.MessageMediaDocument({ document }), {});
    const overlappingHistory = f.tg.getMessages(new Api.InputPeerChat({ chatId: bigInt(101) }), { limit: 50 });
    await Promise.all([f.tg.resolvePeer(101), f.tg.resolvePeer(103)]);
    let historyAnswered = false;
    for (const [offset, size] of [[0, 131072], [131072, 131072], [262144, 7]] as const) {
      let chunk = await f.application(wireIndex++);
      if (chunk.method === "messages.GetHistory") {
        expect(historyAnswered).toBe(false);
        historyAnswered = true;
        await f.reply(chunk, new Api.messages.MessagesSlice({ count: 120, messages: Array.from({ length: 50 }, (_, index) => fixtureMessage(101, 120 - index)), chats: [fixtureChat(101)], users: [] }));
        expect((await overlappingHistory).length).toBe(50);
        chunk = await f.application(wireIndex++);
      }
      const request = providerRequest(chunk);
      expect(request).toBeInstanceOf(Api.upload.GetFile);
      if (!(request instanceof Api.upload.GetFile)) throw new Error("Expected media request");
      expect(request.offset.toJSNumber()).toBe(offset);
      expect(chunk.sender).toBe(exported);
      await f.reply(chunk, new Api.upload.File({ type: new Api.storage.FileUnknown(), mtime: 1700000000, bytes: Buffer.alloc(size, 7) }));
    }
    const bytes = await download;
    expect(historyAnswered).toBe(true);
    expect(Buffer.isBuffer(bytes) && bytes.length).toBe(262151);
    // Cross the removed twenty-per-minute quota at one monotonic instant.
    for (let i = 0; i < 25; i++) {
      const immediate = outcome(f.client.invoke(new Api.updates.GetState()));
      await f.reply(await f.application(wireIndex++), stateResponse());
      expect((await immediate).kind).toBe("resolved");
    }
    const active = outcome(f.client.invoke(new Api.updates.GetState()));
    const activeSend = await f.application(wireIndex++);
    const viaOtherDc = outcome(f.client.invokeWithSender(new Api.updates.GetState(), exported));
    await f.reply(activeSend, new Api.RpcError({ errorCode: 420, errorMessage: "FLOOD_WAIT_3600" }));
    expect((await active).kind).toBe("rejected");
    expect((await viaOtherDc).kind).toBe("rejected");
    const independentClock = new VirtualClock();
    const independent = await createTransport(independentClock, new AccountAdmission("fixture-B", independentClock, () => undefined));
    try {
      const progressing = outcome(independent.client.invoke(new Api.updates.GetState()));
      await independent.reply(await independent.application(0), stateResponse());
      expect((await progressing).kind).toBe("resolved");
      expect(independent.admission.remoteFloods).toBe(0);
    } finally { await independent.close(); }
    expect(f.writes).toHaveLength(wireIndex);
    f.admission.stop();
    expect((await outcome(f.client.invoke(new Api.updates.GetState()))).kind).toBe("rejected");
    expect(clock.timerCount).toBe(0);
    expect(f.maximumInFlight()).toBe(1);
    for (let i = 1; i < f.writes.length; i++) {
      const a = f.writes[i - 1]; const b = f.writes[i];
      if (!a || !b) throw new Error("Missing transmission");
      expect(b.at - a.at).toBe(0);
    }
    expect(f.writes).toHaveLength(40);
    evidence(f, clock, { expectedTransmissions: 40, expectedMessages: 197, actualMessages: actual.length + liveIds.length,
      identities: ["101:1..122", "102:1..70", "103:1..5"], mediaChunks: 3, mediaBytes: 262151, deliberateWaitMs: clock.now(), sameTimestampRequests: 40 });
  } finally { await f.close(); }
});

/** @test-id: tst_src_tgfast_005
 * @scenario: scn_telegram_fast_pages_001
 * @covers: fifty-dialog Source continuations, actual SDK page sizes and provider latency
 * @deterministic: yes; real SDK with a 100ms virtual provider round trip
 * @fixtures: 50 dialogs, independent 120/70/5 histories, two live messages
 */
test("tst_src_tgfast_005 measures complete round-robin history without local pacing", async () => {
    const clock = new VirtualClock();
    const f = await createTransport(clock);
    const now = spyOn(performance, "now").mockImplementation(() => clock.now());
    const evidence = caseEvidence("tst_src_tgfast_005", "budgeted-page");
    const counts = new Map(Array.from({ length: 50 }, (_, index) => [101 + index, index === 0 ? 120 : index === 1 ? 70 : index === 2 ? 5 : 0]));
    const expected = [...counts].flatMap(([chat, count]) => Array.from({ length: count }, (_, index) => `tg:msg:${String(chat)}:${String(index + 1)}`));
    const emitted: Record<string, unknown>[] = [];
    const liveIds: string[] = [];
    const latencies: number[] = [];
    const frameBytes: number[] = [];
    let index = 0;
    try {
      const me = f.client.getMe(true);
      const user = new Api.User({ id: bigInt(999), self: true, firstName: "Fixture" });
      const sent = await f.application(index++);
      clock.advance(100);
      await f.reply(sent, { getBytes: (): Buffer => {
        const header = Buffer.alloc(8); header.writeUInt32LE(0x1cb5c415); header.writeInt32LE(1, 4);
        return Buffer.concat([header, user.getBytes()]);
      } });
      await me;
      f.tg.addLiveHandler((message) => { liveIds.push(...liveUpdatePushes(message, "fixture-A").map((push) => push.remote_id)); });
      const answer = async (): Promise<void> => {
        const wire = await f.application(index++);
        const request = providerRequest(wire);
        // This is provider work, never a configured Source inter-request sleep.
        clock.advance(100);
        if (request instanceof Api.messages.GetDialogs) {
          expect(request.offsetId).toBe(0);
          await f.reply(wire, new Api.messages.Dialogs({
            dialogs: [...counts].map(([chat, count], pin) => new Api.Dialog({ pinned: pin < 7,
              peer: new Api.PeerChat({ chatId: bigInt(chat) }), topMessage: count,
              readInboxMaxId: 0, readOutboxMaxId: 0, unreadCount: 0, unreadMentionsCount: 0,
              unreadReactionsCount: 0, notifySettings: new Api.PeerNotifySettings({}) })),
            chats: [...counts.keys()].map(fixtureChat), users: [],
            messages: [...counts].filter(([, count]) => count > 0).map(([chat, count]) => fixtureMessage(chat, count)),
          }));
        } else if (request instanceof Api.messages.GetHistory && request.peer instanceof Api.InputPeerChat) {
          const chat = request.peer.chatId.toJSNumber();
          const count = counts.get(chat);
          if (count === undefined) throw new Error("Unknown benchmark chat");
          expect(request.limit).toBeLessThanOrEqual(100);
          const messages = Array.from({ length: count }, (_, message) => count - message)
            .filter((id) => request.offsetId === 0 || id < request.offsetId).slice(0, request.limit)
            .map((id) => fixtureMessage(chat, id));
          await f.reply(wire, new Api.messages.MessagesSlice({ count, messages, chats: [fixtureChat(chat)], users: [] }));
        } else throw new Error(`Unexpected benchmark request ${wire.method}`);
      };
      let cursor: unknown = null;
      for (let page = 0; page < 2; page++) {
        const started = clock.now();
        const reading = runBootstrap(cursor, new LiveDialogPager(f.tg, "fixture-A"));
        for (let call = 0; call < (page === 0 ? 26 : 25); call++) await answer();
        const result = await reading;
        latencies.push(clock.now() - started);
        frameBytes.push(Buffer.byteLength(JSON.stringify(result)));
        emitted.push(...envelopes(result));
        // Only the three chats with a history state what the page read of them; the empty ones state nothing.
        expect(result).toMatchObject({ hasMore: page < 1, traversed: page === 0 ? { "101": [21, 120], "102": [1, 70], "103": [1, 5] } : {} });
        cursor = JSON.parse(JSON.stringify(result.nextCursor)) as unknown;
        if (page === 0) {
          await f.incoming(new Api.Updates({ users: [user], chats: [fixtureChat(101)], date: 1700000122, seq: 1,
            updates: [121, 122].map((id) => new Api.UpdateNewMessage({ message: fixtureMessage(101, id), pts: id, ptsCount: 1 })) }));
          await flushCommands();
          expect(liveIds).toEqual(["tg:msg:101:121", "tg:msg:101:122"]);
        }
      }
      const visits: number[] = [];
      visits.push(101);
      const started = clock.now();
      const reading = fetch(f.tg, unusedPager, "fixture-A", gapArgs(101, 1, 20, 120));
      await answer();
      const page = await reading;
      latencies.push(clock.now() - started);
      frameBytes.push(Buffer.byteLength(JSON.stringify(page)));
      expect(page.total).toBe(counts.get(101));
      expect(page).toMatchObject({
        traversed: { "101": [1, 20] },
        progress: { kind: "completeTarget", forwardCheckpoint: { kind: "replace" } },
      });
      emitted.push(...envelopes(page));
      expect(visits).toEqual([101]);
      const ids = emitted.map((item) => item.remote_id).filter((id): id is string => typeof id === "string" && id.startsWith("tg:msg:"));
      expect(ids.sort()).toEqual(expected.sort());
      expect(new Set([...ids, ...liveIds]).size).toBe(197);
      expect(emitted.filter((item) => String(item.remote_id).startsWith("tg:chat:") && (item.payload as Record<string, unknown>).is_pinned === true)
        .map((item) => (item.payload as Record<string, unknown>).pin_order)).toEqual([0, 1, 2, 3, 4, 5, 6]);
      expect(Math.max(...latencies)).toBe(2600);
      expect(f.writes.filter((wire) => wire.method === "messages.GetDialogs")).toHaveLength(1);
      expect(f.writes).toHaveLength(53);
      expect(clock.now()).toBe(f.writes.length * 100);
      expect(f.maximumInFlight()).toBe(1);
      evidence(f, clock, { sourcePagePolicy: "time-and-bytes", providerTimeMs: clock.now(), deliberateWaitMs: 0,
        sourceCommands: latencies.length, maxSourceLatencyMs: Math.max(...latencies), maxFrameBytes: Math.max(...frameBytes),
        expectedMessages: 197, actualMessages: ids.length + liveIds.length, dialogScans: 1,
        databaseTransactions: "not measured at Source boundary" });
    } finally { now.mockRestore(); await f.close(); }
});

/** @test-id: tst_src_tgfast_006
 * @scenario: scn_telegram_fast_pages_002
 * @covers: peer-scoped message dates in actual GetDialogs continuation
 * @deterministic: yes
 * @fixtures: different chats with the same message ID and reversed message vector
 */
test("tst_src_tgfast_006 dialog offsets use the date from their own chat", async () => {
  const f = await createTransport(new VirtualClock());
  try {
    const reading = LiveDialogPager.discoverPage(f.tg, null, 2);
    const messages = [101, 102].map((chat) => new Api.Message({ id: 7,
      peerId: new Api.PeerChannel({ channelId: bigInt(chat) }), date: chat === 101 ? 200 : 100, message: "fixture" }));
    await f.reply(await f.application(0), new Api.messages.DialogsSlice({ count: 3,
      dialogs: [102, 101].map((chat) => new Api.Dialog({ pinned: chat === 102, peer: new Api.PeerChannel({ channelId: bigInt(chat) }), topMessage: 7,
        readInboxMaxId: 0, readOutboxMaxId: 0, unreadCount: 0, unreadMentionsCount: 0, unreadReactionsCount: 0, notifySettings: new Api.PeerNotifySettings({}) })),
      messages, chats: [101, 102].map((id) => new Api.Channel({ id: bigInt(id), accessHash: bigInt(99), title: "fixture", photo: new Api.ChatPhotoEmpty(), date: 1, broadcast: true })), users: [],
    }));
    expect((await reading).next_offset).toMatchObject({ offset_date: 200, offset_id: 7, offset_peer: { ty: "channel", id: 101 } });
  } finally { await f.close(); }
});

/** @test-id: tst_src_tgflood_004
 * @scenario: scn_tgflood_006
 * @covers: bounded account waiting queue and in-flight slot retention
 * @deterministic: yes
 * @fixtures: real SDK, blocked in-memory wire response, virtual clock
 */
test("tst_src_tgflood_004 an in-flight request bounds the shared waiting queue", async () => {
  const evidence = caseEvidence("tst_src_tgflood_004", "queue-timeout-reconnect-stop");
  const clock = new VirtualClock();
  const f = await createTransport(clock);
  try {
    const inFlight = outcome(f.client.invoke(new Api.updates.GetState()));
    const first = await f.application(0);
    const queued = Array.from({ length: 33 }, () => outcome(f.client.invoke(new Api.updates.GetState())));
    const overflow = queued[32];
    if (!overflow) throw new Error("Missing overflow fixture");
    const next = await Promise.race([overflow, f.application(1).then(() => ({ kind: "transmitted" as const }))]);
    expect(next.kind).toBe("rejected");
    expect(f.writes).toHaveLength(1);
    expect(f.admission.queued).toBe(32);
    expect(clock.timerCount).toBe(1);
    clock.advance(20_000);
    for (const result of await Promise.all(queued)) expect(result.kind).toBe("rejected");
    expect(f.admission.queued).toBe(0);
    expect(clock.timerCount).toBe(0);
    expect(f.admission.remoteFloods).toBe(0);
    const callerTimeout = await Promise.race([inFlight, Promise.resolve("caller timed out")]);
    expect(callerTimeout).toBe("caller timed out");
    const afterTimeout = outcome(f.client.invoke(new Api.updates.GetState()));
    expect(f.writes).toHaveLength(1);
    await f.reply(first, stateResponse());
    expect((await inFlight).kind).toBe("resolved");
    const following = await f.application(1);
    await f.reply(following, stateResponse());
    expect((await afterTimeout).kind).toBe("resolved");
    const replaying = outcome(f.client.invoke(new Api.updates.GetState()));
    const waitingBeforeReconnect = outcome(f.client.invoke(new Api.updates.GetState()));
    await f.application(2);
    expect(f.admission.queued).toBe(1);
    f.sender.isReconnecting = true;
    await f.sender._reconnect();
    const restoredQueue = (f.sender as unknown as { _sendQueue: { values(): ({ msgId?: unknown } | undefined)[] } })._sendQueue.values();
    expect(restoredQueue.some((state) => state !== undefined && state.msgId === undefined)).toBe(true);
    await f.reply(await f.application(3), stateResponse());
    expect((await replaying).kind).toBe("resolved");
    const restored = await f.application(4);
    await f.reply(restored, stateResponse());
    expect((await waitingBeforeReconnect).kind).toBe("resolved");
    expect(f.maximumInFlight()).toBe(1);
    evidence(f, clock, { expectedTransmissions: 5, queueLimit: 32, rejectedOverflow: 1, callerTimeoutReleasedPermit: false });
  } finally { await f.close(); }
  for (const duration of ["", "-1", "9".repeat(400), "9007199254740991"]) {
    const malformed = await createTransport(new VirtualClock());
    try {
      const pending = outcome(malformed.client.invoke(new Api.updates.GetState()));
      const sent = await malformed.application(0);
      await malformed.reply(sent, new Api.RpcError({ errorCode: 420, errorMessage: `FLOOD_WAIT_${duration}` }));
      expect((await pending).kind).toBe("rejected");
      expect(malformed.admission.holdUntil).toBeNull();
      expect(malformed.admission.remoteFloods).toBe(1);
      const denied = await outcome(malformed.client.invoke(new Api.updates.GetState()));
      expect(denied.kind).toBe("rejected");
      expect(malformed.writes).toHaveLength(1);
    } finally { await malformed.close(); }
  }
  const stoppingClock = new VirtualClock();
  const stopping = await createTransport(stoppingClock, undefined, true);
  try {
    await stopping.reply(await stopping.application(0), setupConfig());
    await stopping.connected;
    const pending = outcome(stopping.client.invoke(new Api.updates.GetState()));
    await stopping.application(1);
    const queuedAtStop = outcome(stopping.client.invoke(new Api.updates.GetState()));
    await stopping.ping();
    expect(stopping.admission.queued).toBe(1);
    stopping.sender.reconnect();
    await stopping.waitSleep(1000);
    await stopping.client.destroy();
    const settled = await Promise.race([pending, Promise.resolve({ kind: "unsettled" })]);
    expect(settled.kind).toBe("rejected");
    expect((await queuedAtStop).kind).toBe("rejected");
    expect(stopping.admission.queued).toBe(0);
    expect(stoppingClock.timerCount).toBe(0);
    stopping.releaseSleep(1000);
    await flushCommands();
    stoppingClock.advance(60_000);
    expect(stopping.writes).toHaveLength(2);
    expect(stopping.sender._userConnected).toBe(false);
  } finally { await stopping.close(); }
  const pacingClock = new VirtualClock();
  const pacing = await createTransport(pacingClock);
  try {
    const first = outcome(pacing.client.invoke(new Api.updates.GetState()));
    await pacing.application(0);
    const waiting = outcome(pacing.client.invoke(new Api.updates.GetState()));
    await pacing.ping();
    expect(pacing.admission.queued).toBe(1);
    expect(pacing.writes).toHaveLength(1);
    await pacing.client.destroy();
    expect((await first).kind).toBe("rejected");
    expect((await waiting).kind).toBe("rejected");
    expect(pacing.admission.queued).toBe(0);
    expect(pacingClock.timerCount).toBe(0);
    pacingClock.advance(60_000);
    expect(pacing.writes).toHaveLength(1);
  } finally { await pacing.close(); }
  for (const point of ["packing", "encryption"] as const) {
    const broken = await createTransport(new VirtualClock());
    try {
      broken.faults[point] = new Error(`fixture ${point} failure`);
      expect((await outcome(broken.client.invoke(new Api.updates.GetState()))).kind).toBe("rejected");
      expect(broken.writes).toHaveLength(0);
      const recovered = outcome(broken.client.invoke(new Api.updates.GetState()));
      await broken.reply(await broken.application(0), stateResponse());
      expect((await recovered).kind).toBe("resolved");
    } finally { await broken.close(); }
  }
  const expiredClock = new VirtualClock();
  const expired = await createTransport(expiredClock);
  try {
    const barrier = expired.pauseEncryption();
    const pending = outcome(expired.client.invoke(new Api.updates.GetState()));
    await barrier.entered;
    expiredClock.advance(20_000);
    expect((await pending).kind).toBe("rejected");
    barrier.release();
    await expired.ping();
    expect(expired.writes).toHaveLength(0);
    expect(expiredClock.timerCount).toBe(0);
  } finally { await expired.close(); }
  const sendClock = new VirtualClock();
  const sending = await createTransport(sendClock, undefined, true);
  try {
    await sending.reply(await sending.application(0), setupConfig());
    await sending.connected;
    sending.faults.send = new Error("fixture disconnected while sending");
    const pending = outcome(sending.client.invoke(new Api.updates.GetState()));
    await sending.waitSleep(1000);
    // The SDK owns the uncertain attempt and reconnect; no second caller is
    // admitted merely because the socket's send promise rejected.
    expect(sending.writes).toHaveLength(1);
    sending.releaseSleep(1000);
    await sending.reply(await sending.application(1), stateResponse());
    expect((await pending).kind).toBe("resolved");
    expect(sending.admission.remoteFloods).toBe(0);
  } finally { await sending.close(); }
  const racingClock = new VirtualClock();
  const racing = await createTransport(racingClock);
  const encryption = racing.pauseEncryption();
  let reconnect: Promise<void> | undefined;
  try {
    const pending = outcome(racing.client.invoke(new Api.updates.GetState()));
    await encryption.entered;
    racing.sender.isReconnecting = true;
    reconnect = racing.sender._reconnect();
    // Drain the fake connection's immediate promises, not real time. The old
    // packet is deliberately still inside asynchronous crypto at this point.
    await new Promise<void>((resolve) => { setImmediate(resolve); });
    expect(racing.sender._userConnected).toBe(false);
    encryption.release();
    await reconnect;
    const replay = await racing.application(0);
    await racing.reply(replay, stateResponse());
    expect((await pending).kind).toBe("resolved");
    const next = outcome(racing.client.invoke(new Api.updates.GetState()));
    await racing.reply(await racing.application(1), stateResponse());
    expect((await next).kind).toBe("resolved");
    expect(racing.maximumInFlight()).toBe(1);
  } finally {
    encryption.release();
    await reconnect;
    await racing.close();
  }
});

/** @test-id: tst_src_tgflood_007
 * @scenario: scn_tgflood_009
 * @covers: exact provider holds without learned request spacing
 * @deterministic: yes
 * @fixtures: actual GramJS sender with in-memory replies and a monotonic clock
 */
test("tst_src_tgflood_007 successful bursts add no delay around exact provider holds", async () => {
  for (const [message, seconds] of [
    ["FLOOD_WAIT_4", 4],
    ["FLOOD_PREMIUM_WAIT_5", 5],
    ["TAKEOUT_INIT_DELAY_6", 6],
  ] as const) {
    expect(floodWaitSecs({ code: 420, errorMessage: message })).toBe(seconds);
  }
  for (const message of ["FLOOD_WAIT", "FLOOD_WAIT_-1", "TAKEOUT_INIT_DELAY_bad", "FLOOD_PREMIUM_WAIT_1x"]) {
    expect(floodWaitSecs({ code: 420, errorMessage: message })).toBeUndefined();
  }

  const clock = new VirtualClock();
  const f = await createTransport(clock);
  try {
    for (let index = 0; index < 3; index++) {
      const pending = outcome(f.client.invoke(new Api.updates.GetState()));
      const sent = await f.application(index);
      expect(sent.at).toBe(0);
      await f.reply(sent, stateResponse());
      expect((await pending).kind).toBe("resolved");
    }

    const flooded = outcome(f.client.invoke(new Api.updates.GetState()));
    await f.reply(await f.application(3), new Api.RpcError({ errorCode: 420, errorMessage: "TAKEOUT_INIT_DELAY_4" }));
    expect((await flooded).kind).toBe("rejected");
    expect(f.admission.holdUntil).toBe(4000);

    clock.advance(3999);
    expect((await outcome(f.client.invoke(new Api.updates.GetState()))).kind).toBe("rejected");
    expect(f.writes).toHaveLength(4);
    clock.advance(1);

    const first = outcome(f.client.invoke(new Api.updates.GetState()));
    const second = outcome(f.client.invoke(new Api.updates.GetState()));
    const firstSent = await f.application(4);
    expect(firstSent.at).toBe(4000);
    await f.reply(firstSent, stateResponse());
    expect((await first).kind).toBe("resolved");
    await flushCommands();
    expect(f.writes).toHaveLength(6);
    const secondSent = await f.application(5);
    expect(secondSent.at).toBe(4000);
    await f.reply(secondSent, stateResponse());
    expect((await second).kind).toBe("resolved");

    const floodedAgain = outcome(f.client.invoke(new Api.updates.GetState()));
    await f.reply(await f.application(6), new Api.RpcError({ errorCode: 420, errorMessage: "FLOOD_PREMIUM_WAIT_2" }));
    expect((await floodedAgain).kind).toBe("rejected");
    expect(f.admission.holdUntil).toBe(6000);
    clock.advance(1999);
    expect((await outcome(f.client.invoke(new Api.updates.GetState()))).kind).toBe("rejected");
    clock.advance(1);
    const resumed = outcome(f.client.invoke(new Api.updates.GetState()));
    const resumedSent = await f.application(7);
    expect(resumedSent.at).toBe(6000);
    await f.reply(resumedSent, stateResponse());
    expect((await resumed).kind).toBe("resolved");
  } finally { await f.close(); }

  const malformed = await createTransport(new VirtualClock());
  try {
    const pending = outcome(malformed.client.invoke(new Api.updates.GetState()));
    await malformed.reply(await malformed.application(0),
      new Api.RpcError({ errorCode: 420, errorMessage: "TAKEOUT_INIT_DELAY_bad" }));
    expect((await pending).kind).toBe("rejected");
    expect(malformed.admission.holdUntil).toBeNull();
    expect((await outcome(malformed.client.invoke(new Api.updates.GetState()))).kind).toBe("rejected");
    expect(malformed.writes).toHaveLength(1);
  } finally { await malformed.close(); }
});

/**
 * @test-id: tst_src_tgflood_002
 * @scenario: scn_tgflood_002
 * @covers: real MTProtoSender RPCResult/error handling and application transmission
 * @deterministic: yes
 * @fixtures: actual GramJS sender/crypto with in-memory wire replies; no provider connection
 */
test("tst_src_tgflood_002 the first remote flood prevents the next actual SDK transmission", async () => {
  const zeroClock = new VirtualClock();
  const zero = await createTransport(zeroClock);
  try {
    const failed = outcome(zero.client.invoke(new Api.updates.GetState()));
    await zero.reply(await zero.application(0), new Api.RpcError({ errorCode: 420, errorMessage: "FLOOD_WAIT_0" }));
    expect((await failed).value).toMatchObject({ code: 420, seconds: 0 });
    await zero.ping();
    expect(zero.writes).toHaveLength(1);
    expect(zero.admission.holdUntil).toBe(0);
    const next = outcome(zero.client.invoke(new Api.updates.GetState()));
    await zero.reply(await zero.application(1), stateResponse());
    expect((await next).kind).toBe("resolved");
    expect(zero.writes.map((sent) => sent.at)).toEqual([0, 0]);
    expect(zero.admission.remoteFloods).toBe(1);
  } finally { await zero.close(); }
  for (const seconds of [4, 3600]) for (const origin of [...ORIGINS,
    { name: "setup", request: () => new Api.updates.GetState() },
    { name: "server-retry", request: () => new Api.updates.GetState() },
    { name: "reconnect-replay", request: () => new Api.updates.GetState() },
  ]) {
    const evidence = caseEvidence("tst_src_tgflood_002", `${origin.name}:${String(seconds)}`);
    const clock = new VirtualClock();
    const f = await createTransport(clock, undefined, origin.name === "setup");
    try {
      // A failed setup never resolves the client's connected barrier. Other
      // SDK senders already exist during setup; exercise that real queue path.
      const invokeState = async (): Promise<unknown> => origin.name === "setup"
        ? f.sender.send(new Api.updates.GetState()) : f.client.invoke(new Api.updates.GetState());
      const first = outcome(origin.name === "setup" ? f.connected : f.client.invoke(origin.request()));
      let sent = await f.application(0);
      if (origin.name === "server-retry") {
        await f.reply(sent, new Api.RpcError({ errorCode: 500, errorMessage: "RPC_CALL_FAIL" }));
        await f.waitSleep(2000);
        f.releaseSleep(2000);
        sent = await f.application(1);
      } else if (origin.name === "reconnect-replay") {
        f.sender.isReconnecting = true;
        await f.sender._reconnect();
        await f.ping();
        expect(f.writes).toHaveLength(2);
        sent = await f.application(1);
        expect(sent.at).toBe(0);
      }
      expect(sent.method).toBe(origin.name === "setup" ? "InvokeWithLayer" : origin.name.endsWith("retry") || origin.name.endsWith("replay") ? "updates.GetState" : origin.name);
      const queued = outcome(invokeState());
      await f.reply(sent, new Api.RpcError({ errorCode: 420, errorMessage: `FLOOD_WAIT_${String(seconds)}` }));
      const transmitted = f.writes.length;
      const hold = clock.now() + seconds * 1000;
      expect(f.admission.holdUntil).toBe(hold);
      expect(f.admission.remoteFloods).toBe(1);
      expect((await first).kind).toBe("rejected");
      expect((await queued).kind).toBe("rejected");
      const second = outcome(invokeState());
      const next = await Promise.race([second, f.application(transmitted).then(() => ({ kind: "transmitted" as const }))]);
      expect(next.kind).toBe("rejected");
      clock.advance(hold - clock.now() - 1);
      const late = await outcome(invokeState());
      expect(late.kind).toBe("rejected");
      expect(late.value).toMatchObject({ code: 420, seconds: 1 });
      expect(f.admission.holdUntil).toBe(hold);
      expect(f.admission.remoteFloods).toBe(1);
      expect(f.writes).toHaveLength(transmitted);
      await f.ping();
      expect(f.packets.some((packet) => packet.methods.includes("Ping"))).toBe(true);
      expect(f.writes).toHaveLength(transmitted);
      clock.advance(1);
      const probe = outcome(invokeState());
      const behindProbe = outcome(invokeState());
      const admitted = await f.application(transmitted);
      expect(admitted.at).toBe(hold);
      expect(f.writes).toHaveLength(transmitted + 1);
      if (seconds === 4) {
        await f.reply(admitted, stateResponse());
        expect((await probe).kind).toBe("resolved");
        const following = await f.application(transmitted + 1);
        expect(following.at - admitted.at).toBe(0);
        await f.reply(following, stateResponse());
        expect((await behindProbe).kind).toBe("resolved");
      } else {
        await f.reply(admitted, new Api.RpcError({ errorCode: 420, errorMessage: "FLOOD_WAIT_4" }));
        expect((await probe).kind).toBe("rejected");
        expect((await behindProbe).kind).toBe("rejected");
        expect(f.admission.remoteFloods).toBe(2);
        expect(f.writes).toHaveLength(transmitted + 1);
      }
      const expectedTransmissions = (origin.name.endsWith("retry") || origin.name.endsWith("replay") ? 2 : 1) + (seconds === 4 ? 2 : 1);
      expect(f.writes).toHaveLength(expectedTransmissions);
      expect(f.maximumInFlight()).toBe(1);
      evidence(f, clock, { expectedTransmissions, transmissionsDuringHold: 0, firstHold: hold });
    } finally { await f.close(); }
  }
  // A response to an older, genuinely transmitted replay may arrive while a
  // newer operation is inside crypto, or while its replay still owns the slot.
  for (const phase of ["encryption", "held-replay"] as const) {
    const evidence = caseEvidence("tst_src_tgflood_002", phase);
    const raceClock = new VirtualClock();
    const race = await createTransport(raceClock);
    let encryption: ReturnType<typeof race.pauseEncryption> | undefined;
    try {
      const original = outcome(race.client.invoke(new Api.updates.GetState()));
      const old = await race.application(0);
      race.sender.isReconnecting = true;
      await race.sender._reconnect();
      const latest = await race.application(1);
      let blocked = original;
      if (phase === "encryption") {
        await race.reply(latest, stateResponse());
        expect((await original).kind).toBe("resolved");
        encryption = race.pauseEncryption();
        blocked = outcome(race.client.invoke(new Api.updates.GetState()));
        await encryption.entered;
      }
      await race.reply(old, new Api.RpcError({ errorCode: 420, errorMessage: "FLOOD_WAIT_4" }));
      expect(race.admission.holdUntil).toBe(raceClock.now() + 4000);
      expect(race.admission.remoteFloods).toBe(1);
      if (phase === "held-replay") {
        race.sender.isReconnecting = true;
        await race.sender._reconnect();
      } else encryption?.release();
      await race.ping();
      expect(race.writes).toHaveLength(2);
      expect((await blocked).value).toMatchObject({ code: 420, seconds: 4 });
      expect(race.admission.queued).toBe(0);
      raceClock.advance(4000);
      const resumed = outcome(race.client.invoke(new Api.updates.GetState()));
      await race.reply(await race.application(2), stateResponse());
      expect((await resumed).kind).toBe("resolved");
      expect(race.maximumInFlight()).toBe(1);
      evidence(race, raceClock, { expectedTransmissions: 3, transmissionsDuringHold: 0 });
    } finally { encryption?.release(); await race.close(); }
  }
  // Three genuinely transmitted copies of one operation, separated by real
  // reconnects, make old response IDs possible without concurrent RPC starts.
  const delayedClock = new VirtualClock();
  const delayedEvidence = caseEvidence("tst_src_tgflood_002", "late-errors-and-success");
  const delayed = await createTransport(delayedClock);
  try {
    const pending = outcome(delayed.client.invoke(new Api.updates.GetState()));
    const originals = [await delayed.application(0)];
    for (let index = 1; index < 3; index++) {
      delayed.sender.isReconnecting = true;
      await delayed.sender._reconnect();
      originals.push(await delayed.application(index));
    }
    const [oldest, middle, latest] = originals;
    if (!oldest || !middle || !latest) throw new Error("Missing transmitted replay fixture");
    await delayed.reply(latest, new Api.RpcError({ errorCode: 420, errorMessage: "FLOOD_WAIT_3600" }));
    expect((await pending).kind).toBe("rejected");
    const hold = delayed.admission.holdUntil;
    delayedClock.advance(1000);
    await delayed.reply(middle, new Api.RpcError({ errorCode: 420, errorMessage: "FLOOD_WAIT_4" }));
    expect(delayed.admission.holdUntil).toBe(hold);
    delayedClock.advance(1000);
    await delayed.reply(oldest, new Api.RpcError({ errorCode: 420, errorMessage: "FLOOD_WAIT_7200" }));
    const extended = delayedClock.now() + 7_200_000;
    expect(delayed.admission.holdUntil).toBe(extended);
    await delayed.reply(middle, stateResponse());
    expect(delayed.admission.holdUntil).toBe(extended);
    const wall = spyOn(Date, "now").mockReturnValue(1);
    try {
      expect((await outcome(delayed.client.invoke(new Api.updates.GetState()))).value).toMatchObject({ code: 420, seconds: 7200 });
      wall.mockReturnValue(9_000_000_000_000);
      expect((await outcome(delayed.client.invoke(new Api.updates.GetState()))).value).toMatchObject({ code: 420, seconds: 7200 });
    } finally { wall.mockRestore(); }
    expect(delayed.admission.holdUntil).toBe(extended);
    expect(delayed.admission.remoteFloods).toBe(3);
    expect(delayed.writes).toHaveLength(3);
    delayedEvidence(delayed, delayedClock, { expectedTransmissions: 3, transmissionsDuringHold: 0, remainingAfterLateSuccess: 7200 });
  } finally { await delayed.close(); }
});

/**
 * @test-id: tst_src_tgflood_006
 * @scenario: scn_tgflood_008
 * @covers: account-wide admission and learned method pacing after a provider flood window
 * @deterministic: yes
 * @fixtures: actual GramJS sender with in-memory replies and a monotonic clock
 */
test("tst_src_tgflood_006 a provider flood paces the resumed burst after its deadline", async () => {
  const clock = new VirtualClock();
  const f = await createTransport(clock);
  try {
    for (let index = 0; index < 4; index++) {
      const history = index % 2 === 1;
      const request = outcome(f.client.invoke(history
        ? new Api.messages.GetHistory({ peer: new Api.InputPeerChat({ chatId: bigInt(1) }), offsetId: 0,
            offsetDate: 0, addOffset: 0, limit: 1, maxId: 0, minId: 0, hash: bigInt.zero })
        : new Api.updates.GetState()));
      const sent = await f.application(index);
      clock.advance(100);
      await f.reply(sent, history
        ? new Api.messages.Messages({ messages: [], chats: [], users: [] })
        : stateResponse());
      expect((await request).kind).toBe("resolved");
    }
    const flooded = outcome(f.client.invoke(new Api.updates.GetState()));
    const failed = await f.application(4);
    clock.advance(100);
    await f.reply(failed, new Api.RpcError({ errorCode: 420, errorMessage: "FLOOD_WAIT_4" }));
    expect((await flooded).kind).toBe("rejected");

    clock.advance(4000);
    const first = outcome(f.client.invoke(new Api.updates.GetState()));
    const second = outcome(f.client.invoke(new Api.updates.GetState()));
    const resumed = await f.application(5);
    expect(resumed.at).toBe(4500);
    await f.reply(resumed, stateResponse());
    expect((await first).kind).toBe("resolved");
    await flushCommands();
    expect(f.writes).toHaveLength(6);
    clock.advance(222);
    await f.ping();
    expect(f.writes).toHaveLength(6);
    clock.advance(1);
    const following = await f.application(6);
    expect(following.at).toBe(4723);
    await f.reply(following, stateResponse());
    expect((await second).kind).toBe("resolved");
  } finally { await f.close(); }
});

/**
 * @test-id: tst_src_tgflood_008
 * @scenario: scn_tgflood_010
 * @covers: method-local adaptive pacing after repeated provider floods
 * @deterministic: yes
 * @fixtures: actual GramJS sender with in-memory replies and a monotonic clock
 */
test("tst_src_tgflood_008 converges below a flooded method rate", async () => {
  const clock = new VirtualClock();
  const f = await createTransport(clock);
  const getState = (): Promise<{ kind: "resolved" | "rejected"; value: unknown }> =>
    outcome(f.client.invoke(new Api.updates.GetState()));
  try {
    for (let index = 0; index < 4; index++) {
      const pending = getState();
      const sent = await f.application(index);
      clock.advance(100);
      await f.reply(sent, stateResponse());
      expect((await pending).kind).toBe("resolved");
    }

    const flooded = getState();
    const failed = await f.application(4);
    expect(failed.at).toBe(400);
    await f.reply(failed, new Api.RpcError({ errorCode: 420, errorMessage: "FLOOD_WAIT_4" }));
    expect((await flooded).kind).toBe("rejected");
    expect(f.admission.holdUntil).toBe(4400);

    clock.advance(4000);
    const resumed = getState();
    const resumedSend = await f.application(5);
    expect(resumedSend.at).toBe(4400);
    await f.reply(resumedSend, stateResponse());
    expect((await resumed).kind).toBe("resolved");

    const paced = getState();
    const unrelated = outcome(f.client.invoke(new Api.messages.GetHistory({
      peer: new Api.InputPeerChat({ chatId: bigInt(1) }), offsetId: 0, offsetDate: 0,
      addOffset: 0, limit: 1, maxId: 0, minId: 0, hash: bigInt.zero,
    })));
    await f.ping();
    expect(f.writes).toHaveLength(7);
    const unrelatedSend = await f.application(6);
    expect(unrelatedSend.at).toBe(4400);
    await f.reply(unrelatedSend, new Api.messages.Messages({ messages: [], chats: [], users: [] }));
    expect((await unrelated).kind).toBe("resolved");

    await f.ping();
    expect(f.writes).toHaveLength(7);
    clock.advance(111);
    await f.ping();
    expect(f.writes).toHaveLength(7);
    clock.advance(1);
    const pacedSend = await f.application(7);
    expect(pacedSend.at).toBe(4512);
    await f.reply(pacedSend, stateResponse());
    expect((await paced).kind).toBe("resolved");

    let nextTransmission = 8;
    for (let success = 2; success < 10; success++) {
      const pending = getState();
      clock.advance(112);
      const sent = await f.application(nextTransmission++);
      await f.reply(sent, stateResponse());
      expect((await pending).kind).toBe("resolved");
    }

    const probe = getState();
    clock.advance(109);
    await f.ping();
    expect(f.writes).toHaveLength(nextTransmission);
    clock.advance(1);
    const probeSend = await f.application(nextTransmission++);
    expect(probeSend.at).toBe(5518);
    await f.reply(probeSend, new Api.RpcError({ errorCode: 420, errorMessage: "FLOOD_WAIT_4" }));
    expect((await probe).kind).toBe("rejected");

    clock.advance(4000);
    const backedOff = getState();
    const backedOffSend = await f.application(nextTransmission++);
    await f.reply(backedOffSend, stateResponse());
    expect((await backedOff).kind).toBe("resolved");
    const behind = getState();
    clock.advance(122);
    await f.ping();
    expect(f.writes).toHaveLength(nextTransmission);
    clock.advance(1);
    const behindSend = await f.application(nextTransmission);
    expect(behindSend.at - backedOffSend.at).toBe(123);
    await f.reply(behindSend, stateResponse());
    expect((await behind).kind).toBe("resolved");
    expect(f.maximumInFlight()).toBe(1);
  } finally { await f.close(); }
});
