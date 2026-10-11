/**
 * @layer: module
 * @test-id: tst_module_projects_checklist_001
 * @scenario: scn_projects_checklist_001
 * @covers: modules/projects/module/service.ts::checklistGet,checklistUpdate
 * @deterministic: yes
 * @fixtures: one owned project dictionary and strict GraphService doubles
 * @legacy-id: tst_int_plan_001_checklist_get_returns_empty_items
 * @legacy-id: tst_int_plan_002_checklist_update_creates_facet
 * @legacy-id: tst_int_plan_003_checklist_get_returns_items_after_update
 * @legacy-id: tst_int_plan_004_checklist_update_overwrites_existing
 * @legacy-id: tst_int_plan_005_checklist_update_requires_approval
 * @legacy-id: tst_int_plan_006_checklist_items_have_required_fields
 * @legacy-id: tst_int_plan_007_checklist_multiple_items_roundtrip
 * @legacy-id: tst_int_plan_008_checklist_get_missing_project_id_error
 * @legacy-id: tst_int_plan_009_checklist_get_invalid_project_id_error
 * @legacy-id: tst_int_plan_010_checklist_tools_visible_in_mcp
 * @legacy-id: tst_int_plan_050_checklist_get_rejects_non_project_entity
 * @legacy-id: tst_int_plan_051_checklist_update_rejects_non_project_entity
 */
import type { JsonObject, PropertiesUpdate } from "@magnis/sdk";
import { describe, expect, it } from "vitest";
import { entity, mockGraph, mountModule } from "@magnis/testkit/module";
import { PROJECT } from "../../schema.ts";
import type { ChecklistItem } from "../../types.ts";
import { ProjectsModule } from "../service.ts";

const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const ITEMS: ChecklistItem[] = [
  { id: "demo", text: "Run investor demo", status: "in_progress" },
  { id: "follow-up", text: "Send metrics", status: "blocked", notes: "Await export" },
];

function project(properties: JsonObject = {}) {
  return entity(PROJECT_ID, "Raise", { schemaId: PROJECT, properties });
}

describe("tst_module_projects_checklist_001 — checklist lifecycle", () => {
  it("reads empty state and replaces the complete checklist dictionary key", async () => {
    const writes: PropertiesUpdate["properties"][] = [];
    let current = project({ status: "active" });
    const graph = mockGraph({
      getEntity: () => Promise.resolve(current),
      updateProperties: (params) => {
        writes.push(params.properties);
        current = project(params.properties as JsonObject);
        return Promise.resolve(undefined);
      },
    });
    const { module } = mountModule(ProjectsModule, { graph });

    expect(await module.checklistGet({ project_id: PROJECT_ID })).toEqual({ items: [] });
    expect(await module.checklistUpdate({ project_id: PROJECT_ID, items: ITEMS })).toEqual({
      status: "ok",
      project_id: PROJECT_ID,
    });
    expect(await module.checklistGet({ project_id: PROJECT_ID })).toEqual({ items: ITEMS });
    await module.checklistUpdate({ project_id: PROJECT_ID, items: [ITEMS[0]!] });
    expect(await module.checklistGet({ project_id: PROJECT_ID })).toEqual({ items: [ITEMS[0]] });
    expect(writes).toEqual([{ status: "active", checklist: ITEMS }, { status: "active", checklist: [ITEMS[0]] }]);
  });

  it("rejects missing, foreign, and non-project ids before writing", async () => {
    const missingGraph = mockGraph({ getEntity: () => Promise.resolve(null) });
    const missing = mountModule(ProjectsModule, { graph: missingGraph }).module;
    await expect(missing.checklistGet({ project_id: "" })).rejects.toThrow(
      "missing required param: project_id",
    );
    await expect(missing.checklistGet({ project_id: PROJECT_ID })).rejects.toThrow(
      `project not found: ${PROJECT_ID}`,
    );

    const wrongGraph = mockGraph({
      getEntity: () =>
        Promise.resolve(entity(PROJECT_ID, "Not a project", { schemaId: "notes.note" })),
    });
    const wrong = mountModule(ProjectsModule, { graph: wrongGraph }).module;
    await expect(wrong.checklistUpdate({ project_id: PROJECT_ID, items: [] })).rejects.toThrow(
      "is not a project",
    );
  });

  it("declares read/write tools with approval only on update", async () => {
    const { tools } = await mountModule(ProjectsModule, {
      mode: "dispatch",
      ctx: { extensionId: "projects" },
    });
    const get = tools.find((tool) => tool.binding?.entity === "projects.project.checklist" && tool.binding.operation === "get");
    const update = tools.find((tool) => tool.binding?.entity === "projects.project.checklist" && tool.binding.operation === "update");

    expect(get).toMatchObject({ requiresApproval: false });
    expect(update).toMatchObject({ requiresApproval: true });
    expect(update?.inputSchema).toMatchObject({ required: ["project_id", "items"] });
  });
});
