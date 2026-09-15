import { describe, expect, test } from "bun:test";
import { RateLimitError } from "@magnis/connector-sdk";
import { emitMeeting, emitMessage, rateLimitNextFetch } from "./dataset";
import { fetchMockGmail } from "./fetch";

describe("mock-gmail dataset actions", () => {
  test("tst_conn_mockgmail_dataset_001 emits a stable production-shaped live envelope", async () => {
    const args = {
      action: "emit_message",
      invocation_id: "inv-1",
      action_time: "2026-08-05T10:00:00Z",
      settings: {},
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

  test("tst_conn_mockgmail_dataset_005 carries the recipients so the module can link who was written to", async () => {
    const result = await emitMessage({
      action: "emit_message",
      invocation_id: "inv-5",
      action_time: "2026-08-05T10:00:00Z",
      settings: {},
      payload: {
        message_id: "m-5",
        from_address: "owner@example.test",
        to_addresses: "nora.venn@north.example, pavel@example.test",
        cc_addresses: "hana.ward@example.test",
        subject: "Re: the ask",
        body_text: "Answered on Telegram, see there.",
        sent_at: "2026-08-05T10:00:00Z",
      },
    });
    expect(result.envelopes[0]!.payload).toMatchObject({
      from_address: "owner@example.test",
      to_addresses: "nora.venn@north.example, pavel@example.test",
      cc_addresses: "hana.ward@example.test",
    });
    // a message without recipients stays exactly as it was: no empty recipient fields
    const bare = await emitMessage({
      action: "emit_message",
      invocation_id: "inv-5b",
      action_time: "2026-08-05T10:00:00Z",
      settings: {},
      payload: { message_id: "m-5b", from_address: "a@example.test", subject: "s", body_text: "b", sent_at: "2026-08-05T10:00:00Z" },
    });
    expect(Object.keys(bare.envelopes[0]!.payload)).not.toContain("to_addresses");
  });

  test("tst_conn_mockgmail_dataset_002 rejects malformed payload", async () => {
    expect(
      emitMessage({
        action: "emit_message",
        invocation_id: "inv-2",
        action_time: "2026-08-05T10:00:00Z",
        settings: {},
        payload: {},
      }),
    ).rejects.toThrow(/message_id/);
  });

  test("tst_conn_mockgmail_dataset_003 emits a production-shaped meeting envelope", async () => {
    const result = await emitMeeting({
      action: "emit_meeting",
      invocation_id: "inv-meeting-1",
      action_time: "2026-08-05T10:00:00Z",
      settings: {},
      payload: {
        event_id: "demo-call",
        title: "Magnis demo",
        starts_at: "2026-08-05T10:00:00Z",
        ends_at: "2026-08-05T10:30:00Z",
        location: "Google Meet",
        attendees: [
          { name: "Ava Chen", email: "ava@magnis.test" },
          { email: "daniel@example.test" },
        ],
      },
    });

    expect(result.envelopes).toEqual([
      {
        surface: "meetings",
        remote_id: "dataset:inv-meeting-1:0",
        kind: "live",
        payload: {
          id: "demo-call",
          title: "Magnis demo",
          starts_at: "2026-08-05T10:00:00Z",
          ends_at: "2026-08-05T10:30:00Z",
          location: "Google Meet",
          status: "confirmed",
          attendees: [
            { name: "Ava Chen", email: "ava@magnis.test" },
            { email: "daniel@example.test" },
          ],
        },
      },
    ]);
  });

  /**
   * @test-id: tst_conn_mockgmail_dataset_004
   * @scenario: scn_mock_gmail_rate_limit_001
   * @covers: plugins/sources/mock-gmail/src/dataset.ts::rateLimitNextFetch
   * @deterministic: yes
   * @fixtures: inline dataset action and empty poll queue
   */
  test("tst_conn_mockgmail_dataset_004 rate-limits exactly the next fetch", async () => {
    const result = await rateLimitNextFetch({
      action: "rate_limit_next_fetch",
      invocation_id: "inv-rate-limit-1",
      action_time: "2026-08-05T10:00:00Z",
      settings: {},
      payload: { retry_after_secs: 12 },
    });

    expect(result.envelopes).toEqual([
      {
        surface: "email",
        remote_id: "dataset:inv-rate-limit-1:0",
        kind: "live",
        payload: {
          message_id: "rate-limit:inv-rate-limit-1",
          from_address: "rate-limit@mock-gmail.test",
          from_name: "Mock Gmail",
          subject: "[E2E] Rate-limit administration",
          body_text: "The next mock-Gmail fetch is configured to return a rate limit.",
          sent_at: "2026-08-05T10:00:00Z",
          has_attachments: false,
          attachments: [],
        },
      },
    ]);
    await expect(fetchMockGmail({ surface: "email" })).rejects.toEqual(
      new RateLimitError(12),
    );
    expect(await fetchMockGmail({ surface: "email" })).toEqual({
      envelopes: [],
      nextCursor: null,
      hasMore: false,
    });
  });
});
