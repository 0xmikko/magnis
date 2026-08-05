import { describe, expect, test } from "bun:test";
import { emitMessage } from "./dataset";

describe("mock-gmail dataset actions", () => {
  test("tst_conn_mockgmail_dataset_001 emits a stable production-shaped live envelope", async () => {
    const args = {
      action: "emit_message",
      invocation_id: "inv-1",
      action_time: "2026-08-05T10:00:00Z",
      payload: {
        message_id: "m-1",
        from_address: "daniel@example.test",
        subject: "Following up",
        body_text: "Still on for Friday?",
        sent_at: "2026-08-05T10:00:00Z",
      },
    };
    const first = await emitMessage(args);
    const retry = await emitMessage(args);
    expect(retry).toEqual(first);
    expect(first.envelopes).toEqual([
      {
        surface: "email",
        remote_id: "dataset:inv-1:0",
        kind: "live",
        payload: {
          message_id: "m-1",
          from_address: "daniel@example.test",
          from_name: "",
          subject: "Following up",
          body_text: "Still on for Friday?",
          sent_at: "2026-08-05T10:00:00Z",
          has_attachments: false,
          attachments: [],
        },
      },
    ]);
  });

  test("tst_conn_mockgmail_dataset_002 rejects malformed payload", async () => {
    expect(
      emitMessage({
        action: "emit_message",
        invocation_id: "inv-2",
        action_time: "2026-08-05T10:00:00Z",
        payload: {},
      }),
    ).rejects.toThrow(/message_id/);
  });
});

