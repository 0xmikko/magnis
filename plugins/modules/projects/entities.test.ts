/** The declaration is not a wish: both records this module writes have to pass
 * it — the one `create` writes and the one `update` rewrites — through the
 * module's REAL write path rather than copied dictionaries.
 *
 * Beside entities.ts and outside module/ on purpose.
 */
import { describe, expect, it } from "vitest";
import { entity as graphEntity, mockGraph, mountModule } from "@magnis/testkit/module";

import { ProjectsModule } from "./module/service.ts";
import { project } from "./entities.ts";
import { PROJECT } from "./schema.ts";

const PROJECT_ID = "22222222-2222-4222-8222-222222222222";

async function writtenProperties(): Promise<Record<string, unknown>[]> {
  const written: Record<string, unknown>[] = [];
  const existing = graphEntity(PROJECT_ID, "Acme × ExampleCo", {
    schema_id: PROJECT,
    properties: { name: "Acme × ExampleCo", status: "active" },
  });
  const graph = mockGraph({
    create_entity: () => Promise.resolve(existing),
    get_entity: () => Promise.resolve(existing),
    get_entity_full: () => Promise.resolve({ entity: existing, links: [] }),
    get_entities: () => Promise.resolve([]),
    update_entity_name: () => Promise.resolve(undefined),
    update_properties: (input: { properties: Record<string, unknown> }) => {
      written.push(input.properties);
      return Promise.resolve(undefined);
    },
  } as never);
  const mod = mountModule(ProjectsModule, { graph, ctx: { extension_id: "projects" } }).module;
  await mod.create({ name: "Acme × ExampleCo", status: "active" });
  await mod.update({ id: PROJECT_ID, description: "Scope for Q3." });
  // The checklist lands in the SAME dictionary, replaced whole — a declaration
  // that forgets it turns this tool into a refusal.
  await mod.checklistUpdate({
    project_id: PROJECT_ID,
    items: [{ id: "1", text: "Sign the SOW", status: "pending" }],
  });
  return written;
}

describe("projects declares what it writes", () => {
  it("every record the module writes today passes its own declaration", async () => {
    const records = await writtenProperties();
    // create, update AND checklist.update — a declaration that fits only some
    // of a module's write paths is wrong about the entity.
    expect(records.length).toBeGreaterThan(2);
    for (const record of records) {
      expect(project.safeParse(record).error?.issues ?? []).toEqual([]);
    }
  });

  it("a field the module does not declare is refused, and the error names it", () => {
    const verdict = project.safeParse({ name: "Acme", owner_id: "u1" });
    expect(verdict.success).toBe(false);
    expect(JSON.stringify(verdict.error?.issues)).toContain("owner_id");
  });
});
