// Notes write surface — the two defects that broke the demo: the agent's
// `content` argument was not accepted (so `notes.create` rejected or produced
// an empty note), and a failed content write left a title-only note entity
// behind. `update` had the mirror problem: it renamed the entity BEFORE
// writing the body, so a failure left a note titled for content it never got.
//
// Doubles come from @magnis/testkit/module: `mockGraph` is a throwing Proxy,
// so any op the write path touches without being arranged fails the test.

import { describe, expect, it } from "vitest";
import { entity, facet, mockGraph, mountModule, type MockGraph } from "@magnis/testkit/module";
import { NotesModule } from "../service.ts";
import { bodyFromToolArgs } from "../helpers.ts";
import { NOTE, NOTE_CONTENT } from "../../schema.ts";
import type { NoteCanonical, NoteFacets } from "../../types.ts";

type G = MockGraph<NoteFacets, NoteCanonical>;

const NOTE_ID = "11111111-1111-4111-8111-111111111111";

function writeGraph(overrides: Record<string, unknown> = {}): G {
  return mockGraph<NoteFacets, NoteCanonical>({
    create_entity: () => Promise.resolve(entity(NOTE_ID, "T", { schema_id: NOTE })),
    attach_facet: () => Promise.resolve(undefined),
    resolve_canonical: () => Promise.resolve(undefined),
    delete_entity: () => Promise.resolve(undefined),
    ...overrides,
  } as never);
}

/**
 * @test-id: tst_module_notes_write_001
 * @scenario: scn_demo_rfq_001
 * @covers: plugins/modules/notes/module/service.ts::NotesModule.create
 * @deterministic: yes
 * @fixtures: inline graph doubles
 *
 * Test environment: vitest node lane, direct module mount
 * Clients: direct calls
 * Mocks: throwing mockGraph
 * Data: body supplied under each accepted name, and a failing content write
 *
 * @invariant INV-1, INV-2
 */
describe("notes.create accepts one body field and is atomic", () => {
  it("tst_module_notes_write_001 accepts the body under `content`", async () => {
    const graph = writeGraph();
    const { module } = mountModule(NotesModule, { graph });

    const snap = await module.create({ title: "RFQ", content: "## prices" } as never);

    expect(snap.body).toBe("## prices");
    expect(graph.spies.attach_facet).toHaveBeenCalledWith(
      expect.objectContaining({
        schema_id: NOTE_CONTENT,
        data: expect.objectContaining({ body: "## prices", title: "RFQ" }),
      }),
    );
  });

  it("tst_module_notes_write_001 accepts the body under `body`", async () => {
    const graph = writeGraph();
    const { module } = mountModule(NotesModule, { graph });

    const snap = await module.create({ title: "RFQ", body: "## prices" });

    expect(snap.body).toBe("## prices");
  });

  it("tst_module_notes_write_001 rejects both names at once", async () => {
    const graph = writeGraph();
    const { module } = mountModule(NotesModule, { graph });

    await expect(
      module.create({ title: "RFQ", body: "a", content: "b" } as never),
    ).rejects.toThrow(/body.*content|content.*body/i);
    expect(graph.spies.create_entity).not.toHaveBeenCalled();
  });

  it("tst_module_notes_write_001 rejects neither name", async () => {
    const graph = writeGraph();
    const { module } = mountModule(NotesModule, { graph });

    await expect(module.create({ title: "RFQ" } as never)).rejects.toThrow(/body|content/i);
    expect(graph.spies.create_entity).not.toHaveBeenCalled();
  });

  it("tst_module_notes_write_001 leaves no entity behind when the content write fails", async () => {
    const graph = writeGraph({
      attach_facet: () => Promise.reject(new Error("facet store unavailable")),
    });
    const { module } = mountModule(NotesModule, { graph });

    await expect(module.create({ title: "RFQ", body: "x" })).rejects.toThrow(
      "facet store unavailable",
    );

    expect(graph.spies.delete_entity).toHaveBeenCalledWith(NOTE_ID);
  });
});

/**
 * @test-id: tst_module_notes_write_003
 * @scenario: scn_demo_rfq_001
 * @covers: plugins/modules/notes/module/helpers.ts::bodyFromToolArgs
 * @deterministic: yes
 * @fixtures: inline tool-call arguments
 *
 * @invariant INV-3 — the approval card resolves the body from every wire name
 * `notes.create` accepts, so a `content` call never renders blank.
 */
describe("the approval card reads the same wire names the tool accepts", () => {
  it("tst_module_notes_write_003 resolves body, content and legacy text", () => {
    expect(bodyFromToolArgs({ body: "b" })).toBe("b");
    expect(bodyFromToolArgs({ content: "c" })).toBe("c");
    expect(bodyFromToolArgs({ text: "t" })).toBe("t");
  });

  it("tst_module_notes_write_003 prefers body, then content, then text", () => {
    expect(bodyFromToolArgs({ body: "b", content: "c", text: "t" })).toBe("b");
    expect(bodyFromToolArgs({ content: "c", text: "t" })).toBe("c");
  });

  it("tst_module_notes_write_003 renders empty rather than throwing on an unvalidated call", () => {
    expect(bodyFromToolArgs({})).toBe("");
    expect(bodyFromToolArgs({ body: 42 })).toBe("");
  });
});

/**
 * @test-id: tst_module_notes_write_002
 * @scenario: scn_demo_rfq_001
 * @covers: plugins/modules/notes/module/service.ts::NotesModule.update
 * @deterministic: yes
 * @fixtures: inline graph doubles
 *
 * @invariant INV-25 — a failed update leaves neither the title nor the body
 * half-applied.
 */
describe("notes.update is atomic", () => {
  it("tst_module_notes_write_002 does not rename when the content write fails", async () => {
    const graph = mockGraph<NoteFacets, NoteCanonical>({
      get_entity_full: () =>
        Promise.resolve({
          entity: entity(NOTE_ID, "old title", { schema_id: NOTE }),
          facets: [facet("f1", NOTE_CONTENT, { title: "old title", body: "old body" })],
          links: [],
        }),
      attach_facet: () => Promise.reject(new Error("facet store unavailable")),
      update_entity_name: () => Promise.resolve(undefined),
      resolve_canonical: () => Promise.resolve(undefined),
    } as never);
    const { module } = mountModule(NotesModule, { graph });

    await expect(module.update({ id: NOTE_ID, title: "new title", body: "new body" })).rejects.toThrow(
      "facet store unavailable",
    );

    expect(graph.spies.update_entity_name).not.toHaveBeenCalled();
  });
});
