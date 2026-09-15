/**
 * @layer: source_unit
 * @test-id: tst_source_mock_gmail_execute_001..002
 * @scenario: scn_server_eval_011
 * @invariant: INV-SERVER-2
 * @covers: plugins/sources/mock-gmail/src/execute.ts
 * @deterministic: yes
 * @fixtures: inline outbound email drafts
 */
import { describe, expect, it } from "vitest";

import { sendMessage } from "./execute";

describe("mock-gmail outbound execution", () => {
  it("tst_source_mock_gmail_execute_001 returns deterministic provider identity", async () => {
    const args = {
      action: "send_message",
      draft: {
        to: [{ address: "apple@store.com" }],
        cc: [],
        bcc: [],
        subject: "MacBook Pro price request",
        body_text: "Please send your best price.",
        body_html: null,
        in_reply_to: null,
      },
    };

    const first = await sendMessage(args);
    const second = await sendMessage(args);

    expect(second).toEqual(first);
    expect(first).toEqual({
      message_id: expect.stringMatching(/^mock-gmail-[0-9a-f]{32}$/),
      thread_id: expect.stringMatching(/^mock-gmail-thread-[0-9a-f]{32}$/),
    });
  });

  it("tst_source_mock_gmail_execute_002 rejects malformed drafts", async () => {
    await expect(sendMessage({ action: "send_message", draft: {} })).rejects.toThrow(
      /recipient/,
    );
  });
});
