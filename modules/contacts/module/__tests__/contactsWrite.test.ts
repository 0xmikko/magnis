/**
 * @layer: module
 * @test-id: tst_module_contacts_write_001
 * @scenario: scn_contacts_write_001
 * @covers: modules/contacts/module/service.ts::create,batch_create,update,merge_preview,merge,search
 * @deterministic: yes
 * @fixtures: fixed contacts and strict graph/RPC/util doubles
 * @legacy-id: tst_contacts_create_persists_dictionary_no_email_entity
 * @legacy-id: tst_contacts_batch_create_idempotent_rows_no_email_entity
 *
 * @test-id: tst_module_contacts_write_002
 * @scenario: scn_contacts_write_001
 * @covers: modules/contacts/module/service.ts::create,batch_create
 * @deterministic: yes
 * @fixtures: strict graph/RPC doubles
 * @legacy-id: tst_contacts_update_renames_entity_and_profile
 * @legacy-id: tst_contacts_merge_moves_the_dictionary_and_deletes_retired
 * @legacy-id: tst_contacts_search_returns_tool_result_sorted_and_limited
 */
import type { JsonObject, MergePreview, MergeResult } from "@magnis/sdk";
import { describe, expect, it, vi } from "vitest";
import { entityId, entityRead, entityExtras, entity, link, mockGraph, mountModule } from "@magnis/testkit/module";
import { CONTACT } from "../../schema.ts";
import { ContactsModule } from "../service.ts";

const CONTACT_ID = entityId("66666666-6666-4666-8666-666666666666");

function contact(id: string, name: string, properties: JsonObject = {}) {
  return entity(id, name, { schemaId: CONTACT, properties });
}

describe("tst_module_contacts_write_001 — contact commands", () => {
  it("creates curated claims and nothing beside them", async () => {
    const created = contact(CONTACT_ID, "Alice Smith", {
      phones: [{ phone: "+15551234567", type: null, is_primary: true }],
      role: "Founder",
    });
    let exists = false;
    const graph = mockGraph({
      getEntity: (_id, opts) => Promise.resolve(exists ? opts?.extras ? entityRead(created, entityExtras()) : created : null),
      createEntity: () => {
        exists = true;
        return Promise.resolve(created);
      },
      updateProperties: () => Promise.resolve(undefined),
      listLinksForEntities: () => Promise.resolve([]),
    });
    const execute = vi.fn();
    const module = mountModule(ContactsModule, { graph, rpc: { execute } }).module;

    const result = await module.create({
      name: "Alice Smith",
      phone: "+15551234567",
      role: "Founder",
      client_id: CONTACT_ID,
    });

    expect(result).toMatchObject({
      id: CONTACT_ID,
      name: "Alice Smith",
      phone: "+15551234567",
      role: "Founder",
      fields: { name: "Alice Smith", role: "Founder" },
    });
    expect(graph.spies.createEntity).toHaveBeenCalledWith({
      schemaId: CONTACT,
      name: "Alice Smith",
      clientId: CONTACT_ID,
      idx: "alice smith",
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("derives stable row ids, skips exclusions, and is idempotent on retry", async () => {
    const rows = [
      "77777777-7777-4777-8777-777777777770",
      "77777777-7777-4777-8777-777777777771",
    ];
    const stored = new Map<string, ReturnType<typeof contact>>();
    const graph = mockGraph({
      getEntity: async (id, opts) => { const value = stored.get(id); return value === undefined ? null : opts?.extras ? entityRead(value, entityExtras()) : value; },
      createEntity: (params: { clientId?: string; name: string }) => {
        const id = params.clientId ?? "generated";
        const value = contact(id, params.name);
        stored.set(id, value);
        return Promise.resolve(value);
      },
      listLinksForEntities: () => Promise.resolve([]),
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

    const first = await module.create(params);
    const retry = await module.create(params);

    expect(first).toEqual({
      results: [
        { id: rows[0], name: "Ann", status: "created" },
        { id: rows[1], name: "Bob", status: "created" },
        { id: null, name: "Excluded", status: "excluded" },
      ],
      total: 3,
      created: 2,
      excluded: 1,
    });
    expect(retry.results.map((row) => row.id)).toEqual([rows[0], rows[1], null]);
    expect(graph.spies.createEntity).toHaveBeenCalledTimes(2);
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
      getEntity: (_id, opts) => Promise.resolve(opts?.extras ? entityRead(fresh, entityExtras()) : reads++ === 0 ? old : fresh),
      updateEntityName: () => Promise.resolve(undefined),
      listLinksForEntities: () => Promise.resolve([]),
    });
    const module = mountModule(ContactsModule, { graph }).module;

    await expect(module.update({ id: CONTACT_ID, name: "New Name" })).resolves.toMatchObject({
      id: CONTACT_ID,
      name: "New Name",
    });
    expect(graph.spies.updateEntityName).toHaveBeenCalledWith(CONTACT_ID, "New Name");
  });

  it("delegates merge planning and re-derives the survivor name deterministically", async () => {
    const preview: MergePreview = {
      survivor: { id: CONTACT_ID, name: "Old", schemaId: CONTACT, propertyCount: 2, linkCount: 2 },
      retired: { id: entityId("retired"), name: "Ann", schemaId: CONTACT, propertyCount: 0, linkCount: 2 },
      sources: [],
      fields: {},
      linksToRepoint: 2,
      duplicateLinksToRemove: 0,
      reflexiveLinksToRemove: 0,
    };
    const merged: MergeResult = {
      survivorId: CONTACT_ID,
      retiredId: entityId("retired"),
      linksRepointed: 2,
      linksDeduplicated: 0,
      linksReflexiveRemoved: 0,
    };
    const graph = mockGraph({
      mergePreview: () => Promise.resolve(preview),
      mergeExecute: () => Promise.resolve(merged),
      getEntity: () =>
        Promise.resolve(contact(CONTACT_ID, "Old", { first_name: "Ann", last_name: "Lee" })),
      updateEntityName: () => Promise.resolve(undefined),
      updateEntityIdx: () => Promise.resolve(undefined),
    });
    const module = mountModule(ContactsModule, { graph }).module;

    await expect(
      module.merge({ survivorId: CONTACT_ID, retiredId: entityId("retired"), preview: true, overrides: [], reason: null }),
    ).resolves.toBe(preview);
    expect(graph.spies.mergeExecute).not.toHaveBeenCalled();
    expect(graph.spies.updateEntityName).not.toHaveBeenCalled();
    await expect(
      module.merge({ survivorId: CONTACT_ID, retiredId: entityId("retired"), preview: false, reason: "duplicate", overrides: [{ key: "first_name", value: "Ann" }] }),
    ).resolves.toBe(merged);
    expect(graph.spies.mergeExecute).toHaveBeenCalledExactlyOnceWith({ survivorId: CONTACT_ID, retiredId: entityId("retired"), reason: "duplicate", overrides: [{ key: "first_name", value: "Ann" }] });
    expect(graph.spies.updateEntityName).toHaveBeenCalledWith(CONTACT_ID, "Ann Lee");
    expect(graph.spies.updateEntityIdx).toHaveBeenCalledWith(CONTACT_ID, "ann lee");
  });

  it.each([
    { preview: true, foreignId: CONTACT_ID },
    { preview: false, foreignId: CONTACT_ID },
    { preview: true, foreignId: entityId("retired") },
    { preview: false, foreignId: entityId("retired") },
  ])("rejects non-contact $foreignId before merge (preview=$preview)", async ({ preview, foreignId }) => {
    const graph = mockGraph({
      getEntity: (id: string) => Promise.resolve(id === foreignId
        ? entity(id, "Company", { schemaId: "companies.company" })
        : contact(id, "Contact")),
      mergePreview: () => Promise.reject(new Error("Preview must not run")),
      mergeExecute: () => Promise.reject(new Error("Merge must not run")),
    });
    const module = mountModule(ContactsModule, { graph }).module;

    await expect(module.merge({ survivorId: CONTACT_ID, retiredId: entityId("retired"), preview, overrides: [], reason: null }))
      .rejects.toThrow(`contact not found: ${foreignId}`);
    expect(graph.spies.mergePreview).not.toHaveBeenCalled();
    expect(graph.spies.mergeExecute).not.toHaveBeenCalled();
  });

  it("bounds host search, then sorts the returned ToolResult by name and id", async () => {
    const graph = mockGraph({
      searchEntitiesByName: () =>
        Promise.resolve([
          contact("b", "Bob"),
          contact("z", "Ann"),
          contact("a", "Ann"),
        ]),
    });
    const module = mountModule(ContactsModule, { graph }).module;

    const result = await module.search({ query: "a", limit: 500 });
    expect(graph.spies.searchEntitiesByName).toHaveBeenCalledWith({
      query: "a",
      schemaIds: [CONTACT],
      limit: 50,
    });
    expect(JSON.parse(result.content[0]?.text ?? "null")).toEqual([
      { id: entityId("a"), name: "Ann", schemaId: CONTACT },
      { id: entityId("z"), name: "Ann", schemaId: CONTACT },
      { id: entityId("b"), name: "Bob", schemaId: CONTACT },
    ]);
  });
});

describe("tst_module_contacts_write_002 — the hub takes no email", () => {
  it("tst_module_contacts_write_002 refuses an email on create and on a batch row, and calls nothing", async () => {
    const graph = mockGraph();
    const execute = vi.fn();
    const module = mountModule(ContactsModule, { graph, rpc: { execute } }).module;

    // @tested-by: tst_module_contacts_write_002
    // @invariant: contacts sits above email, so creating a person never asks
    // email for an address; an email argument is refused, never dropped.
    await expect(
      module.create({ name: "Alice Smith", email: "alice@example.test" } as never),
    ).rejects.toThrow("contacts.create takes no email");
    await expect(
      module.batch_create({ contacts: [{ name: "Ann" }, { name: "Bob", email: "bob@example.test" } as never] }),
    ).rejects.toThrow("contact[1]: contacts.create takes no email");
    expect(execute).not.toHaveBeenCalled();
  });
});
