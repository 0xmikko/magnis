import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ContactBatchCreateRenderer } from "../ContactBatchCreateRenderer";
import { ContactCreateRenderer } from "../ContactCreateRenderer";
import type {
  AgentRendererProps,
  AgentRuntime,
  AppRuntime,
  ToolCallRendererPayload,
} from "@magnis/host/runtime";

function makeRuntime(): AppRuntime {
  return {
    queryClient: {} as AppRuntime["queryClient"],
    transport: {} as AppRuntime["transport"],
    stores: {} as AppRuntime["stores"],
    modules: { get: () => undefined } as unknown as AppRuntime["modules"],
    agent: { resolveEntityRenderer: () => null } as unknown as AppRuntime["agent"],
    composer: {} as AppRuntime["composer"],
  };
}

function makeAgent(): AgentRuntime {
  return {
    store: {} as AgentRuntime["store"],
    chat: {} as AgentRuntime["chat"],
    registerContribution: () => () => undefined,
    setActiveContext: () => undefined,
    setReplyTo: () => undefined,
    send: () => Promise.resolve(),
    approveToolCall: () => Promise.resolve(),
    denyToolCall: () => Promise.resolve(),
    requestDraft: () => undefined,
    resolveEntityRenderer: () => null,
    navigateToEntity: () => false,
    resolveHistoryRenderer: () => null,
    resolveTodoRenderer: () => null,
    resolveAllowlistTarget: () => null,
    resolveSystemPrompt: () => undefined,
    dispatchContextAction: () => undefined,
  };
}

function makePayload(
  args: unknown,
  overrides: Partial<ToolCallRendererPayload> = {},
): ToolCallRendererPayload {
  return {
    toolCall: {
      id: "tc-1",
      name: "contacts.create",
      args,
      status: "pending",
    },
    isAllowlisted: false,
    superseded: false,
    onApprove: vi.fn(),
    onDeny: vi.fn(),
    onEdit: vi.fn(),
    onAllowlistToggle: vi.fn(),
    ...overrides,
  };
}

function renderCreateCard(
  payload: ToolCallRendererPayload,
): ReturnType<typeof render> {
  const props: AgentRendererProps<ToolCallRendererPayload> = {
    payload,
    runtime: makeRuntime(),
    agent: makeAgent(),
  };

  return render(
    <div data-theme="light">
      <ContactCreateRenderer {...props} />
    </div>,
  );
}

function renderBatchCard(
  payload: ToolCallRendererPayload,
): ReturnType<typeof render> {
  const props: AgentRendererProps<ToolCallRendererPayload> = {
    payload,
    runtime: makeRuntime(),
    agent: makeAgent(),
  };

  return render(
    <div data-theme="light">
      <ContactBatchCreateRenderer {...props} />
    </div>,
  );
}

describe("contact tool call cards", () => {
  it("uses theme-aware purple surface tokens for single-contact approval cards", () => {
    const { container } = renderCreateCard(
      makePayload({
        name: "Pasha",
        email: "pasha@example.com",
      }),
    );

    const card = container.querySelector(".rounded-xl.border");
    if (!(card instanceof HTMLElement)) {
      throw new Error("expected tool card root");
    }

    expect(card.className).toContain("border-[var(--color-agent-tool-purple-border)]");
    expect(card.className).toContain("bg-[var(--color-agent-tool-purple-bg)]");

    const fieldLabel = screen.getByText("Name:");
    expect(fieldLabel.className).toContain("text-[var(--color-agent-tool-purple-text)]");

    const primaryButton = screen.getByRole("button", { name: /Create$/ });
    expect(primaryButton.className).toContain("bg-[var(--color-agent-tool-purple-primary)]");
  });

  it("uses theme-aware purple tokens for batch contact approval actions", () => {
    renderBatchCard(
      makePayload({
        contacts: [
          {
            name: "Pasha",
            email: "pasha@example.com",
          },
        ],
      }, {
        toolCall: {
          id: "tc-2",
          name: "contacts.batch_create",
          args: {
            contacts: [
              {
                name: "Pasha",
                email: "pasha@example.com",
              },
            ],
          },
          status: "pending",
        },
      }),
    );

    const fieldLabel = screen.getByText("Name:");
    expect(fieldLabel.className).toContain("text-[var(--color-agent-tool-purple-text)]");

    const primaryButton = screen.getByRole("button", { name: /Create 1 contact$/ });
    expect(primaryButton.className).toContain("bg-[var(--color-agent-tool-purple-primary)]");
  });
});
