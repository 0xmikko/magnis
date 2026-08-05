import { describe, expect, test } from "bun:test";
import { emitChat, emitMessage } from "./dataset";

describe("mock-telegram dataset actions", () => {
  test("tst_conn_mocktelegram_dataset_001 emits deterministic live chat", async () => {
    const args = {
      action: "emit_chat",
      invocation_id: "inv-chat",
      action_time: "2026-08-05T10:00:00Z",
      payload: { chat_id: 7, title: "Acme", chat_type: "group" },
    };
    const result = await emitChat(args);
    expect(await emitChat(args)).toEqual(result);
    expect(result.envelopes[0]).toMatchObject({
      surface: "telegram",
      remote_id: "dataset:inv-chat:0",
      kind: "live",
      payload: { chat_id: 7, title: "Acme", type: "group" },
    });
  });

  test("tst_conn_mocktelegram_dataset_002 emits production-shaped message", async () => {
    const result = await emitMessage({
      action: "emit_message",
      invocation_id: "inv-message",
      action_time: "2026-08-05T10:00:00Z",
      payload: {
        chat_id: 7,
        message_id: 42,
        text: "Ship it",
        date: "2026-08-05T10:00:00Z",
        reply_to_message_id: 41,
      },
    });
    expect(result.envelopes[0]).toMatchObject({
      remote_id: "dataset:inv-message:0",
      payload: { message_id: 42, chat_id: 7, reply_to_msg_id: 41 },
    });
  });

  test("tst_conn_mocktelegram_dataset_003 rejects missing required ids", async () => {
    expect(
      emitMessage({
        action: "emit_message",
        invocation_id: "bad",
        action_time: "2026-08-05T10:00:00Z",
        payload: {},
      }),
    ).rejects.toThrow(/invalid/);
  });
});

