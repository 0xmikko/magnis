/**
 * @layer: fe_agent
 * @test-id: tst_fe_agent_006
 *
 * INV-7 / INV-5b [DEC-7/DEC-4] — RESOLUTION guard. The original P4 bug was a
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

  it("does NOT resolve an unrelated telegram tool (falls through to the generic card)", () => {
    expect(registry.resolveHistoryRenderer(blockFor("telegram.capabilities"))).toBeNull();
  });
});
