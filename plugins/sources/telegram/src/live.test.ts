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
import { LiveDialogPager, TgClient } from "./live";
import { messageToIntermediate, MTPROTO_REQUEST_TIMEOUT_MS } from "./client";
import { liveUpdatePushes } from "./subscriptions";
import { messagePayload } from "./surfaces/telegram/envelope";
import { messageRemoteId } from "./surfaces/telegram/schema";

/**
 * @test-id: tst_src_tg_025
 * @scenario: scn_tg_sync_004
 * @covers: plugins/sources/telegram/src/live.ts::LiveDialogPager.dialogPage
 * @deterministic: yes
 * @fixtures: short and pinned-overflow gramjs DialogsSlice, typed FloodWait
 *
 * Test environment: Telegram source live paging seam
 * Clients: direct calls
 * Mocks: TelegramClient.invoke and TgClient.getMessages
 * Data: short DialogsSlice with an unresolved trailing dialog
 */
test("tst_src_tg_025 metadata-only pages retain every pin, respect read budgets and surface FloodWait", async () => {
  const resolvedPeer = new Api.PeerChat({ chatId: bigInt(101) });
  const unresolvedPeer = new Api.PeerChat({ chatId: bigInt(202) });
  const response = new Api.messages.DialogsSlice({
    count: 3,
    dialogs: [
      new Api.Dialog({
        peer: resolvedPeer,
        topMessage: 11,
        readInboxMaxId: 11,
        readOutboxMaxId: 11,
        unreadCount: 0,
        unreadMentionsCount: 0,
        unreadReactionsCount: 0,
        notifySettings: new Api.PeerNotifySettings({}),
      }),
      new Api.Dialog({
        peer: unresolvedPeer,
        topMessage: 22,
        readInboxMaxId: 22,
        readOutboxMaxId: 22,
        unreadCount: 0,
        unreadMentionsCount: 0,
        unreadReactionsCount: 0,
        notifySettings: new Api.PeerNotifySettings({}),
      }),
    ],
    messages: [
      Object.assign(new Api.MessageEmpty({ id: 11, peerId: resolvedPeer }), { date: 1_700_000_011 }),
      Object.assign(new Api.MessageEmpty({ id: 22, peerId: unresolvedPeer }), { date: 1_700_000_022 }),
    ],
    chats: [new Api.ChatForbidden({ id: bigInt(101), title: "Resolved" })],
    users: [],
  });
  const telegramClient = new TelegramClient(new StringSession(""), 1, "hash", {});
  const tg = new TgClient(telegramClient);
  const invoke = spyOn(telegramClient, "invoke").mockResolvedValue(response);
  const getMessages = spyOn(tg, "getMessages").mockResolvedValue([]);
  const timers = spyOn(globalThis, "setTimeout");

  try {
    const page = await new LiveDialogPager(tg, "account-1").dialogPage(null, 50);

    expect(page.total).toBe(3);
    expect(page.dialogs).toHaveLength(1);
    expect(page.next_offset).toEqual({
      offset_date: 1_700_000_011,
      offset_id: 11,
      offset_peer: { ty: "chat", id: 101 },
    });

    const overflow = dialogSlice(1, 151, 300);
    for (const dialog of overflow.dialogs.slice(0, 150)) {
      if (dialog instanceof Api.Dialog) dialog.pinned = true;
    }
    invoke.mockResolvedValueOnce(overflow);
    getMessages.mockClear();
    timers.mockClear();
    const metadata = await new LiveDialogPager(tg, "account-1").dialogPage(null, 100, {
      hydrateMessages: false, timeoutMs: 1500,
    });
    expect(metadata.dialogs).toHaveLength(151);
    expect(metadata.dialogs.filter(({ chat }) => chat.is_pinned)).toHaveLength(150);
    expect(metadata.dialogs.every(({ messages }) => messages.length === 0)).toBe(true);
    const metadataHistoryCalls = getMessages.mock.calls.length;
    expect(metadata.next_offset?.offset_id).toBe(151);
    const metadataHasPeer = metadata.dialogs[150]?.peer === overflow.chats[150];
    const metadataTimeouts = timers.mock.calls.map((call) => call[1]);

    const peers = [new Api.PeerChannel({ channelId: bigInt(1) }), new Api.PeerChannel({ channelId: bigInt(2) })];
    const collision = new Api.messages.DialogsSlice({
      count: 3,
      dialogs: peers.map((peer) => new Api.Dialog({
        peer, topMessage: 7, readInboxMaxId: 7, readOutboxMaxId: 7, unreadCount: 0,
        unreadMentionsCount: 0, unreadReactionsCount: 0, notifySettings: new Api.PeerNotifySettings({}),
      })),
      // Same channel-local message ID; the other peer's date comes LAST.
      messages: [
        new Api.Message({ id: 7, peerId: peers[1], date: 1_700_000_020, message: "fixture" }),
        new Api.Message({ id: 7, peerId: peers[0], date: 1_700_000_010, message: "fixture" }),
      ],
      chats: [1, 2].map((id) => new Api.ChannelForbidden({
        id: bigInt(id), accessHash: bigInt(100 + id), title: "Fixture channel",
      })),
      users: [],
    });
    invoke.mockResolvedValueOnce(collision);
    const collisionPage = await new LiveDialogPager(tg, "account-1").dialogPage(null, 2, {
      hydrateMessages: false, timeoutMs: 1500,
    });

    const flood = new FloodWaitError({ capture: 25 });
    invoke.mockRejectedValueOnce(flood);
    await expect(new LiveDialogPager(tg, "account-1").dialogPage(null, 100, {
      hydrateMessages: false, timeoutMs: 1500,
    })).rejects.toBe(flood);

    const connect = spyOn(TelegramClient.prototype, "connect").mockResolvedValue(true);
    let floodThreshold: number | undefined;
    try {
      const configured = await TgClient.connect({ api_id: 1, api_hash: "hash", session: "" });
      floodThreshold = configured.client.floodSleepThreshold;
    } finally { connect.mockRestore(); }
    expect({ metadataHistoryCalls, metadataHasPeer, metadataTimeouts, floodThreshold,
      collisionOffset: collisionPage.next_offset }).toEqual({
      metadataHistoryCalls: 0, metadataHasPeer: true, metadataTimeouts: [1500], floodThreshold: 0,
      collisionOffset: { offset_date: 1_700_000_020, offset_id: 7,
        offset_peer: { ty: "channel", id: 2, access_hash: 102 } },
    });
  } finally {
    timers.mockRestore();
    invoke.mockRestore();
    getMessages.mockRestore();
  }
});

function dialogSlice(first: number, size = 100, total = 300): Api.messages.DialogsSlice {
  const ids = Array.from({ length: size }, (_, index) => first + index);
  return new Api.messages.DialogsSlice({
    count: total,
    dialogs: ids.map((id) => new Api.Dialog({
      peer: new Api.PeerChat({ chatId: bigInt(id) }),
      topMessage: id,
      readInboxMaxId: id,
      readOutboxMaxId: id,
      unreadCount: 0,
      unreadMentionsCount: 0,
      unreadReactionsCount: 0,
      notifySettings: new Api.PeerNotifySettings({}),
    })),
    messages: ids.map((id) => new Api.Message({
      id, peerId: new Api.PeerChat({ chatId: bigInt(id) }),
      date: 1_700_000_000 - id, message: "fixture",
    })),
    chats: ids.map((id) => new Api.ChatForbidden({ id: bigInt(id), title: `Chat ${id}` })),
    users: [],
  });
}

/**
 * @test-id: tst_src_tg_026
 * @scenario: scn_tg_sync_005
 * @covers: plugins/sources/telegram/src/live.ts::TgClient.resolvePeer
 * @deterministic: yes
 * @fixtures: inline MTProto DialogsSlice
 * Test environment: real GramJS iterator, disconnected TelegramClient
 * Clients: TgClient.resolvePeer
 * Mocks: TelegramClient.invoke only; a needless next request fails
 * Data: 100 dialogs; target on first page; no personal data
 */
test("tst_src_tg_026 peer lookup stops on its first page and reuses cached peers", async () => {
  const client = new TelegramClient(new StringSession(""), 1, "hash", {});
  const tg = new TgClient(client);
  const page = dialogSlice(1);
  const invoke = spyOn(client, "invoke").mockResolvedValueOnce(page)
    .mockRejectedValue(new Error("unnecessary next dialog page"));
  try {
    expect(await tg.resolvePeer(10)).toBe(page.chats[9]);
    expect(await tg.resolvePeer(10)).toBe(page.chats[9]);
    expect(await tg.resolvePeer(3)).toBe(page.chats[2]);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0]?.[0]).toBeInstanceOf(Api.messages.GetDialogs);
  } finally { invoke.mockRestore(); }
});

/**
 * @test-id: tst_src_tg_027
 * @scenario: scn_tg_sync_005
 * @covers: plugins/sources/telegram/src/live.ts::TgClient.resolvePeer
 * @deterministic: yes
 * @fixtures: two full MTProto dialog pages
 * Test environment: real GramJS iterator, disconnected TelegramClient
 * Clients: TgClient.resolvePeer
 * Mocks: TelegramClient.invoke only
 * Data: target beyond first 100 dialogs
 */
test("tst_src_tg_027 peer lookup reaches later pages without collecting the remaining account", async () => {
  const client = new TelegramClient(new StringSession(""), 1, "hash", {});
  const tg = new TgClient(client);
  const later = dialogSlice(101);
  const sentOffsets: number[] = [];
  const invoke = spyOn(client, "invoke").mockImplementationOnce(async (request) => {
    if (!(request instanceof Api.messages.GetDialogs)) throw new Error("unexpected request");
    sentOffsets.push(request.offsetId);
    return dialogSlice(1);
  }).mockImplementationOnce(async (request) => {
    if (!(request instanceof Api.messages.GetDialogs)) throw new Error("unexpected request");
    sentOffsets.push(request.offsetId);
    expect(request.excludePinned).toBe(true);
    return later;
  }).mockRejectedValue(new Error("unnecessary third page"));
  try {
    expect(await tg.resolvePeer(110)).toBe(later.chats[9]);
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(sentOffsets).toEqual([0, 100]);
  } finally { invoke.mockRestore(); }
});

/**
 * @test-id: tst_src_tg_028
 * @scenario: scn_tg_sync_006
 * @covers: plugins/sources/telegram/src/live.ts::TgClient.resolvePeer
 * @deterministic: yes
 * @fixtures: empty MTProto dialogs and typed FloodWait
 * Test environment: real GramJS iterator, disconnected TelegramClient
 * Clients: TgClient.resolvePeer
 * Mocks: TelegramClient.invoke only
 * Data: missing target and rate-limited request; no fabricated empty success
 */
test("tst_src_tg_028 missing peers, FloodWait and lookup deadline stay explicit without retries", async () => {
  const client = new TelegramClient(new StringSession(""), 1, "hash", {});
  const tg = new TgClient(client);
  const flood = new FloodWaitError({ capture: 25 });
  const invoke = spyOn(client, "invoke").mockResolvedValueOnce(dialogSlice(1, 0, 0))
    .mockRejectedValueOnce(flood);
  try {
    await expect(tg.resolvePeer(10)).rejects.toThrow("chat 10 not found in any dialog");
    await expect(tg.resolvePeer(10)).rejects.toBe(flood);
    expect(invoke).toHaveBeenCalledTimes(2);
    const clock = spyOn(Date, "now").mockReturnValue(0);
    try {
      invoke.mockImplementationOnce(async () => {
        clock.mockReturnValue(MTPROTO_REQUEST_TIMEOUT_MS + 1);
        return dialogSlice(1);
      }).mockRejectedValue(new Error("lookup continued after deadline"));
      await expect(tg.resolvePeer(150)).rejects.toThrow("getDialogs(resolvePeer) timed out");
      expect(invoke).toHaveBeenCalledTimes(3);
    } finally { clock.mockRestore(); }
  } finally { invoke.mockRestore(); }
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
      expected.push({ payload: messagePayload(history), remote_id: messageRemoteId(chatId, message.id) });
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
