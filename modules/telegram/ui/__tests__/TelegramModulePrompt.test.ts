/**
 * @layer: fe_agent
 * @test-id: tst_agent_prompt_005
 *
 * The telegram MODULE prompt (not just the global system prompt)
 * steers multi-recipient outreach to create(telegram.message, messages) + one approval, rather
 * than fanning out N sends / one trigger per contact.
 */
import { describe, it, expect } from "vitest";
import { telegramAgentContribution } from "../index";

describe("tst_agent_prompt_005 — telegram module prompt steers batch outreach", () => {
  it("names the current batch form, ONE approval, and warns against fan-out", () => {
    const prompt = telegramAgentContribution.systemPrompt ?? "";
    expect(prompt).toContain('create("telegram.message", {messages:[...]})');
    expect(prompt).not.toContain("telegram.batch_send");
    expect(prompt).toContain("ONE approval");
    expect(prompt).toContain("fan out");
  });
});
