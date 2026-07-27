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
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { AgentContributionRegistry } from "@/runtime/agent/contributions";
import type { AgentHistoryBlock } from "@/runtime/contracts";
import { ContactsModule } from "../index";
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
