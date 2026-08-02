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
    });
    const graph = mockGraph<ProjectFacets, ProjectCanonical>({
      get_entity: () => Promise.resolve(project),
      list_facets_for_entity: () =>
        Promise.resolve([
          facet("project-facet-1", PROJECT, {
            name: "Acme × ExampleCo",
            status: "active",
          }),
        ]),
      update_entity_name: () => Promise.resolve(),
      attach_facet: (input) =>
        Promise.resolve(
          facet("attached-facet", input.schema_id, input.data, {
            entity_id: input.entity_id,
          }),
        ),
      resolve_canonical: () => Promise.resolve(),
      get_entity_full: () =>
        Promise.resolve({
          entity: project,
          facets: [],
          links: [],
        }),
      get_canonical: () => Promise.resolve({}),
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
    const attachFacet = graph.spies.attach_facet;
    if (attachFacet === undefined) throw new Error("projects update: missing attach_facet spy");
    const projectFacetCall = attachFacet.mock.calls.find(
      (call) => (call[0] as { schema_id?: string }).schema_id === PROJECT,
    );
    if (projectFacetCall === undefined) throw new Error("projects update: project facet not attached");
    expect(projectFacetCall[0]).toMatchObject({
      schema_id: PROJECT,
      data: {
        name: "Acme × ExampleCo",
        status: "active",
      },
    });
    expect(attachFacet).toHaveBeenCalledWith(
      expect.objectContaining({
        schema_id: PROJECT_DESCRIPTION,
        data: { body: "Updated project summary" },
      }),
    );
  });
});
