/**
 * @layer: fe_agent
 * @test-id: tst_agent_prompt_005
 *
 * DEC-6 / INV-8: the telegram MODULE prompt (not just the global system prompt)
 * steers multi-recipient outreach to telegram.batch_send + one approval, rather
 * than fanning out N sends / one trigger per contact.
 */
import { describe, it, expect } from "vitest";
import { telegramAgentContribution } from "../index";

describe("tst_agent_prompt_005 — telegram module prompt steers batch outreach", () => {
  it("mentions telegram.batch_send, ONE approval, and warns against fan-out", () => {
    const prompt = telegramAgentContribution.systemPrompt ?? "";
    expect(prompt).toContain("telegram.batch_send");
    expect(prompt).toContain("ONE approval");
    expect(prompt).toContain("fan out");
  });
});
