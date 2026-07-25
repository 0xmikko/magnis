/**
 * @layer: fe_agent
 * @test-id: tst_fe_agent_006
 *
 * RESOLUTION guard. The original bug was a
 * REGISTRATION defect: no renderer was registered for `set_trigger`, so the block
 * fell through to the generic ToolApprovalCard. The component tests
 * (TelegramSetTriggerRenderer / TelegramBatchSendRenderer) render the cards with
 * hand-built props — they do NOT prove a real `telegram.set_trigger` /
 * `telegram.batch_send` tool-call block RESOLVES to those renderers through
 * defineModule's action→toolName wiring. A wrong action string would keep the
 * component tests green while production silently reverts to the generic fallback.
 *
 * This test registers the ACTUAL telegram contribution and asserts resolution.
 */
import { describe, it, expect } from "vitest";
import { AgentContributionRegistry } from "@/runtime/agent/contributions";
import type { AgentHistoryBlock } from "@/runtime/contracts";
import { TelegramModule } from "../index";
import { TelegramSetTriggerRenderer } from "../TelegramSetTriggerRenderer";
import { TelegramBatchSendRenderer } from "../TelegramBatchSendRenderer";
import { TelegramToolCallRenderer } from "../TelegramToolCallRenderer";

function blockFor(toolName: string): AgentHistoryBlock {
  return { toolName } as AgentHistoryBlock;
}

describe("tst_fe_agent_006 — telegram set_trigger/batch_send blocks resolve to their cards", () => {
  const registry = new AgentContributionRegistry();
  const agent = TelegramModule.agent;
  if (!agent) throw new Error("TelegramModule.agent contribution is missing");
  registry.register(TelegramModule.id, agent);

  it("resolves telegram.set_trigger to TelegramSetTriggerRenderer (not the generic fallback)", () => {
    const reg = registry.resolveHistoryRenderer(blockFor("telegram.set_trigger"));
    expect(reg).not.toBeNull();
    expect(reg?.Render).toBe(TelegramSetTriggerRenderer);
  });

  it("resolves telegram.batch_send to TelegramBatchSendRenderer", () => {
    const reg = registry.resolveHistoryRenderer(blockFor("telegram.batch_send"));
    expect(reg).not.toBeNull();
    expect(reg?.Render).toBe(TelegramBatchSendRenderer);
  });

  // The same registration defect, found again in production: the module gained
  // a `messages.reply` write tool, the registry was never extended, and every
  // reply approval rendered as "Agent wants to: telegram messages reply" with a
  // raw "Chat ID: 12223076" line. Both spellings must resolve — defineModule
  // emits the dotted and underscored forms, and the agent has been observed
  // emitting the underscored one.
  it("resolves telegram.messages.reply to TelegramToolCallRenderer", () => {
    const reg = registry.resolveHistoryRenderer(blockFor("telegram.messages.reply"));
    expect(reg).not.toBeNull();
    expect(reg?.Render).toBe(TelegramToolCallRenderer);
  });

  it("resolves the underscored telegram_messages_reply too", () => {
    const reg = registry.resolveHistoryRenderer(blockFor("telegram_messages_reply"));
    expect(reg).not.toBeNull();
    expect(reg?.Render).toBe(TelegramToolCallRenderer);
  });

  it("does NOT resolve an unrelated telegram tool (falls through to the generic card)", () => {
    expect(registry.resolveHistoryRenderer(blockFor("telegram.capabilities"))).toBeNull();
  });
});
