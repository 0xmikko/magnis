// Notes write surface — the two defects that broke the demo: the agent's
// `content` argument was not accepted (so `notes.create` rejected or produced
// an empty note), and a failed content write left a title-only note entity
// behind. `update` had the mirror problem: it renamed the entity BEFORE
// writing the body, so a failure left a note titled for content it never got.
//
// Doubles come from @magnis/testkit/module: `mockGraph` is a throwing Proxy,
// so any op the write path touches without being arranged fails the test.

import { describe, expect, it } from "vitest";
import { entity, mockGraph, mountModule, type MockGraph } from "@magnis/testkit/module";
import { NotesModule } from "../service.ts";
import { bodyFromToolArgs } from "../../ui/toolArgs.ts";
import { NOTE, NOTE_CONTENT } from "../../schema.ts";
import type { NoteCanonical } from "../../types.ts";

type G = MockGraph;

const NOTE_ID = "11111111-1111-4111-8111-111111111111";

function writeGraph(overrides: Record<string, unknown> = {}): G {
  return mockGraph({
    create_entity: () => Promise.resolve(entity(NOTE_ID, "T", { schema_id: NOTE })),
    update_properties: () => Promise.resolve(undefined),
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
 * @legacy-id: tst_notes_e2e_create_then_get_roundtrips_body
 * @legacy-id: tst_notes_e2e_no_file_fields
 * @legacy-id: tst_notes_e2e_create_stores_body_verbatim
 * @legacy-id: tst_notes_e2e_create_rejects_blank_body
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

    const snap = await module.create({ title: "RFQ", content: "## prices" });

    expect(snap.body).toBe("## prices");
    expect(graph.spies.update_properties).toHaveBeenCalledWith(
      expect.objectContaining({
        properties: expect.objectContaining({ body: "## prices", title: "RFQ" }),
      }),
    );
  });

  it("tst_module_notes_write_001 accepts the body under `body`", async () => {
    const graph = writeGraph();
    const { module } = mountModule(NotesModule, { graph });

    const snap = await module.create({ title: "RFQ", body: "## prices" });

    expect(snap.body).toBe("## prices");
    expect(snap).not.toHaveProperty("file_path");
    expect(snap).not.toHaveProperty("file_name");
  });

  it("tst_module_notes_write_001 preserves whitespace and rejects a blank body", async () => {
    const graph = writeGraph();
    const { module } = mountModule(NotesModule, { graph });
    await expect(module.create({ title: "Exact", body: "  exact body  " })).resolves.toMatchObject({
      body: "  exact body  ",
    });

    const blankGraph = writeGraph();
    const blank = mountModule(NotesModule, { graph: blankGraph }).module;
    await expect(blank.create({ title: "Blank", body: "   " })).rejects.toThrow(/blank/);
    expect(blankGraph.spies.create_entity).not.toHaveBeenCalled();
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
      update_properties: () => Promise.reject(new Error("facet store unavailable")),
    });
    const { module } = mountModule(NotesModule, { graph });

    await expect(module.create({ title: "RFQ", body: "x" })).rejects.toThrow(
      "facet store unavailable",
    );

    expect(graph.spies.delete_entity).toHaveBeenCalledWith(NOTE_ID);
  });
});

/**
 * @test-id: tst_module_notes_identity_001
 * @scenario: scn_notes_identity_001
 * @covers: plugins/modules/notes/module/service.ts::NotesModule.create,delete
 * @deterministic: yes
 * @fixtures: fixed UUID and strict graph doubles
 * @legacy-id: tst_int_optcreate_007_notes_create_uses_client_id
 * @legacy-id: tst_int_optcreate_009_notes_create_duplicate_client_id_is_idempotent
 * @legacy-id: tst_int_optcreate_024_notes_invalid_client_id_returns_error
 * @legacy-id: tst_notes_e2e_create_invalid_client_id_errors
 * @legacy-id: tst_notes_e2e_rejects_non_note_id
 * @legacy-id: tst_notes_e2e_create_idempotent_on_client_id
 * @legacy-id: tst_notes_e2e_delete_removes_note
 * @legacy-id: tst_notes_e2e_ownership_notfound
 */
describe("notes identity and schema boundaries", () => {
  it("forwards a valid client id and returns the existing note on retry", async () => {
    const freshGraph = writeGraph({ get_entity_full: () => Promise.resolve(null) });
    const fresh = mountModule(NotesModule, { graph: freshGraph }).module;

    const created = await fresh.create({
      title: "Original",
      body: "Body",
      client_id: NOTE_ID,
    });

    expect(created.id).toBe(NOTE_ID);
    expect(freshGraph.spies.create_entity).toHaveBeenCalledWith({
      schema_id: NOTE,
      name: "Original",
      client_id: NOTE_ID,
    });

    const retryGraph = mockGraph({
      get_entity_full: () =>
        Promise.resolve({
          entity: entity(NOTE_ID, "Original", {
            schema_id: NOTE,
            properties: {
              title: "Original",
              body: "Body",
              updated_at: "2026-01-02T00:00:00Z",
            },
          }),
          links: [],
        }),
    });
    const retry = mountModule(NotesModule, { graph: retryGraph }).module;

    await expect(
      retry.create({ title: "Ignored retry", client_id: NOTE_ID } as never),
    ).resolves.toEqual({
      id: NOTE_ID,
      schema_id: NOTE,
      title: "Original",
      body: "Body",
      updated_at: "2026-01-02T00:00:00Z",
    });
  });

  it("rejects an invalid client id before any graph operation", async () => {
    const graph = mockGraph();
    const module = mountModule(NotesModule, { graph }).module;

    await expect(
      module.create({ title: "Invalid", body: "Body", client_id: "not-a-uuid" }),
    ).rejects.toThrow("client_id must be a valid UUID");
  });

  it("does not reinterpret a foreign-schema client-id collision as a note", async () => {
    const graph = mockGraph({
      get_entity_full: () =>
        Promise.resolve({
          entity: entity(NOTE_ID, "Project", { schema_id: "projects.project" }),
          links: [],
        }),
      create_entity: () => Promise.reject(new Error("entity already exists")),
    });
    const module = mountModule(NotesModule, { graph }).module;

    await expect(
      module.create({ title: "Must not impersonate", body: "Body", client_id: NOTE_ID }),
    ).rejects.toThrow("entity already exists");
  });

  it("deletes only an owned note entity", async () => {
    const graph = mockGraph({
      get_entity_full: () =>
        Promise.resolve({ entity: entity(NOTE_ID, "Note", { schema_id: NOTE }), links: [] }),
      delete_entity: () => Promise.resolve(undefined),
    });
    const module = mountModule(NotesModule, { graph }).module;
    await expect(module.delete({ id: NOTE_ID })).resolves.toEqual({ deleted: true });
    expect(graph.spies.delete_entity).toHaveBeenCalledWith(NOTE_ID);

    const foreignGraph = mockGraph({
      get_entity_full: () =>
        Promise.resolve({
          entity: entity(NOTE_ID, "Project", { schema_id: "projects.project" }),
          links: [],
        }),
    });
    const foreign = mountModule(NotesModule, { graph: foreignGraph }).module;
    await expect(foreign.delete({ id: NOTE_ID })).rejects.toThrow(`note not found: ${NOTE_ID}`);
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
 * @legacy-id: tst_notes_e2e_update_title_renames_entity
 *
 * @invariant INV-25 — a failed update leaves neither the title nor the body
 * half-applied.
 */
describe("notes.update is atomic", () => {
  it("tst_module_notes_write_002 writes the body and then renames on success", async () => {
    const graph = mockGraph({
      get_entity_full: () =>
        Promise.resolve({
          entity: entity(NOTE_ID, "old title", {
            schema_id: NOTE,
            properties: { body: "old body", updated_at: "2026-01-01T00:00:00Z" },
          }),
          links: [],
        }),
      update_properties: () => Promise.resolve(undefined),
      update_entity_name: () => Promise.resolve(undefined),
    } as never);
    const { module } = mountModule(NotesModule, { graph });

    await expect(
      module.update({ id: NOTE_ID, title: "new title", body: "new body" }),
    ).resolves.toMatchObject({ title: "new title", body: "new body" });
    expect(graph.spies.update_entity_name).toHaveBeenCalledWith(NOTE_ID, "new title");
  });

  it("tst_module_notes_write_002 does not rename when the content write fails", async () => {
    const graph = mockGraph({
      get_entity_full: () =>
        Promise.resolve({
          entity: entity(NOTE_ID, "old title", { schema_id: NOTE }),
          links: [],
        }),
      update_properties: () => Promise.reject(new Error("facet store unavailable")),
      update_entity_name: () => Promise.resolve(undefined),
    } as never);
    const { module } = mountModule(NotesModule, { graph });

    await expect(module.update({ id: NOTE_ID, title: "new title", body: "new body" })).rejects.toThrow(
      "facet store unavailable",
    );

    expect(graph.spies.update_entity_name).not.toHaveBeenCalled();
  });
});

/**
 * @test-id: tst_module_notes_write_004
 * @scenario: scn_demo_rfq_001
 * @covers: plugins/modules/notes/module/service.ts::NotesModule.update
 * @deterministic: yes
 *
 * @invariant INV-25 — the OTHER direction of the update compensation: the
 * content write lands, the rename then fails, and the note must come back
 * exactly as it was — title, body AND `updated_at`. Restoring with a fresh
 * timestamp would still move the note in a list ordered by that field, so a
 * failed update would visibly reorder the user's notes.
 */
describe("notes.update restores the note unchanged when the rename fails", () => {
  it("tst_module_notes_write_004 title, body and updated_at all come back", async () => {
    const writes: Record<string, unknown>[] = [];
    const graph = mockGraph({
      get_entity_full: () =>
        Promise.resolve({
          entity: entity(NOTE_ID, "old title", {
            schema_id: NOTE,
            properties: {
              title: "old title",
              body: "old body",
              updated_at: "2026-07-01T00:00:00Z",
            },
          }),
          links: [],
        }),
      update_properties: (p: { properties: Record<string, unknown> }) => {
        writes.push({ ...p.properties });
        return Promise.resolve(undefined);
      },
      update_entity_name: () => Promise.reject(new Error("rename store unavailable")),
    } as never);
    const { module } = mountModule(NotesModule, { graph });

    await expect(
      module.update({ id: NOTE_ID, title: "new title", body: "new body" }),
    ).rejects.toThrow("rename store unavailable");

    expect(writes.at(-1)).toMatchObject({
      title: "old title",
      body: "old body",
      updated_at: "2026-07-01T00:00:00Z",
    });
  });
});
