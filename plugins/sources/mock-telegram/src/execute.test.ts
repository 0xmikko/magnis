/**
 * @layer: source_unit
 * @test-id: tst_source_mock_telegram_execute_001..002
 * @scenario: scn_telegram_send_001
 * @invariant: deterministic mock sends return a provider-shaped numeric identity
 * @covers: plugins/sources/mock-telegram/src/execute.ts
 * @deterministic: yes
 * @fixtures: inline outbound Telegram messages
 */
import { describe, expect, it } from "vitest";

import { sendMessage } from "./execute";

describe("mock-telegram outbound execution", () => {
  it("tst_source_mock_telegram_execute_001 returns deterministic provider identity", async () => {
    const args = {
      action: "send_message",
      chat_id: 4242,
      text: "Ship the deterministic stand",
    };

    const first = await sendMessage(args);
    const second = await sendMessage(args);

    expect(second).toEqual(first);
    expect(first).toEqual({
      action: "send_message",
      chat_id: 4242,
      message_id: expect.any(Number),
      recorded: true,
      text: "Ship the deterministic stand",
    });
    expect(first.message_id).toBeLessThan(0);
  });

  it("tst_source_mock_telegram_execute_002 rejects malformed messages", async () => {
    await expect(sendMessage({ action: "send_message", chat_id: 4242 })).rejects.toThrow(
      /text/,
    );
  });
});
