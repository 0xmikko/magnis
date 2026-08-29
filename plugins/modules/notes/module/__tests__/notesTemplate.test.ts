/**
 * @layer: module
 * @test-id: tst_module_notes_template_001
 * @scenario: scn_notes_template_001
 * @covers: plugins/modules/notes/module/helpers.ts::renderTemplate; plugins/modules/notes/module/service.ts::template_apply
 * @deterministic: yes
 * @fixtures: fixed template matrix and strict graph doubles
 * @legacy-id: tst_int_plan_020_template_outreach_tracker
 * @legacy-id: tst_int_plan_021_template_comparison_table
 * @legacy-id: tst_int_plan_022_template_meeting_prep
 * @legacy-id: tst_int_plan_023_template_follow_up_plan
 * @legacy-id: tst_int_plan_024_template_with_variables
 * @legacy-id: tst_int_plan_025_template_requires_approval
 * @legacy-id: tst_int_plan_026_template_invalid_name_error
 * @legacy-id: tst_int_plan_027_template_missing_template_param_error
 * @legacy-id: tst_int_plan_028_template_missing_title_param_error
 * @legacy-id: tst_int_plan_029_template_tool_visible_in_mcp
 * @legacy-id: tst_notes_e2e_template_apply_all_four
 * @legacy-id: tst_notes_e2e_template_apply_missing_params_error
 */
import { describe, expect, it } from "vitest";
import { entity, mockGraph, mountModule } from "@magnis/testkit/module";
import { NOTE } from "../../schema.ts";
import { NotesModule } from "../service.ts";

const NOTE_ID = "44444444-4444-4444-8444-444444444444";

function templateGraph() {
  return mockGraph({
    create_entity: () => Promise.resolve(entity(NOTE_ID, "Template", { schema_id: NOTE })),
    update_properties: () => Promise.resolve(undefined),
  });
}

describe("tst_module_notes_template_001 — note templates", () => {
  it.each([
    ["outreach_tracker", "| Contact | Status | Last Action | Next Step | Notes |"],
    ["comparison_table", "| Option | Pros | Cons | Score | Notes |"],
    ["meeting_prep", "## Agenda"],
    ["follow_up_plan", "## Objective"],
  ] as const)("renders %s through the create boundary", async (template, marker) => {
    const graph = templateGraph();
    const module = mountModule(NotesModule, { graph }).module;

    const result = await module.template_apply({ template, title: "Demo" });

    expect(result.body).toContain(marker);
    expect(graph.spies.update_properties).toHaveBeenCalledWith({
      entity_id: NOTE_ID,
      properties: expect.objectContaining({ title: "Demo", body: expect.stringContaining(marker) }),
    });
  });

  it("interpolates a string project name and ignores non-string variables", async () => {
    const withProject = mountModule(NotesModule, { graph: templateGraph() }).module;
    await expect(
      withProject.template_apply({
        template: "outreach_tracker",
        title: "Outreach",
        variables: { project_name: "Magnis" },
      }),
    ).resolves.toMatchObject({ body: expect.stringContaining("Project: Magnis") });

    const withoutProject = mountModule(NotesModule, { graph: templateGraph() }).module;
    const result = await withoutProject.template_apply({
      template: "outreach_tracker",
      title: "Outreach",
      variables: { project_name: 42 },
    });
    expect(result.body).not.toContain("Project:");
  });

  it("rejects unknown and missing template inputs before graph access", async () => {
    const module = mountModule(NotesModule, { graph: mockGraph() }).module;

    await expect(
      module.template_apply({ template: "unknown", title: "Demo" }),
    ).rejects.toThrow("unknown template: unknown");
    await expect(
      module.template_apply({ title: "Demo" } as never),
    ).rejects.toThrow("missing required param: template");
    await expect(
      module.template_apply({ template: "meeting_prep" } as never),
    ).rejects.toThrow("missing required param: title");
  });

  it("advertises template.apply as an approval-required write tool", async () => {
    const { tools } = await mountModule(NotesModule, {
      mode: "dispatch",
      ctx: { extension_id: "notes" },
    });
    const template = tools.find((tool) => tool.name === "notes.template.apply");

    expect(template).toMatchObject({ requires_approval: true });
    expect(template?.inputSchema).toMatchObject({ required: ["template", "title"] });
  });
});
