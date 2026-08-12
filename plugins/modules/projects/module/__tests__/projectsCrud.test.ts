/**
 * @layer: module
 * @test-id: tst_module_projects_crud_001
 * @scenario: scn_projects_crud_001
 * @covers: plugins/modules/projects/module/service.ts::create,get,update,delete
 * @deterministic: yes
 * @fixtures: strict GraphService doubles with fixed entities and links
 * @legacy-id: tst_int_projrpc_001_projects_create_persists_new_project
 * @legacy-id: tst_int_projrpc_003_projects_get_rehydrates_detail_view
 * @legacy-id: tst_int_projrpc_004_projects_update_changes_name_and_status
 * @legacy-id: tst_int_projrpc_005_projects_delete_removes_project
 * @legacy-id: tst_int_projrpc_006_projects_create_rejects_missing_name
 * @legacy-id: tst_int_projrpc_008_description_visible_in_projects_get
 * @legacy-id: tst_int_projrpc_012_linked_entities_appear_in_projects_get
 * @legacy-id: tst_int_optcreate_001_projects_create_uses_client_id
 * @legacy-id: tst_int_optcreate_003_projects_create_duplicate_client_id_is_idempotent
 * @legacy-id: tst_int_optcreate_006_projects_invalid_client_id_returns_error
 * @legacy-id: tst_int_optcreate_019_duplicate_leaves_original_intact
 */
import { describe, expect, it } from "vitest";
import { entity, mockGraph, mountModule } from "@magnis/testkit/module";
import { PROJECT } from "../../schema.ts";
import { ProjectsModule } from "../service.ts";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const CONTACT_ID = "22222222-2222-4222-8222-222222222222";

function project(
  name = "Investor demo",
  properties: Record<string, unknown> = { name, status: "active" },
) {
  return entity(PROJECT_ID, name, { schema_id: PROJECT, properties });
}

describe("tst_module_projects_crud_001 — projects CRUD owns its domain contract", () => {
  it("creates once with the requested client id and exact dictionary", async () => {
    const graph = mockGraph({
      get_entity: () => Promise.resolve(null),
      create_entity: () => Promise.resolve(project()),
      update_properties: () => Promise.resolve(undefined),
    });
    const { module } = mountModule(ProjectsModule, {
      graph,
      ctx: { extension_id: "projects" },
    });

    const result = await module.create({
      name: "Investor demo",
      status: "blocked",
      client_id: PROJECT_ID,
    });

    expect(result).toMatchObject({
      id: PROJECT_ID,
      name: "Investor demo",
      status: "blocked",
      schema_id: PROJECT,
    });
    expect(graph.spies.create_entity).toHaveBeenCalledWith({
      schema_id: PROJECT,
      name: "Investor demo",
      client_id: PROJECT_ID,
    });
    expect(graph.spies.update_properties).toHaveBeenCalledWith({
      entity_id: PROJECT_ID,
      properties: expect.objectContaining({ name: "Investor demo", status: "blocked" }),
    });
  });

  it("returns the existing client-id entity without a second write", async () => {
    const graph = mockGraph({
      get_entity: () =>
        Promise.resolve(project("Original", { name: "Original", status: "done" })),
      create_entity: () => Promise.reject(new Error("must not create")),
      update_properties: () => Promise.reject(new Error("must not update")),
    });
    const { module } = mountModule(ProjectsModule, { graph });

    const result = await module.create({ name: "Retry", client_id: PROJECT_ID });

    expect(result).toMatchObject({ id: PROJECT_ID, name: "Original", status: "done" });
    expect(graph.spies.create_entity).not.toHaveBeenCalled();
    expect(graph.spies.update_properties).not.toHaveBeenCalled();
  });

  it("rejects invalid input before touching the graph", async () => {
    const graph = mockGraph();
    const { module } = mountModule(ProjectsModule, { graph });

    await expect(module.create({ name: "" })).rejects.toThrow("missing required param: name");
    await expect(module.create({ name: "x", client_id: "not-a-uuid" })).rejects.toThrow(
      "client_id must be a valid UUID",
    );
  });

  it("rehydrates linked detail with direction and dictionary values", async () => {
    const contact = entity(CONTACT_ID, "Ada", {
      schema_id: "contacts.person",
      properties: { email: "ada@example.test" },
    });
    const graph = mockGraph({
      get_entity_full: () =>
        Promise.resolve({
          entity: project("Demo", {
            name: "Demo",
            status: "active",
            description: "Investor walkthrough",
            agent_memory: "Lead with local-first",
          }),
          links: [
            {
              id: "link-1",
              from_id: CONTACT_ID,
              to_id: PROJECT_ID,
              kind: "projects.belongs_to",
            },
          ],
        }),
      get_entities: () => Promise.resolve([contact]),
    });
    const { module } = mountModule(ProjectsModule, { graph });

    const detail = await module.get({ id: PROJECT_ID });

    expect(detail).toMatchObject({
      id: PROJECT_ID,
      name: "Demo",
      status: "active",
      canonical: {
        "project.name": "Demo",
        "project.status": "active",
      },
      linked_entities: [
        expect.objectContaining({
          id: CONTACT_ID,
          name: "Ada",
          schema_id: "contacts.person",
          link_kind: "~projects.belongs_to",
        }),
      ],
    });
  });

  it("updates the dictionary and name, then deletes only an existing project", async () => {
    const original = project();
    const updated = project("Demo ready", {
      name: "Demo ready",
      status: "done",
      description: "Ready",
    });
    const graph = mockGraph({
      get_entity: () => Promise.resolve(original),
      update_entity_name: () => Promise.resolve(undefined),
      update_properties: () => Promise.resolve(undefined),
      get_entity_full: () => Promise.resolve({ entity: updated, links: [] }),
      get_entities: () => Promise.resolve([]),
      delete_entity: () => Promise.resolve(undefined),
    });
    const { module } = mountModule(ProjectsModule, { graph });

    const result = await module.update({
      id: PROJECT_ID,
      name: "Demo ready",
      status: "done",
      description: "Ready",
    });
    expect(result).toMatchObject({ name: "Demo ready", status: "done" });
    expect(graph.spies.update_entity_name).toHaveBeenCalledWith(PROJECT_ID, "Demo ready");
    expect(graph.spies.update_properties).toHaveBeenCalledWith({
      entity_id: PROJECT_ID,
      properties: expect.objectContaining({
        name: "Demo ready",
        status: "done",
        description: "Ready",
      }),
    });

    expect(await module.delete({ id: PROJECT_ID })).toEqual({ deleted: true });
    expect(graph.spies.delete_entity).toHaveBeenCalledWith(PROJECT_ID);
  });

  it("surfaces missing ownership uniformly on get, update, and delete", async () => {
    const graph = mockGraph({
      get_entity: () => Promise.resolve(null),
      get_entity_full: () => Promise.resolve(null),
    });
    const { module } = mountModule(ProjectsModule, { graph });

    await expect(module.get({ id: PROJECT_ID })).rejects.toThrow(`project ${PROJECT_ID} not found`);
    await expect(module.update({ id: PROJECT_ID, status: "done" })).rejects.toThrow(
      `project ${PROJECT_ID} not found`,
    );
    await expect(module.delete({ id: PROJECT_ID })).rejects.toThrow(
      `project ${PROJECT_ID} not found`,
    );
  });
});
