/** The declaration is not a wish: the record this module writes has to pass
 * it, through the module's REAL write path rather than a copied dictionary.
 *
 * Beside entities.ts and outside module/ on purpose — the module's own
 * tsconfig must never see zod.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { entity as graphEntity, mockGraph, mountModule } from "@magnis/testkit/module";

import { NotesModule } from "./module/service.ts";
import { note } from "./entities.ts";
import { NOTE } from "./schema.ts";

const NOTE_ID = "11111111-1111-4111-8111-111111111111";

async function writtenProperties(): Promise<Record<string, unknown>[]> {
  const written: Record<string, unknown>[] = [];
  const graph = mockGraph({
    create_entity: () => Promise.resolve(graphEntity(NOTE_ID, "T", { schema_id: NOTE })),
    update_properties: (input: { properties: Record<string, unknown> }) => {
      written.push(input.properties);
      return Promise.resolve(undefined);
    },
    delete_entity: () => Promise.resolve(undefined),
  } as never);
  const mod = mountModule(NotesModule, { graph, ctx: { extension_id: "notes" } }).module;
  await mod.create({ title: "Q3 plan", body: "ship the declaration" });
  return written;
}

describe("notes declares what it writes", () => {
  /**
   * @test-id: tst_module_notes_forms_001
   * @scenario: scn_tools_notes_create
   * @covers: notes create declaration and BODY_ONE_OF
   * @deterministic: yes
   * @fixtures: actual harvested tool schema
   */
  it("tst_module_notes_forms_001 accepts exactly one markdown body through the published schema", async () => {
    const { tools } = await mountModule(NotesModule, { mode: "dispatch", ctx: { extension_id: "notes" } });
    const definition = tools.find(({ name }) => name === "notes.note.create");
    if (definition === undefined) throw new Error("note create definition missing");
    const schema = z.fromJSONSchema(definition.inputSchema);
    for (const params of [{ title: "Live", body: "Text" }, { title: "Live", content: "Text" }, { title: "Live", template: "meeting_prep" }]) {
      expect(schema.safeParse(params).success).toBe(true);
    }
    for (const params of [{ title: "Live" }, { title: "Live", body: "A", content: "B" }, { title: "Live", body: 42 }, { title: "Live", template: "meeting_prep", body: "A" }]) {
      expect(schema.safeParse(params).success, JSON.stringify(params)).toBe(false);
    }
  });

  it("every record the module writes today passes its own declaration", async () => {
    const records = await writtenProperties();
    expect(records.length).toBeGreaterThan(0);
    for (const record of records) {
      expect(note.safeParse(record).error?.issues ?? []).toEqual([]);
    }
  });

  it("a field the module does not declare is refused, and the error names it", () => {
    const verdict = note.safeParse({ title: "Q3 plan", file_path: "/notes/q3.md" });
    expect(verdict.success).toBe(false);
    expect(JSON.stringify(verdict.error?.issues)).toContain("file_path");
  });
});
