/**
 * @layer: module
 * @test-id: tst_mod_projects_update_001
 * @scenario: scn_projects_description_update_001
 * @covers: plugins/modules/projects/module/service.ts::update
 * @deterministic: yes
 * @fixtures: inline project entity and facet
 *
 * Test environment: ProjectsModule with a scripted GraphService.
 * Clients: direct calls.
 * Mocks: GraphService only.
 * Data: one existing active project and a description-only update carrying
 * runtime JSON nulls for optional name/status.
 */
import { describe, expect, it } from "vitest";
import { entity, facet, mockGraph, mountModule } from "@magnis/testkit/module";
import { ProjectsModule } from "../service.ts";
import { PROJECT, PROJECT_DESCRIPTION } from "../../schema.ts";
import type {
  ProjectCanonical,
  ProjectFacets,
  UpdateParams,
} from "../../types.ts";

describe("projects.update runtime optional fields", () => {
  it("tst_mod_projects_update_001 treats null name/status as omitted during a description-only update", async () => {
    const project = entity("project-1", "Acme × ExampleCo", {
      schema_id: PROJECT,
      properties: { name: "Acme × ExampleCo", status: "active" },
    });
    const graph = mockGraph<ProjectFacets, ProjectCanonical>({
      get_entity: () => Promise.resolve(project),
      update_entity_name: () => Promise.resolve(),
      update_properties: () => Promise.resolve(),
      get_entity_full: () =>
        Promise.resolve({
          entity: project,
          facets: [],
          links: [],
        }),
      get_entities: () => Promise.resolve([]),
    });
    const module = mountModule(ProjectsModule, {
      graph,
      ctx: { extension_id: "projects" },
    }).module;

    await module.update({
      id: project.id,
      name: null,
      status: null,
      description: "Updated project summary",
    } as unknown as UpdateParams);

    expect(graph.spies.update_entity_name).not.toHaveBeenCalled();
    // S1: one dictionary write — nulls omitted, existing values preserved,
    // the description riding the same write.
    expect(graph.spies.update_properties).toHaveBeenCalledWith(
      expect.objectContaining({
        entity_id: project.id,
        properties: expect.objectContaining({
          name: "Acme × ExampleCo",
          status: "active",
          description: "Updated project summary",
        }),
      }),
    );
  });
});
