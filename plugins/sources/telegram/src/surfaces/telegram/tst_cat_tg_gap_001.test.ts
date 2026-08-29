import { describe, expect, test } from "bun:test";

import type { EntityLike, MessageLike, RawDialogLike } from "../../client";
import { runCatchup, type CatchupDialog, type TgOps } from "./commands";

interface HistoryCall {
  readonly chatId: number;
  readonly limit: number | undefined;
  readonly offsetId: number | undefined;
}

function entity(id: number): EntityLike {
  return { className: "User", id, firstName: `User ${String(id)}` };
}

function dialog(chatId: number, topMessage: number): CatchupDialog {
  const raw: RawDialogLike = {
    className: "Dialog",
    pinned: false,
    topMessage,
    unreadCount: 0,
  };
  return { entity: entity(chatId), raw, pinned: false, peer: chatId };
}

function message(id: number): MessageLike {
  return { id, message: `message ${String(id)}`, date: 1767225600, out: false };
}

function range(first: number, last: number): number[] {
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

function gapOps(calls: HistoryCall[]): TgOps {
  const histories = new Map<number, readonly number[]>([
    [1, range(1, 42)],
    [2, range(83, 102)],
  ]);
  return {
    async listDialogs(): Promise<CatchupDialog[]> {
      return [dialog(1, 42), dialog(2, 102)];
    },
    async resolvePeer(chatId) {
      return chatId;
    },
    async getMessages(peer, params) {
      const chatId = peer as number;
      calls.push({ chatId, limit: params.limit, offsetId: params.offsetId });
      const descending = [...(histories.get(chatId) ?? [])].sort((left, right) => right - left);
      const offsetId = params.offsetId;
      const belowOffset =
        offsetId === undefined
          ? descending
          : descending.filter((messageId) => messageId < offsetId);
      return belowOffset.slice(0, params.limit).map(message);
    },
    async sendMessage() {
      throw new Error("not used");
    },
    async downloadMedia() {
      throw new Error("not used");
    },
  };
}

function messageIds(page: Record<string, unknown>, chatId: number): number[] {
  return (page.envelopes as Record<string, unknown>[])
    .filter((envelope) => String(envelope.remote_id).startsWith(`tg:msg:${String(chatId)}:`))
    .map((envelope) => (envelope.payload as Record<string, unknown>).message_id as number);
}

function chats(page: Record<string, unknown>): Record<string, Record<string, unknown>> {
  return (page.nextCursor as Record<string, unknown>).chats as Record<
    string,
    Record<string, unknown>
  >;
}

/**
 * @test-id: tst_cat_tg_gap_001
 * @scenario: scn_tg_sync_003
 * @covers: plugins/sources/telegram/src/surfaces/telegram/commands.ts::runCatchup
 * @deterministic: yes
 * @fixtures: inline two-chat Telegram history with one gap larger than 20 messages
 *
 * Test environment: direct Telegram command handler with a deterministic provider fake.
 * Clients: direct calls.
 * Mocks: fixture-backed TgOps; no Telegram network or credentials.
 * Data: legacy per-chat watermarks plus fixed message ids 1..42 and 83..102.
 */
describe("tst_cat_tg_gap_001 Telegram crash-safe CatchUp", () => {
  test("tst_cat_tg_gap_001 drains every page before promoting each legacy watermark", async () => {
    const calls: HistoryCall[] = [];
    const ops = gapOps(calls);
    const legacyCursor = {
      date: "2026-01-01T00:00:00+00:00",
      chats: {
        "1": { last_msg_id: 7 },
        "2": { last_msg_id: 90 },
        "3": { last_msg_id: 55 },
      },
    };

    const first = await runCatchup(ops, "account-1", legacyCursor);
    expect(first.hasMore).toBe(true);
    expect(messageIds(first, 1)).toEqual(range(23, 42).reverse());
    expect(messageIds(first, 2)).toEqual(range(91, 102).reverse());
    expect(chats(first)).toMatchObject({
      "1": { last_msg_id: 7, target_last_msg_id: 42, before_message_id: 23 },
      "2": { last_msg_id: 102 },
      "3": { last_msg_id: 55 },
    });
    expect(chats(first)["1"]).not.toHaveProperty("last_msg_id", 42);
    expect(calls).toEqual([
      { chatId: 1, limit: 20, offsetId: 43 },
      { chatId: 2, limit: 20, offsetId: 103 },
    ]);

    const firstMessage = (first.envelopes as Record<string, unknown>[]).find(
      (envelope) => envelope.remote_id === "tg:msg:1:42",
    );
    expect(firstMessage?.cursor).toEqual({ chat_id: 1, message_id: 42 });

    // A crash before the host commits the intermediate cursor replays the exact
    // stable remote ids. Graph admission is therefore idempotent and no item is
    // skipped even though the provider page is requested again.
    const replay = await runCatchup(gapOps([]), "account-1", legacyCursor);
    expect(
      (replay.envelopes as Record<string, unknown>[]).map((envelope) => envelope.remote_id),
    ).toEqual(
      (first.envelopes as Record<string, unknown>[]).map((envelope) => envelope.remote_id),
    );
    expect(chats(replay)).toEqual(chats(first));

    // A crash after committing the opaque intermediate cursor resumes below 23.
    // Chat 2 is already complete and is not fetched again; chat 1 promotes only
    // after this page crosses its old committed watermark at message 7.
    calls.length = 0;
    const terminal = await runCatchup(ops, "account-1", first.nextCursor);
    expect(terminal.hasMore).toBe(false);
    expect(messageIds(terminal, 1)).toEqual(range(8, 22).reverse());
    expect(messageIds(terminal, 2)).toEqual([]);
    expect(chats(terminal)).toEqual({
      "1": { last_msg_id: 42 },
      "2": { last_msg_id: 102 },
      "3": { last_msg_id: 55 },
    });
    expect(calls).toEqual([{ chatId: 1, limit: 20, offsetId: 23 }]);

    const uniqueGapIds = new Set([...messageIds(first, 1), ...messageIds(terminal, 1)]);
    expect([...uniqueGapIds].sort((left, right) => left - right)).toEqual(range(8, 42));
  });

  /**
   * @test-id: tst_cat_tg_gap_002
   * @scenario: scn_tg_sync_003
   * @covers: plugins/sources/telegram/src/surfaces/telegram/commands.ts::catchupProgress
   * @deterministic: yes
   * @fixtures: malformed intermediate cursor below its committed watermark
   */
  test("tst_cat_tg_gap_002 rejects a continuation outside its committed gap", async () => {
    for (const beforeMessageId of [6, 44]) {
      const calls: HistoryCall[] = [];
      const malformedCursor = {
        chats: {
          "1": {
            last_msg_id: 7,
            target_last_msg_id: 42,
            before_message_id: beforeMessageId,
          },
          "2": { last_msg_id: 102 },
        },
      };

      await expect(runCatchup(gapOps(calls), "account-1", malformedCursor)).rejects.toThrow(
        "telegram CatchUp cursor continuation is outside its committed gap",
      );
      expect(calls).toEqual([]);
    }
  });

  /**
   * @test-id: tst_cat_tg_gap_003
   * @scenario: scn_tg_sync_003
   * @covers: plugins/sources/telegram/src/surfaces/telegram/commands.ts::runCatchup
   * @deterministic: yes
   * @fixtures: pending cursor whose chat is absent from the provider dialog snapshot
   */
  test("tst_cat_tg_gap_003 rejects an absent pending chat instead of spinning hasMore", async () => {
    const calls: HistoryCall[] = [];
    const cursor = {
      chats: {
        "1": { last_msg_id: 42 },
        "2": { last_msg_id: 102 },
        "3": { last_msg_id: 55, target_last_msg_id: 70, before_message_id: 60 },
      },
    };

    await expect(runCatchup(gapOps(calls), "account-1", cursor)).rejects.toThrow(
      "telegram CatchUp pending chat '3' is absent from the dialog snapshot",
    );
    expect(calls).toEqual([]);
  });
});
