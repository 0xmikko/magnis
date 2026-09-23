/**
 * @layer: module
 * @test-id: tst_module_contacts_tracking_read_001
 * @scenario: scn_compact_removed_workflows_001
 * @covers: plugins/modules/contacts/module/service.ts::get_social_tracking_by_handle,list_social_tracking,rename_if_placeholder
 * @deterministic: yes
 * @fixtures: stored tracked and untracked contacts
 */
import { describe, expect, it } from "vitest";
import { entity, mockGraph, mountModule } from "@magnis/testkit/module";
import { ContactsModule } from "../service.ts";

describe("retained social ingestion reads", () => {
  const tracked = entity("p1", "jack", { schema_id: "contacts.person", properties: {
    tracking: [{ platform: "x", handle: "Jack", enabled: true }],
  }});
  const untracked = entity("p2", "Ann", { schema_id: "contacts.person", properties: {
    tracking: [{ platform: "linkedin", handle: "ann", enabled: false }],
  }});
  it("reads existing tracking without exposing write workflows", async () => {
    const graph = mockGraph({
      get_entity: async () => tracked,
      list_entities_window: async () => ({ items: [tracked, untracked].map(entity => ({ entity, data: null })), total: 2 }),
    });
    const { module } = mountModule(ContactsModule, { graph });
    for (const name of ["set_social_tracking", "track_social_profile", "batch_track_social"]) expect(name in module).toBe(false);
    expect(await module.get_social_tracking_by_handle({ platform: "x", handle: "jack" })).toMatchObject({ contact_id: "p1", tracked: true });
    expect(await module.get_social_tracking_by_handle({ platform: "linkedin", handle: "ann" })).toMatchObject({ contact_id: "p2", tracked: false });
    expect(await module.get_social_tracking_by_handle({ platform: "x", handle: "missing" })).toBeNull();
    expect(await module.list_social_tracking({ platform: "x" })).toMatchObject([{ contact_id: "p1", handle: "Jack" }]);
    expect(await module.list_social_tracking({ platform: "linkedin" })).toEqual([]);
  });
  it("renames only an unchanged placeholder during profile ingestion", async () => {
    const graph = mockGraph({ get_entity: async () => tracked, update_entity_name: async () => undefined });
    const { module } = mountModule(ContactsModule, { graph });
    expect(await module.rename_if_placeholder({ id: "p1", expected_name: "jack", new_name: "Jack Smith" })).toEqual({ renamed: true });
    expect(await module.rename_if_placeholder({ id: "p1", expected_name: "other", new_name: "Wrong" })).toEqual({ renamed: false });
    expect(graph.spies.update_entity_name).toHaveBeenCalledExactlyOnceWith("p1", "Jack Smith");
  });
});
