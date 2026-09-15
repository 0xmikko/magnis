/**
 * @test-id: tst_fe_contacts_browser_001
 * @scenario: scn_contacts_browser_create_001
 * @covers: plugins/modules/contacts/ui/index.tsx::createContactFromHeader
 * @deterministic: yes
 * @fixtures: inline RPC double
 *
 * Test environment: vitest happy-dom plugin UI lane
 * Clients: direct calls
 * Mocks: AppRuntime transport
 * Data: fixed created contact id
 */
import { describe, expect, it, vi } from "vitest";
import type { AppRuntime } from "@magnis/host/runtime";
import { createContactFromHeader } from "../index";

describe("tst_fe_contacts_browser_001 browser contact creation", () => {
  it("creates a contact and selects the returned id", async () => {
    const rpc = vi.fn().mockResolvedValue({ id: "contact-created" });
    const onCreated = vi.fn();
    const runtime = { transport: { rpc } } as unknown as AppRuntime;

    await createContactFromHeader(runtime, onCreated);

    expect(rpc).toHaveBeenCalledWith(
      "contacts.create",
      expect.objectContaining({ name: "New Contact", client_id: expect.any(String) }),
    );
    expect(onCreated).toHaveBeenCalledWith("contact-created");
  });
});
