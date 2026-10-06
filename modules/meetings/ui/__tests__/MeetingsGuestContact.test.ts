/**
 * @test-id: tst_fe_meetings_guest_contact_001
 * @scenario: scn_meetings_guest_contact_001
 * @covers: modules/meetings/ui/MeetingsDetail.tsx::createGuestContact
 * @deterministic: yes
 * @fixtures: inline RPC double
 *
 * Test environment: vitest happy-dom plugin UI lane
 * Clients: direct calls
 * Mocks: AppRuntime transport
 * Data: one unknown guest with an address
 *
 * A guest the graph does not know becomes a contact from the meeting. The
 * contacts hub takes no email, so the meeting composes the parts: the hub
 * creates the person by name, email ensures the guest's address, and an
 * identity link joins them, so the guest resolves to that person next time.
 */
import { describe, expect, it, vi } from "vitest";
import type { AppRuntime } from "@magnis/host/runtime";
import { createGuestContact } from "../MeetingsDetail";

describe("tst_fe_meetings_guest_contact_001 a guest becomes a contact", () => {
  it("creates the person by name and links the guest's address to it", async () => {
    const rpc = vi.fn((method: string) => {
      if (method === "contacts.create") return Promise.resolve({ id: "person-1" });
      if (method === "email.ensure_address") return Promise.resolve({ id: "address-1" });
      if (method === "companies.list") return Promise.resolve({ items: [] });
      return Promise.resolve(undefined);
    });
    const runtime = { transport: { rpc } } as unknown as AppRuntime;

    const id = await createGuestContact(runtime, { name: "Anna", email: "anna@acme.test" });

    // @tested-by: tst_fe_meetings_guest_contact_001
    // @invariant: the hub is created without an email; the address and the
    // identity link come from the meeting's own composition.
    expect(id).toBe("person-1");
    expect(rpc).toHaveBeenCalledWith("contacts.create", { name: "Anna" });
    expect(rpc).toHaveBeenCalledWith("email.ensure_address", { address: "anna@acme.test" });
    expect(rpc).toHaveBeenCalledWith("graph.link.add", { from: "person-1", to: "address-1", kind: "identity" });
  });
});
