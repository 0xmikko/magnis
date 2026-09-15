/**
 * @layer: module
 * @test-id: tst_module_contacts_write_001
 * @scenario: scn_contacts_write_001
 * @covers: plugins/modules/contacts/module/service.ts::create,batch_create,update,merge_preview,merge,search
 * @deterministic: yes
 * @fixtures: fixed contacts and strict graph/RPC/util doubles
 * @legacy-id: tst_contacts_create_persists_dictionary_no_email_entity
 * @legacy-id: tst_contacts_batch_create_idempotent_rows_no_email_entity
 * @legacy-id: tst_contacts_update_renames_entity_and_profile
 * @legacy-id: tst_contacts_merge_moves_the_dictionary_and_deletes_retired
 * @legacy-id: tst_contacts_search_returns_tool_result_sorted_and_limited
 */
import { describe, expect, it, vi } from "vitest";
import { entity, mockGraph, mountModule } from "@magnis/testkit/module";
import { CONTACT } from "../../schema.ts";
import { ContactsModule } from "../service.ts";

const CONTACT_ID = "66666666-6666-4666-8666-666666666666";

function contact(id: string, name: string, properties: Record<string, unknown> = {}) {
  return entity(id, name, { schema_id: CONTACT, properties });
}

describe("tst_module_contacts_write_001 — contact commands", () => {
  it("creates curated claims and delegates email identity ownership", async () => {
    const created = contact(CONTACT_ID, "Alice Smith", {
      phones: [{ phone: "+15551234567", type: null, is_primary: true }],
      role: "Founder",
    });
    let exists = false;
    const graph = mockGraph({
      get_entity: () => Promise.resolve(exists ? created : null),
      create_entity: () => {
        exists = true;
        return Promise.resolve(created);
      },
      update_properties: () => Promise.resolve(undefined),
      add_link: () => Promise.resolve(undefined),
      list_links_for_entities: () =>
        Promise.resolve([{ id: "identity-1", from_id: CONTACT_ID, to_id: "address-1", kind: "identity" }]),
      get_entities: () =>
        Promise.resolve([entity("address-1", "alice@example.test", { schema_id: "email.address" })]),
    });
    const execute = vi.fn(() => Promise.resolve({ id: "address-1" }));
    const module = mountModule(ContactsModule, { graph, rpc: { execute } }).module;

    const result = await module.create({
      name: "Alice Smith",
      email: "alice@example.test",
      phone: "+15551234567",
      role: "Founder",
      client_id: CONTACT_ID,
    });

    expect(result).toMatchObject({
      id: CONTACT_ID,
      name: "Alice Smith",
      email: "alice@example.test",
      phone: "+15551234567",
      role: "Founder",
      fields: { email_address_entity_id: "address-1" },
    });
    expect(graph.spies.create_entity).toHaveBeenCalledWith({
      schema_id: CONTACT,
      name: "Alice Smith",
      client_id: CONTACT_ID,
      idx: "alice smith",
    });
    expect(execute).toHaveBeenCalledWith("email.ensure_address", {
      address: "alice@example.test",
    });
  });

  it("derives stable row ids, skips exclusions, and is idempotent on retry", async () => {
    const rows = [
      "77777777-7777-4777-8777-777777777770",
      "77777777-7777-4777-8777-777777777771",
    ];
    const stored = new Map<string, ReturnType<typeof contact>>();
    const graph = mockGraph({
      get_entity: (id: string) => Promise.resolve(stored.get(id) ?? null),
      create_entity: (params: { client_id?: string; name: string }) => {
        const id = params.client_id ?? "generated";
        const value = contact(id, params.name);
        stored.set(id, value);
        return Promise.resolve(value);
      },
      list_links_for_entities: () => Promise.resolve([]),
    });
    const uuid_v5 = vi.fn((_namespace: string, name: string) =>
      Promise.resolve(rows[Number(name.at(-1))] ?? "unexpected"),
    );
    const module = mountModule(ContactsModule, {
      graph,
      util: { uuid_v5 },
    }).module;
    const params = {
      client_id: CONTACT_ID,
      contacts: [{ name: "Ann" }, { name: "Bob" }, { name: "Excluded" }],
      excluded_indices: [2],
    };

    const first = await module.batch_create(params);
    const retry = await module.batch_create(params);

    expect(first).toEqual({
      results: [
        { id: rows[0], name: "Ann", email: null, status: "created" },
        { id: rows[1], name: "Bob", email: null, status: "created" },
        { id: null, name: "Excluded", status: "excluded" },
      ],
      total: 3,
      created: 2,
      excluded: 1,
    });
    expect(retry.results.map((row) => row.id)).toEqual([rows[0], rows[1], null]);
    expect(graph.spies.create_entity).toHaveBeenCalledTimes(2);
    expect(uuid_v5).toHaveBeenCalledTimes(4);
  });

  it("validates the complete batch before creating its first row", async () => {
    const graph = mockGraph();
    const module = mountModule(ContactsModule, { graph }).module;

    await expect(module.batch_create({ contacts: [] })).rejects.toThrow("batch size must be 1..=50");
    await expect(module.batch_create({ contacts: [{ name: "Valid" }, { name: "  " }] })).rejects.toThrow(
      "contact[1]: missing or empty name",
    );
  });

  it("renames an existing contact and returns the fresh row", async () => {
    const old = contact(CONTACT_ID, "Old Name");
    const fresh = contact(CONTACT_ID, "New Name");
    let reads = 0;
    const graph = mockGraph({
      get_entity: () => Promise.resolve(reads++ === 0 ? old : fresh),
      update_entity_name: () => Promise.resolve(undefined),
      list_links_for_entities: () => Promise.resolve([]),
    });
    const module = mountModule(ContactsModule, { graph }).module;

    await expect(module.update({ id: CONTACT_ID, name: "New Name" })).resolves.toMatchObject({
      id: CONTACT_ID,
      name: "New Name",
    });
    expect(graph.spies.update_entity_name).toHaveBeenCalledWith(CONTACT_ID, "New Name");
  });

  it("delegates merge planning and re-derives the survivor name deterministically", async () => {
    const preview = {
      survivor: { id: CONTACT_ID },
      retired: { id: "retired" },
      sources: [],
      fields: {},
      links_to_repoint: 2,
      duplicate_links_to_remove: 0,
      reflexive_links_to_remove: 0,
    };
    const merged = {
      survivor_id: CONTACT_ID,
      retired_id: "retired",
      links_repointed: 2,
      links_deduplicated: 0,
      links_reflexive_removed: 0,
    };
    const graph = mockGraph({
      merge_preview: () => Promise.resolve(preview),
      merge_execute: () => Promise.resolve(merged),
      get_entity: () =>
        Promise.resolve(contact(CONTACT_ID, "Old", { first_name: "Ann", last_name: "Lee" })),
      update_entity_name: () => Promise.resolve(undefined),
      update_entity_idx: () => Promise.resolve(undefined),
    });
    const module = mountModule(ContactsModule, { graph }).module;

    await expect(
      module.merge_preview({ survivor_id: CONTACT_ID, retired_id: "retired" }),
    ).resolves.toBe(preview);
    await expect(
      module.merge({ survivor_id: CONTACT_ID, retired_id: "retired", reason: "duplicate" }),
    ).resolves.toBe(merged);
    expect(graph.spies.update_entity_name).toHaveBeenCalledWith(CONTACT_ID, "Ann Lee");
    expect(graph.spies.update_entity_idx).toHaveBeenCalledWith(CONTACT_ID, "ann lee");
  });

  it("bounds host search, then sorts the returned ToolResult by name and id", async () => {
    const graph = mockGraph({
      search_entities_by_name: () =>
        Promise.resolve([
          contact("b", "Bob"),
          contact("z", "Ann"),
          contact("a", "Ann"),
        ]),
    });
    const module = mountModule(ContactsModule, { graph }).module;

    const result = await module.search({ query: "a", limit: 500 });
    expect(graph.spies.search_entities_by_name).toHaveBeenCalledWith({
      query: "a",
      schema_ids: [CONTACT],
      limit: 50,
    });
    expect(JSON.parse(result.content[0]?.text ?? "null")).toEqual([
      { id: "a", name: "Ann", schema_id: CONTACT, schema_version: 1 },
      { id: "z", name: "Ann", schema_id: CONTACT, schema_version: 1 },
      { id: "b", name: "Bob", schema_id: CONTACT, schema_version: 1 },
    ]);
  });
});
