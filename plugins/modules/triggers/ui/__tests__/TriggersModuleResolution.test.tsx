/**
 * @layer: fe_agent
 * @test-id: tst_fe_agent_triggers_001
 *
 * Regression guard for the two user-visible trigger integration gaps:
 * `triggers.update` must use the trigger approval card, and the triggers
 * contribution must expose a real module surface so entity navigation does
 * not land on an empty headless route.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AgentContributionRegistry } from "@/runtime/agent/contributions";
import type { AgentHistoryBlock } from "@/runtime/contracts";
import type {
  AgentRendererProps,
  AgentRuntime,
  AppRuntime,
  ToolCallRendererPayload,
} from "@magnis/host/runtime";
import { TriggersModule } from "../index";
import { TriggerToolCallRenderer } from "../TriggerToolCallRenderer";

function propsFor(name: string): AgentRendererProps<ToolCallRendererPayload> {
  return {
    payload: {
      toolCall: {
        id: `tc-${name}`,
        name,
        args: { id: "trigger-1", name: "Vendor quote tracker" },
        status: "pending",
      },
      isAllowlisted: false,
      superseded: false,
      onApprove: () => undefined,
      onDeny: () => undefined,
      onEdit: () => undefined,
      onAllowlistToggle: () => undefined,
    },
    runtime: {} as AppRuntime,
    agent: {} as AgentRuntime,
  };
}

describe("tst_fe_agent_triggers_001 — trigger update renderer and module surface", () => {
  it.each(["triggers.update", "triggers_update"])(
    "resolves %s to TriggerToolCallRenderer",
    (toolName) => {
      const registry = new AgentContributionRegistry();
      if (!TriggersModule.agent) throw new Error("TriggersModule.agent is missing");
      registry.register(TriggersModule.id, TriggersModule.agent);

      const resolved = registry.resolveHistoryRenderer({ toolName } as AgentHistoryBlock);

      expect(resolved?.Render).toBe(TriggerToolCallRenderer);
    },
  );

  it("exposes a visible module component and sidebar icon", () => {
    expect(TriggersModule.Component).toBeTypeOf("function");
    expect(TriggersModule.icon).toBeTruthy();
  });

  it.each([
    ["triggers.create", "Create"],
    ["triggers.update", "Update"],
  ])("renders %s with the correct action label", (toolName, label) => {
    render(<TriggerToolCallRenderer {...propsFor(toolName)} />);
    expect(screen.getByRole("button", { name: new RegExp(`${label}$`) })).toBeTruthy();
  });

  it("maps create and update approvals to separate allowlist targets", () => {
    const extract = TriggersModule.agent?.extractAllowlistTarget;
    if (!extract) throw new Error("TriggersModule allowlist extractor missing");

    expect(extract({ name: "triggers.create", args: {} })).toEqual({
      action: "triggers.create",
      targetType: "tool_action",
      targetId: "triggers.create",
      targetLabel: "Create trigger",
    });
    expect(extract({ name: "triggers_update", args: { id: "trigger-1" } })).toEqual({
      action: "triggers.update",
      targetType: "tool_action",
      targetId: "triggers.update",
      targetLabel: "Update trigger",
    });
  });
});
