/**
 * @test-id: tst_fe_contacts_browser_002
 * @scenario: scn_contacts_browser_merge_001
 * @covers: plugins/modules/contacts/ui/ContactMergeAction.tsx::ContactMergeAction
 * @deterministic: yes
 * @fixtures: inline contact list and merge preview
 *
 * Test environment: vitest happy-dom plugin UI lane
 * Clients: Testing Library
 * Mocks: AppRuntime transport
 * Data: fixed survivor and retired contacts
 */
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
        return Promise.resolve({
          survivor: { id: "survivor", name: "Ada", property_count: 1 },
          retired: { id: "retired", name: "Ada Duplicate", property_count: 1 },
          fields: {
            email: {
              key: "email",
              survivor_value: "ada@example.com",
              retired_value: null,
              auto_resolved: "ada@example.com",
            },
          },
          links_to_repoint: 2,
          duplicate_links_to_remove: 0,
        });
      }
      if (method === "contacts.merge") {
        return Promise.resolve({
          survivor_id: "survivor",
          retired_id: "retired",
          links_repointed: 2,
          links_deduplicated: 0,
        });
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
        survivor_id: "survivor",
        retired_id: "retired",
      }),
    );

    fireEvent.click(view.getByRole("button", { name: "Confirm Merge" }));

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("contacts.merge", {
        survivor_id: "survivor",
        retired_id: "retired",
        overrides: [],
      }),
    );
    expect(await view.findByText("Contacts merged successfully")).toBeTruthy();
  });
});
