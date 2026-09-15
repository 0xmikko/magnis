import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProjectCreateRenderer } from "../ProjectCreateRenderer";
import { ProjectsModule } from "../index";
import type {
  AgentRendererProps,
  AgentRuntime,
  AppRuntime,
  ToolCallRendererPayload,
} from "@magnis/host/runtime";

function makeProps(): AgentRendererProps<ToolCallRendererPayload> {
  return {
    payload: {
      toolCall: {
        id: "tc-project",
        name: "projects.create",
        args: { name: "КП: посадка кустов", status: "active" },
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

function makeUpdateProps(): AgentRendererProps<ToolCallRendererPayload> {
  return {
    ...makeProps(),
    payload: {
      ...makeProps().payload,
      toolCall: {
        id: "tc-project-update",
        name: "projects_update",
        args: {
          id: "project-acme",
          description: "Project research summary",
        },
        status: "pending",
      },
    },
  };
}

describe("project tool call cards", () => {
  it("registers a module renderer for projects.create approvals", () => {
    expect(ProjectsModule.agent).toBeDefined();
    const agent = ProjectsModule.agent;
    if (!agent) {
      throw new Error("ProjectsModule.agent missing");
    }
    const renderer = agent.historyRenderers?.find((reg) =>
      reg.match({
        id: "tc-project",
        kind: "tool_call",
        toolName: "projects.create",
        payload: { args: { name: "New project" }, status: "pending" },
      }),
    );

    expect(renderer).toBeDefined();
  });

  it("renders a project-specific creation card instead of the generic approval text", () => {
    const { container } = render(
      <div data-theme="light">
        <ProjectCreateRenderer {...makeProps()} />
      </div>,
    );

    expect(screen.getByText("Create project: КП: посадка кустов")).toBeTruthy();
    expect(screen.getByText("Name:")).toBeTruthy();
    expect(screen.getByText("Status:")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Create$/ })).toBeTruthy();
    expect(container.textContent).not.toContain("Agent wants to");
  });

  /*
   * Test ID: tst_fe_projects_allowlist_001
   * Scenario: scn_agent_allowlist_002
   * Covers: plugins-public/plugins/modules/projects/ui/index.tsx
   * Deterministic: yes
   * Fixtures: generic projects_update approval
   */
  it("tst_fe_projects_allowlist_001 registers and renders project update approvals", () => {
    const agent = ProjectsModule.agent;
    if (!agent) throw new Error("ProjectsModule.agent missing");
    const renderer = agent.historyRenderers?.find((reg) =>
      reg.match({
        id: "tc-project-update",
        kind: "tool_call",
        toolName: "projects_update",
        payload: {
          args: { id: "project-acme", description: "Project research summary" },
          status: "pending",
        },
      }),
    );
    expect(renderer).toBeDefined();

    const { container } = render(
      <div data-theme="light">
        <ProjectCreateRenderer {...makeUpdateProps()} />
      </div>,
    );
    expect(screen.getByText("Update project")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Update$/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Allowlist" })).toBeTruthy();
    expect(container.textContent).not.toContain("Agent wants to");
    expect(container.textContent).not.toContain("Untitled project");
  });
});
