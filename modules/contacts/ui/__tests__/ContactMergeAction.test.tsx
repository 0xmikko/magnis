/**
 * @test-id: tst_fe_contacts_browser_002
 * @scenario: scn_contacts_browser_merge_001
 * @covers: modules/contacts/ui/ContactMergeAction.tsx::ContactMergeAction
 * @deterministic: yes
 * @fixtures: inline contact list and merge preview
 *
 * Test environment: vitest happy-dom plugin UI lane
 * Clients: Testing Library
 * Mocks: AppRuntime transport
 * Data: fixed survivor and retired contacts
 */
import type { MergePreview, MergeResult } from "@magnis/sdk";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AppRuntime } from "@magnis/host/runtime";
import { ContactMergeAction } from "../ContactMergeAction";

describe("tst_fe_contacts_browser_002 browser contact merge", () => {
  it("loads a real preview and confirms the selected pair through contacts.merge", async () => {
    const rpc = vi.fn((method: string) => {
      if (method === "contacts.list") {
        return Promise.resolve({
          items: [
            { id: "survivor", name: "Ada" },
            { id: "retired", name: "Ada Duplicate" },
          ],
          total: 2,
          limit: 100,
          offset: 0,
        });
      }
      if (method === "contacts.merge_preview") {
        const preview: MergePreview = {
          survivor: { id: "survivor", name: "Ada", schemaId: "contacts.person", propertyCount: 1, linkCount: 2 },
          retired: { id: "retired", name: "Ada Duplicate", schemaId: "contacts.person", propertyCount: 1, linkCount: 2 },
          sources: [],
          fields: {
            email: {
              key: "email",
              survivorValue: "ada@example.com",
              retiredValue: null,
              autoResolved: "ada@example.com",
              conflict: false,
            },
          },
          linksToRepoint: 2,
          duplicateLinksToRemove: 0,
          reflexiveLinksToRemove: 0,
        };
        return Promise.resolve(preview);
      }
      if (method === "contacts.merge") {
        const merged: MergeResult = {
          survivorId: "survivor",
          retiredId: "retired",
          linksRepointed: 2,
          linksDeduplicated: 0,
          linksReflexiveRemoved: 0,
        };
        return Promise.resolve(merged);
      }
      return Promise.reject(new Error(`unexpected RPC: ${method}`));
    });
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    const runtime = {
      transport: { rpc },
      queryClient: { invalidateQueries },
    } as unknown as AppRuntime;

    const view = render(<ContactMergeAction entityId="survivor" runtime={runtime} />);
    fireEvent.click(view.getByRole("button", { name: "Merge contact" }));

    expect(await view.findByText("Ada Duplicate")).toBeTruthy();
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("contacts.merge_preview", {
        survivorId: "survivor",
        retiredId: "retired",
      }),
    );

    fireEvent.click(view.getByRole("button", { name: "Confirm Merge" }));

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("contacts.merge", {
        survivorId: "survivor",
        retiredId: "retired",
        preview: false,
        overrides: [],
        reason: null,
      }),
    );
    expect(await view.findByText("Contacts merged successfully")).toBeTruthy();
  });
});
