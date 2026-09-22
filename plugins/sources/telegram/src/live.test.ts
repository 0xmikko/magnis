import { createWriteStream, WriteStream } from "node:fs";
import * as fsPromises from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { finished } from "node:stream/promises";
import { expect, spyOn, test } from "bun:test";
import bigInt from "big-integer";
import { Api, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { FloodWaitError } from "telegram/errors";
import { EditedMessageEvent } from "telegram/events/EditedMessage";
import { NewMessageEvent } from "telegram/events/NewMessage";

import { createAuthClientFactory, LiveDialogPager, SessionPool, TgClient } from "./live";
import { messageToIntermediate } from "./client";
import { AccountAdmission } from "./request-admission";
import { liveUpdatePushes } from "./subscriptions";
import { messagePayload } from "./surfaces/telegram/envelope";
import { messageRemoteId } from "./surfaces/telegram/schema";
import { createTransport, setupConfig, VirtualClock } from "./testing/mtproto-transport";

/** @test-id: tst_src_tg_takeout_wire_001
 * @scenario: scn_tg_takeout_001
 * @covers: TgClient Takeout lifecycle and ranged history/dialog wire wrappers
 * @deterministic: yes
 * @fixtures: actual GramJS sender with in-memory MTProto replies
 */
test("tst_src_tg_takeout_wire_001 sends every Takeout read through the persisted session and range", async () => {
  const f = await createTransport(new VirtualClock());
  const id = bigInt("9223372036854775001");
  const range = { min_id: 10, max_id: 99 };
  let index = 0;
  const ranged = (sent: Awaited<ReturnType<typeof f.application>>): unknown => {
    expect(sent.state.request).toBeInstanceOf(Api.InvokeWithTakeout);
    const takeout = sent.state.request as Api.InvokeWithTakeout;
    expect(takeout.takeoutId.toString()).toBe(id.toString());
    expect(takeout.query).toBeInstanceOf(Api.InvokeWithMessagesRange);
    const messages = takeout.query as Api.InvokeWithMessagesRange;
    expect(messages.range).toMatchObject({ minId: range.min_id, maxId: range.max_id });
    return messages.query;
  };
  try {
    const opening = f.tg.initTakeout();
    let sent = await f.application(index++);
    expect(sent.state.request).toMatchObject({ className: "account.InitTakeoutSession",
      messageUsers: true, messageChats: true, messageMegagroups: true, messageChannels: true, files: false });
    await f.reply(sent, new Api.account.Takeout({ id }));
    expect(await opening).toBe(id.toString());

    const splitting = f.tg.takeoutRanges(id.toString());
    sent = await f.application(index++);
    expect(sent.state.request).toBeInstanceOf(Api.InvokeWithTakeout);
    const split = sent.state.request as Api.InvokeWithTakeout;
    expect(split.query).toBeInstanceOf(Api.messages.GetSplitRanges);
    const vector = Buffer.alloc(8);
    vector.writeUInt32LE(0x1cb5c415);
    vector.writeInt32LE(1, 4);
    await f.reply(sent, { getBytes: () => Buffer.concat([
      vector, new Api.MessageRange({ minId: range.min_id, maxId: range.max_id }).getBytes(),
    ]) });
    expect(await splitting).toEqual([range]);

    const context = { id: id.toString(), range };
    const history = f.tg.getMessages({ ty: "chat", id: 42 }, { limit: 100, takeout: context });
    sent = await f.application(index++);
    expect(ranged(sent)).toMatchObject({ className: "messages.GetHistory", limit: 100 });
    await f.reply(sent, new Api.messages.Messages({ messages: [], chats: [], users: [] }));
    expect(await history).toHaveLength(0);

    const dialogs = LiveDialogPager.discoverPage(f.tg, null, 1, 60_000, context);
    sent = await f.application(index++);
    expect(ranged(sent)).toMatchObject({ className: "messages.GetDialogs", limit: 1 });
    await f.reply(sent, new Api.messages.Dialogs({ dialogs: [], messages: [], chats: [], users: [] }));
    expect((await dialogs).dialogs).toEqual([]);

    const finishing = f.tg.finishTakeout(id.toString());
    sent = await f.application(index++);
    expect(sent.state.request).toBeInstanceOf(Api.InvokeWithTakeout);
    const finish = sent.state.request as Api.InvokeWithTakeout;
    expect(finish.query).toMatchObject({ className: "account.FinishTakeoutSession", success: true });
    await f.reply(sent, { getBytes: () => {
      const bytes = Buffer.alloc(4);
      bytes.writeUInt32LE(0x997275b5);
      return bytes;
    } });
    await finishing;
    expect(f.writes).toHaveLength(5);
  } finally { await f.close(); }
});

/** @test-id: tst_src_tgflood_006
 * @scenario: scn_tgflood_006
 * @covers: real pool client lifecycle and retained account admission
 * @deterministic: yes
 * @fixtures: synthetic serialized session, actual SDK connect, fake transport
 */
test("tst_src_tgflood_006 eviction and failed setup close the client without erasing its account budget", async () => {
  const clock = new VirtualClock();
  const options: ConstructorParameters<typeof SessionPool>[0] = { clock, diagnostics: () => undefined };
  const pool = new SessionPool(options);
  const guard = pool.admissionFor("fixture-pool");
  const launch = (transport: NonNullable<typeof options>["transport"], session: string): Promise<unknown> => {
    options.transport = transport;
    return pool.getOrCreate("fixture-pool", { api_id: 1, api_hash: "fixture-only", session });
  };
  const first = await createTransport(clock, guard, true, launch);
  try {
    await first.reply(await first.application(0), setupConfig());
    expect(await first.connected).toBe(true);
    expect(await pool.evict("fixture-pool")).toBe(true);
    expect(first.client._destroyed).toBe(true);
    expect(first.disconnectCount()).toBeGreaterThan(0);
    expect(pool.admissionFor("fixture-pool")).toBe(guard);
  } finally { await first.close(); }
  clock.advance(3000);
  const failed = await createTransport(clock, guard, true, launch);
  try {
    const pending = failed.connected.then(() => "connected", () => "failed");
    await failed.reply(await failed.application(0), new Api.RpcError({ errorCode: 420, errorMessage: "FLOOD_WAIT_17" }));
    expect(await pending).toBe("failed");
    expect(failed.client._destroyed).toBe(true);
    expect(failed.disconnectCount()).toBeGreaterThan(0);
    expect(pool.size()).toBe(0);
    expect(guard.holdUntil).toBe(20_000);
  } finally { await failed.close(); }
  const recreated = await createTransport(clock, guard, true, launch);
  try {
    const denied = await recreated.connected.then(() => undefined, (error: unknown) => error);
    expect(denied).toMatchObject({ code: 420, seconds: 17 });
    expect(recreated.writes).toHaveLength(0);
    expect(recreated.client._destroyed).toBe(true);
    expect(pool.admissionFor("fixture-pool")).toBe(guard);
    expect(guard.remoteFloods).toBe(1);
  } finally { await recreated.close(); }

  const authClock = new VirtualClock();
  const authGuard = new AccountAdmission("fixture-auth-process", authClock, () => undefined);
  const authTransport: NonNullable<Parameters<typeof createAuthClientFactory>[1]> = {};
  const auth = createAuthClientFactory(authGuard, authTransport);
  const launchAuth = (transport: NonNullable<Parameters<typeof createAuthClientFactory>[1]>): Promise<unknown> => {
    Object.assign(authTransport, transport);
    return auth.connectFresh(1, "fixture-only");
  };
  const beginning = await createTransport(authClock, authGuard, true, launchAuth);
  try {
    const connected = beginning.connected.then(() => "connected", () => "failed");
    await beginning.reply(await beginning.application(0), new Api.RpcError({ errorCode: 420, errorMessage: "FLOOD_WAIT_17" }));
    expect(await connected).toBe("failed");
    expect(beginning.client._destroyed).toBe(true);
  } finally { await beginning.close(); }
  const repeated = await createTransport(authClock, authGuard, true, launchAuth);
  try {
    const connected = await repeated.connected.then(() => undefined, (error: unknown) => error);
    expect(connected).toMatchObject({ code: 420, seconds: 17 });
    expect(repeated.writes).toHaveLength(0);
    expect(repeated.client._destroyed).toBe(true);
    expect(authGuard.remoteFloods).toBe(1);
  } finally { await repeated.close(); }
});

function outputWriter(output: unknown): WriteStream {
  // Match GramJS: a path creates a stream, while an owned stream is reused.
  if (typeof output === "string") return createWriteStream(output);
  if (output instanceof WriteStream) return output;
  throw new Error("expected a file output stream or path");
}

function completionGate(): { promise: Promise<void>; resolve: () => void } {
  let release: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  if (release === undefined) throw new Error("promise executor did not initialize the gate");
  return { promise, resolve: release };
}

function writeChunk(writer: WriteStream, bytes: number): Promise<void> {
  return new Promise((resolve, reject) => {
    writer.write(Buffer.alloc(bytes), (error) => error == null ? resolve() : reject(error));
  });
}

async function closeOutput(writer: WriteStream | undefined): Promise<void> {
  if (writer === undefined) return;
  const closed = finished(writer).catch(() => {});
  writer.destroy();
  await closed;
}

/**
 * @test-id: tst_src_tg_029
 * @scenario: scn_tg_sync_007
 * @covers: plugins/sources/telegram/src/live.ts::TgClient.downloadMedia
 * @deterministic: yes
 * @fixtures: synthetic 81920-byte prefix and gated 12853-byte final write
 * Test environment: disconnected TelegramClient and real temporary file stream
 * Clients: TgClient.downloadMedia
 * Mocks: TelegramClient.downloadMedia; final stream write; stat observation only
 * Data: generated zero bytes; no provider calls or private media
 */
test("tst_src_tg_029 media success waits for the final write before sampling its size", async () => {
  const directory = await fsPromises.mkdtemp(join(tmpdir(), "tg-media-finish-"));
  const destination = join(directory, "media.bin");
  const client = new TelegramClient(new StringSession(""), 1, "hash", {});
  const releaseWrite = completionGate();
  const providerReturned = completionGate();
  let writer: WriteStream | undefined;
  const originalStat = fsPromises.stat;
  const stat = spyOn(fsPromises, "stat");
  const download = spyOn(client, "downloadMedia").mockImplementation(async (_message, options) => {
    writer = outputWriter(options?.outputFile);
    await writeChunk(writer, 81_920);
    const write = writer._write.bind(writer);
    writer._write = (chunk: Buffer, encoding: BufferEncoding, callback: (error?: Error | null) => void) => {
      void releaseWrite.promise.then(() => write(chunk, encoding, callback));
    };
    // GramJS awaits write's boolean and calls close without waiting for finish.
    await writer.write(Buffer.alloc(12_853));
    writer.close();
    providerReturned.resolve();
    return destination;
  });
  const result = new TgClient(client).downloadMedia({ id: 1 }, destination);
  try {
    await providerReturned.promise;
    // Let the caller consume the resolved provider promise; no timers or I/O polling.
    await Promise.resolve();
    await Promise.resolve();
    expect(stat).not.toHaveBeenCalled();
    expect(writer?.writableFinished).toBe(false);
    releaseWrite.resolve();
    expect(await result).toBe(94_773);
    expect((await originalStat(destination)).size).toBe(94_773);
    expect(writer?.closed).toBe(true);
  } finally {
    releaseWrite.resolve();
    await result.catch(() => {});
    await closeOutput(writer);
    download.mockRestore();
    stat.mockRestore();
    await fsPromises.rm(directory, { recursive: true, force: true });
  }
});

/**
 * @test-id: tst_src_tg_030
 * @scenario: scn_tg_sync_007
 * @covers: plugins/sources/telegram/src/live.ts::TgClient.downloadMedia
 * @deterministic: yes
 * @fixtures: stream error before or after the provider promise resolves
 * Test environment: disconnected TelegramClient and real temporary file stream
 * Clients: TgClient.downloadMedia
 * Mocks: TelegramClient.downloadMedia and controlled stream failure
 * Data: synthetic bytes; deferred errors must never become successful sizes
 */
test("tst_src_tg_030 stream failures before and after provider resolution reject the download", async () => {
  for (const phase of ["before", "after"] as const) {
    const directory = await fsPromises.mkdtemp(join(tmpdir(), "tg-media-error-"));
    const destination = join(directory, "media.bin");
    const client = new TelegramClient(new StringSession(""), 1, "hash", {});
    const ready = completionGate();
    const releaseProvider = completionGate();
    const failure = new Error(`controlled output write failure ${phase} provider resolution`);
    let writer: WriteStream | undefined;
    const download = spyOn(client, "downloadMedia").mockImplementation(async (_message, options) => {
      writer = outputWriter(options?.outputFile);
      // Keep the RED implementation's unowned stream error observed by the fixture.
      writer.on("error", () => {});
      await writeChunk(writer, 8);
      ready.resolve();
      if (phase === "before") await releaseProvider.promise;
      return destination;
    });
    const result = new TgClient(client).downloadMedia({ id: 1 }, destination);
    const observed = result.then((size) => ({ size }), (error: unknown) => ({ error }));
    try {
      await ready.promise;
      await Promise.resolve();
      await Promise.resolve();
      if (writer === undefined) throw new Error("missing test output stream");
      const closed = finished(writer).catch(() => {});
      writer.destroy(failure);
      await closed;
      releaseProvider.resolve();
      expect(await observed).toEqual({ error: failure });
      expect(writer.closed).toBe(true);
    } finally {
      releaseProvider.resolve();
      await closeOutput(writer);
      await observed;
      download.mockRestore();
      await fsPromises.rm(directory, { recursive: true, force: true });
    }
  }
});

/**
 * @test-id: tst_src_tg_031
 * @scenario: scn_tg_sync_007
 * @covers: plugins/sources/telegram/src/live.ts::TgClient.downloadMedia
 * @deterministic: yes
 * @fixtures: typed provider refusal and absent media
 * Test environment: disconnected TelegramClient and real temporary file stream
 * Clients: TgClient.downloadMedia
 * Mocks: TelegramClient.downloadMedia only
 * Data: failures close the owned file stream without replacing the original error
 */
test("tst_src_tg_031 provider refusal and missing media close the output without hanging", async () => {
  const directory = await fsPromises.mkdtemp(join(tmpdir(), "tg-media-refusal-"));
  const destination = join(directory, "media.bin");
  const client = new TelegramClient(new StringSession(""), 1, "hash", {});
  const failure = new FloodWaitError({ capture: 25 });
  let writer: WriteStream | undefined;
  const download = spyOn(client, "downloadMedia").mockImplementation(async (_message, options) => {
    writer = outputWriter(options?.outputFile);
    throw failure;
  });
  try {
    await expect(new TgClient(client).downloadMedia({ id: 1 }, destination)).rejects.toBe(failure);
    expect(writer?.closed).toBe(true);
    download.mockImplementation(async (_message, options) => {
      writer = outputWriter(options?.outputFile);
      return undefined;
    });
    await expect(new TgClient(client).downloadMedia({ id: 2 }, destination)).rejects.toThrow("no downloadable media in message 2");
    expect(writer?.closed).toBe(true);
  } finally {
    await closeOutput(writer);
    download.mockRestore();
    await fsPromises.rm(directory, { recursive: true, force: true });
  }
});

/**
 * @test-id: tst_src_tg_032
 * @scenario: scn_tg_sync_008
 * @covers: plugins/sources/telegram/src/subscriptions.ts::liveUpdatePushes
 * @covers: plugins/sources/telegram/src/live.ts::TgClient.addLiveHandler
 * @deterministic: yes
 * @fixtures: real GramJS messages, three peer kinds, new/edit events without chat entities
 * Test environment: disconnected TelegramClient and actual event callbacks
 * Clients: TgClient.addLiveHandler and liveUpdatePushes
 * Mocks: none; no entity lookup or provider calls
 * Data: synthetic IDs and photo references; malformed peers must not emit chat zero
 */
test("tst_src_tg_032 unhydrated live peers preserve history identity and refuse invalid peers", () => {
  const client = new TelegramClient(new StringSession(""), 1, "hash", {});
  const pushes: ReturnType<typeof liveUpdatePushes> = [];
  new TgClient(client).addLiveHandler((message) => {
    pushes.push(...liveUpdatePushes(message, "account-1"));
  });
  const handlers = client.listEventHandlers();
  const expected: ReturnType<typeof liveUpdatePushes> = [];
  for (const [chatId, peerId] of [
    [101, new Api.PeerUser({ userId: bigInt(101) })],
    [202, new Api.PeerChat({ chatId: bigInt(202) })],
    [303, new Api.PeerChannel({ channelId: bigInt(303) })],
  ] as const) {
    for (const edited of [false, true]) {
      const message = new Api.Message({
        id: 17, peerId, date: 1_700_000_000, message: edited ? "edited" : "new",
      });
      message.media = new Api.MessageMediaPhoto({ photo: new Api.PhotoEmpty({ id: bigInt(99) }) });
      const update = edited
        ? new Api.UpdateEditMessage({ message, pts: 1, ptsCount: 1 })
        : new Api.UpdateNewMessage({ message, pts: 1, ptsCount: 1 });
      const event = edited ? new EditedMessageEvent(message, update) : new NewMessageEvent(message, update);
      event._setClient(client);
      expect(message.chat).toBeUndefined();
      const entry = handlers[edited ? 1 : 0];
      if (entry === undefined) throw new Error("missing new/edit live handler");
      entry[1](event);
      const history = messageToIntermediate({
        id: message.id, date: message.date, message: message.message,
        media: { className: message.media.className },
      }, "account-1", chatId);
      // The push names where the item sits in its chat: the host trims the
      // chat's open range by it, as a page states the ranges it read.
      // @tested-by: tst_tglive_position_001
      expected.push({
        surface: "telegram",
        kind: "live",
        payload: messagePayload(history),
        remote_id: messageRemoteId(chatId, message.id),
        position: { scope_id: String(chatId), id: message.id },
      });
    }
  }
  const refused = [
    undefined, null, {}, { className: "InputPeerSelf" },
    { className: "PeerUser" }, { className: "PeerUser", userId: 0 },
    { className: "PeerChat", chatId: -202 },
    { className: "PeerChannel", channelId: "not-an-id" },
    { className: "PeerChannel", channelId: Number.MAX_SAFE_INTEGER + 1 },
  ].map((peerId) => {
    try { liveUpdatePushes({ id: 17, peerId }, "account-1"); return false; }
    catch (error) {
      return error instanceof Error && error.message === "live update requires a valid Telegram peer identity";
    }
  });
  expect(pushes).toEqual(expected);
  expect(refused).toEqual(refused.map(() => true));
});

/**
 * @test-id: tst_src_tg_033
 * @scenario: scn_tg_membership_001
 * @covers: plugins/sources/telegram/src/live.ts::TgClient.addLiveHandler
 * @covers: plugins/sources/telegram/src/subscriptions.ts::liveUpdatePushes
 * @deterministic: yes
 * @fixtures: dated GramJS UpdateChatParticipant and UpdateChannelParticipant values
 * Test environment: disconnected TelegramClient and actual event callbacks
 * Clients: TgClient.addLiveHandler and liveUpdatePushes
 * Mocks: none; no provider calls
 * Data: fixed participant, chat, channel and Telegram server timestamps
 */
test("tst_src_tg_033 dated membership ends retain Telegram's server time", () => {
  const client = new TelegramClient(new StringSession(""), 1, "hash", {});
  const pushes: ReturnType<typeof liveUpdatePushes> = [];
  new TgClient(client).addLiveHandler((update) => {
    pushes.push(...liveUpdatePushes(update, "account-1"));
  });
  const handlers = client.listEventHandlers();
  const raw = handlers[2];
  expect(raw).toBeDefined();
  if (raw === undefined) throw new Error("missing participant update handler");

  const participant = new Api.ChatParticipant({
    userId: bigInt(9001), inviterId: bigInt(7), date: 1_690_000_000,
  });
  raw[1](new Api.UpdateChatParticipant({
    chatId: bigInt(404), date: 1_700_000_000, actorId: bigInt(9001),
    userId: bigInt(9001), prevParticipant: participant, qts: 1,
  }));
  raw[1](new Api.UpdateChannelParticipant({
    channelId: bigInt(505), date: 1_700_000_060, actorId: bigInt(9),
    userId: bigInt(9001),
    prevParticipant: new Api.ChannelParticipantSelf({
      userId: bigInt(9001), inviterId: bigInt(7), date: 1_690_000_000,
    }),
    newParticipant: new Api.ChannelParticipantLeft({ peer: new Api.PeerUser({ userId: bigInt(9001) }) }),
    qts: 2,
  }));
  raw[1](new Api.UpdateChannelParticipant({
    channelId: bigInt(506), date: 1_700_000_090, actorId: bigInt(9),
    userId: bigInt(9001),
    prevParticipant: new Api.ChannelParticipantSelf({
      userId: bigInt(9001), inviterId: bigInt(7), date: 1_690_000_000,
    }),
    newParticipant: new Api.ChannelParticipantBanned({
      left: true,
      peer: new Api.PeerUser({ userId: bigInt(9001) }),
      kickedBy: bigInt(9),
      date: 1_700_000_090,
      bannedRights: new Api.ChatBannedRights({ untilDate: 0 }),
    }),
    qts: 3,
  }));
  raw[1](new Api.UpdateChannelParticipant({
    channelId: bigInt(507), date: 1_700_000_100, actorId: bigInt(9),
    userId: bigInt(9001),
    prevParticipant: new Api.ChannelParticipantSelf({
      userId: bigInt(9001), inviterId: bigInt(7), date: 1_690_000_000,
    }),
    newParticipant: new Api.ChannelParticipantBanned({
      left: false,
      peer: new Api.PeerUser({ userId: bigInt(9001) }),
      kickedBy: bigInt(9),
      date: 1_700_000_100,
      bannedRights: new Api.ChatBannedRights({ viewMessages: true, untilDate: 0 }),
    }),
    qts: 4,
  }));

  // A restriction that still permits reading the channel retains membership.
  raw[1](new Api.UpdateChannelParticipant({
    channelId: bigInt(508), date: 1_700_000_110, actorId: bigInt(9),
    userId: bigInt(9001),
    prevParticipant: new Api.ChannelParticipantSelf({
      userId: bigInt(9001), inviterId: bigInt(7), date: 1_690_000_000,
    }),
    newParticipant: new Api.ChannelParticipantBanned({
      left: false,
      peer: new Api.PeerUser({ userId: bigInt(9001) }),
      kickedBy: bigInt(9),
      date: 1_700_000_110,
      bannedRights: new Api.ChatBannedRights({ viewMessages: false, untilDate: 0 }),
    }),
    qts: 5,
  }));

  // Join and role changes keep membership true and emit no end.
  raw[1](new Api.UpdateChatParticipant({
    chatId: bigInt(606), date: 1_700_000_120, actorId: bigInt(7), userId: bigInt(9001),
    newParticipant: participant, qts: 4,
  }));
  raw[1](new Api.UpdateChatParticipant({
    chatId: bigInt(707), date: 1_700_000_180, actorId: bigInt(7), userId: bigInt(9001),
    prevParticipant: participant,
    newParticipant: new Api.ChatParticipantAdmin({
      userId: bigInt(9001), inviterId: bigInt(7), date: 1_690_000_000,
    }),
    qts: 5,
  }));

  const invalid = (chatId: number, userId: number, date: number) => new Api.UpdateChatParticipant({
    chatId: bigInt(chatId), date, actorId: bigInt(7), userId: bigInt(userId),
    prevParticipant: participant, qts: 6,
  });
  expect(() => raw[1](invalid(0, 9001, 1_700_000_240))).toThrow("chat_id");
  expect(() => raw[1](invalid(808, 0, 1_700_000_240))).toThrow("user_id");
  expect(() => raw[1](invalid(808, 9001, 0))).toThrow("date");

  expect(pushes).toEqual([
    {
      surface: "telegram",
      kind: "live",
      payload: {
        entity_type: "telegram_chat", chat_id: 404, top_message: 0,
        telegram_user_id: 9001, valid_until: "2023-11-14T22:13:20+00:00",
      },
      remote_id: "tg:chat:404",
    },
    {
      surface: "telegram",
      kind: "live",
      payload: {
        entity_type: "telegram_chat", chat_id: 505, top_message: 0,
        telegram_user_id: 9001, valid_until: "2023-11-14T22:14:20+00:00",
      },
      remote_id: "tg:chat:505",
    },
    {
      surface: "telegram",
      kind: "live",
      payload: {
        entity_type: "telegram_chat", chat_id: 506, top_message: 0,
        telegram_user_id: 9001, valid_until: "2023-11-14T22:14:50+00:00",
      },
      remote_id: "tg:chat:506",
    },
    {
      surface: "telegram",
      kind: "live",
      payload: {
        entity_type: "telegram_chat", chat_id: 507, top_message: 0,
        telegram_user_id: 9001, valid_until: "2023-11-14T22:15:00+00:00",
      },
      remote_id: "tg:chat:507",
    },
  ]);
});
