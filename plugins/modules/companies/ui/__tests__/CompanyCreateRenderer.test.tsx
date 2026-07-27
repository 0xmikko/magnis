import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type {
  AgentRendererProps,
  AgentRuntime,
  AppRuntime,
  ToolCallRendererPayload,
} from "@magnis/host/runtime";
import { CompanyCreateRenderer } from "../CompanyCreateRenderer";
import { CompaniesModule } from "../index";

function makeUpdateProps(): AgentRendererProps<ToolCallRendererPayload> {
  return {
    payload: {
      toolCall: {
        id: "tc-company-update",
        name: "companies_update",
        args: {
          id: "company-acme",
          summary: "Security platform and strategic partner",
          industry: "Security / Bug Bounty",
        },
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

describe("company tool call cards", () => {
  /**
   * @test-id: tst_fe_companies_allowlist_001
   * @scenario: scn_agent_allowlist_003
   * @covers: plugins-public/plugins/modules/companies/ui/index.tsx
   * @covers: plugins-public/plugins/modules/companies/ui/CompanyCreateRenderer.tsx
   * @deterministic: yes
   * @fixtures: generic companies_update approval
   */
  it("tst_fe_companies_allowlist_001 registers and renders company update approvals", () => {
    const agent = CompaniesModule.agent;
    if (!agent) throw new Error("CompaniesModule.agent missing");

    const renderer = agent.historyRenderers?.find((registration) =>
      registration.match({
        id: "tc-company-update",
        kind: "tool_call",
        toolName: "companies_update",
        payload: {
          args: {
            id: "company-acme",
            summary: "Security platform and strategic partner",
          },
          status: "pending",
        },
      }),
    );
    expect(renderer).toBeDefined();

    expect(
      agent.extractAllowlistTarget?.({
        name: "companies_update",
        args: { id: "company-acme" },
      }),
    ).toEqual({
      action: "companies.update",
      targetType: "tool_action",
      targetId: "companies.update",
      targetLabel: "Update company",
    });

    const { container } = render(
      <div data-theme="light">
        <CompanyCreateRenderer {...makeUpdateProps()} />
      </div>,
    );

    expect(screen.getByText("Update company")).toBeTruthy();
    expect(screen.getByText("Security platform and strategic partner")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Update$/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Allowlist" })).toBeTruthy();
    expect(container.textContent).not.toContain("Agent wants to");
  });
});
