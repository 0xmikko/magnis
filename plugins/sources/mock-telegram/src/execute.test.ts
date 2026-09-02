/**
 * @test-id: tst_source_mock_telegram_execute_001
 * @scenario: scn_telegram_send_001
 * @covers: plugins/sources/mock-telegram/src/execute.ts::sendMessage
 * @deterministic: yes
 * @fixtures: fixed Telegram send payloads
 */
import { describe, expect, it } from "vitest";

import { sendMessage } from "./execute";

describe("mock-telegram execute", () => {
  it("tst_source_mock_telegram_execute_001 returns a stable delivery receipt", async () => {
    const request = { action: "send_message", chat_id: 4242, text: "Ship it" };

    const first = await sendMessage(request);
    const replay = await sendMessage(request);

    expect(first).toEqual(replay);
    expect(first).toEqual({ message_id: expect.any(Number), recorded: true });
    expect(first.message_id).toBeGreaterThan(0);
  });

  /**
   * @test-id: tst_source_mock_telegram_execute_002
   * @scenario: scn_telegram_send_validation_001
   * @covers: plugins/sources/mock-telegram/src/execute.ts::sendMessage
   * @deterministic: yes
   * @fixtures: malformed fixed Telegram send payload
   */
  it("tst_source_mock_telegram_execute_002 rejects malformed sends", async () => {
    await expect(sendMessage({ action: "send_message", chat_id: 0, text: "" }))
      .rejects.toThrow("invalid send_message");
  });
});
