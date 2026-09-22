/**
 * @layer: fe_agent
 * @test-id: tst_fe_agent_010
 *
 * RESOLUTION guard for the merge pair.
 *
 * `contacts.merge` has a card. `contacts.merge_preview` does not — and must
 * not: it is a READ tool whose entire payload is already shown by the merge
 * card, which fetches the preview itself over RPC. When the agent also calls
 * it explicitly (it does, once per candidate pair), every call landed in the
 * transcript as a bare "contacts merge preview" row with no content. Seven
 * duplicate clusters meant seven empty rows above the cards that mattered.
 *
 * The existing e2e guard (tst_fe_scn_contacts_merge_003) counts "Confirm
 * Merge" buttons, and an empty preview row has none — so it stayed green
 * while the noise was plainly visible on screen. This asserts the thing that
 * actually broke: the preview resolves to a renderer, and that renderer draws
 * nothing.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { AgentContributionRegistry } from "@/runtime/agent/contributions";
import type { AgentHistoryBlock } from "@/runtime/contracts";
import { ContactsModule } from "../index";
import type { AgentRuntime, AppRuntime, ToolCallRendererPayload } from "@magnis/host/runtime";
import { ContactMergeRenderer } from "../ContactMergeRenderer";
import { ContactMergePreviewSilent } from "../ContactMergeRenderer";

function blockFor(toolName: string): AgentHistoryBlock {
  return { toolName } as AgentHistoryBlock;
}

describe("tst_fe_agent_010 — contacts merge blocks resolve correctly", () => {
  const registry = new AgentContributionRegistry();
  const agent = ContactsModule.agent;
  if (!agent) throw new Error("ContactsModule.agent contribution is missing");
  registry.register(ContactsModule.id, agent);

  it("resolves contacts.merge to the comparison card", () => {
    const reg = registry.resolveHistoryRenderer(blockFor("contacts.merge"));
    expect(reg?.Render).toBe(ContactMergeRenderer);
  });

  it("resolves contacts.merge_preview to the silent renderer, not the generic card", () => {
    const reg = registry.resolveHistoryRenderer(blockFor("contacts.merge_preview"));
    expect(reg).not.toBeNull();
    expect(reg?.Render).toBe(ContactMergePreviewSilent);
  });

  it("resolves the underscored contacts_merge_preview too", () => {
    const reg = registry.resolveHistoryRenderer(blockFor("contacts_merge_preview"));
    expect(reg?.Render).toBe(ContactMergePreviewSilent);
  });

  it("the silent renderer draws nothing at all", () => {
    const { container } = render(<ContactMergePreviewSilent />);
    expect(container.textContent).toBe("");
    expect(container.firstChild).toBeNull();
  });
});

/** @test-id: tst_fe_contact_merge_preview_001
 * @scenario: scn_compact_merge_preview_001
 * @covers: plugins/modules/contacts/ui/ContactMergeRenderer.tsx
 * @deterministic: yes
 * @fixtures: completed read-only merge result
 */
it.each([false, true])("renders compact merge preview without claiming or approving a merge (MCP %s)", (enveloped) => {
  const rpc = vi.fn();
  const onApprove = vi.fn();
  const payload: ToolCallRendererPayload = {
    toolCall: { id: "preview", name: "merge", toolBinding: { entity: "contacts.person", operation: "merge" },
      args: { survivor_id: "a", retired_id: "b", preview: true }, status: "approved" },
    toolResult: { id: "preview", result: {
      survivor: { id: "a", name: "Ada", property_count: 1 }, retired: { id: "b", name: "Grace", property_count: 1 },
      fields: { name: { key: "name", survivor_value: "Ada", retired_value: "Grace", auto_resolved: "Ada" } },
      links_to_repoint: 2, duplicate_links_to_remove: 0,
    } }, isAllowlisted: false, onApprove, onDeny: vi.fn(), onEdit: vi.fn(), onAllowlistToggle: vi.fn(),
  };
  const result = payload.toolResult;
  if (result === undefined) throw new Error("preview result missing");
  const renderedPayload = enveloped ? { ...payload, toolResult: { ...result, result: { content: [{ type: "text", text: JSON.stringify(result.result) }] } } } : payload;
  const view = render(<ContactMergeRenderer payload={renderedPayload} runtime={{ transport: { rpc } } as unknown as AppRuntime} agent={{} as AgentRuntime} />);
  expect(view.getByText("Grace")).toBeTruthy();
  expect(view.queryByText("Merged", { exact: true })).toBeNull();
  expect(view.queryByRole("button", { name: "Confirm Merge" })).toBeNull();
  expect(view.queryByText("Contacts merged successfully")).toBeNull();
  expect(rpc).not.toHaveBeenCalled();
  expect(onApprove).not.toHaveBeenCalled();
});
