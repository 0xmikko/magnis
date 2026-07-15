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
});
