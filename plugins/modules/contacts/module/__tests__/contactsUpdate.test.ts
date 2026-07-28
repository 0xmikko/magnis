import { describe, expect, it, vi } from "vitest";
import { entity, mockGraph, mountModule, type MockGraph } from "@magnis/testkit/module";
import { ContactsModule } from "../service.ts";
import type { ContactCanonical, ContactFacets } from "../../types.ts";

type G = MockGraph<ContactFacets, ContactCanonical>;

describe("contacts update", () => {
  it("tst_plugin_contacts_update_001 enriches a Telegram-minted person through owned facets", async () => {
    const graph: G = mockGraph<ContactFacets, ContactCanonical>({
      get_entity: () => Promise.resolve(entity("c1", "Telegram Person", { schema_id: "contacts.person" })),
      update_entity_name: () => Promise.resolve(undefined),
      attach_facet: () => Promise.resolve({ id: "facet-1" }),
      add_link: () => Promise.resolve(undefined),
      get_canonical: () => Promise.resolve({}),
      list_facets_for_entity: () => Promise.resolve([]),
    });
    const execute = vi.fn(() => Promise.resolve({ id: "email-address-1" }));
    const module = mountModule<ContactsModule, ContactFacets, ContactCanonical>(ContactsModule, {
      graph,
      ctx: { extension_id: "contacts" },
      rpc: { execute },
    }).module;

    await module.update({
      id: "c1",
      name: "Kenji Watanabe",
      email: "kenji@lumenlabs.example",
      username: "kenji_w",
      bio: "Head of Partnerships at Lumen Labs",
    });

    expect(graph.spies.attach_facet).toHaveBeenCalledWith({
      entity_id: "c1",
      schema_id: "contacts.person.profile",
      data: {
        first_name: "Kenji Watanabe",
        username: "kenji_w",
        bio: "Head of Partnerships at Lumen Labs",
      },
      external_id: "contacts:update:profile:c1",
    });
    expect(graph.spies.attach_facet).toHaveBeenCalledWith({
      entity_id: "c1",
      schema_id: "contacts.person.email",
      data: { email: "kenji@lumenlabs.example", is_primary: true },
      external_id: "contacts:update:email:c1",
    });
    expect(execute).toHaveBeenCalledWith("email.ensure_address", {
      address: "kenji@lumenlabs.example",
    });
    expect(graph.spies.add_link).toHaveBeenCalledWith({
      from_id: "c1",
      to_id: "email-address-1",
      kind: "has_email",
    });
  });
});
