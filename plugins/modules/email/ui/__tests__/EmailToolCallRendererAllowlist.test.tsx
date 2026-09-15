import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  AgentRendererProps,
  AgentRuntime,
  AppRuntime,
  EntityRendererProps,
  ToolCallRendererPayload,
} from "@magnis/host/runtime";
import { EmailToolCallRenderer } from "../EmailToolCallRenderer";

function EmailEntity({ data }: EntityRendererProps): JSX.Element {
  return <div>Email entity: {String(data.subject)}</div>;
}

function makeProps(
  onAllowlistToggle: () => void,
): AgentRendererProps<ToolCallRendererPayload> {
  const agent = {
    resolveEntityRenderer: () => ({
      id: "email-entity",
      moduleId: "email",
      schemaMatch: "emails.message",
      Render: EmailEntity,
      hasMore: () => false,
    }),
  } as unknown as AgentRuntime;
  const runtime = {
    agent,
    transport: { rpc: () => Promise.resolve({}) },
  } as unknown as AppRuntime;

  return {
    payload: {
      toolCall: {
        id: "email-tool-1",
        name: "email.send",
        args: { to: "yc@example.com", subject: "YC" },
        status: "approved",
      },
      toolResult: {
        id: "email-tool-1",
        result: {
          id: "email-1",
          schema_id: "emails.message",
          subject: "YC",
        },
      },
      isAllowlisted: "dialog",
      superseded: false,
      onApprove: () => undefined,
      onDeny: () => undefined,
      onEdit: () => undefined,
      onAllowlistToggle,
    },
    runtime,
    agent,
  };
}

describe("EmailToolCallRenderer historical allowlist control", () => {
  /*
   * Test ID: tst_fe_allowlist_email_history_001
   * Scenario: scn_agent_allowlist_003
   * Covers: EmailToolCallRenderer.tsx::EmailToolCallRenderer
   * Deterministic: yes
   * Fixtures: approved email entity result with dialog permission
   */
  it("tst_fe_allowlist_email_history_001 preserves scoped revoke beside entity result", () => {
    const onRevoke = vi.fn();
    const view = render(<EmailToolCallRenderer {...makeProps(onRevoke)} />);

    expect(view.getByText("Email entity: YC")).toBeTruthy();
    fireEvent.click(view.getByText("Allowed in this dialog"));
    expect(onRevoke).toHaveBeenCalledTimes(1);
  });
});
