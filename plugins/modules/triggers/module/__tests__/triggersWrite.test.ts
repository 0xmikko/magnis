// Triggers write surface — a trigger with no gate condition fires on
// EVERYTHING it watches. `create` silently defaulted a missing or blank
// `gate_prompt` to "", and `update` accepted "" as a real value, so the agent
// passing a differently-named field produced a live, unconditional trigger.
// The partial-write paths are the second half: entity, record and links were
// written one by one with nothing undone when a later step failed.

import { describe, expect, it, vi } from "vitest";
import { entity, mockGraph, mountModule, type MockGraph } from "@magnis/testkit/module";
import { TriggersModule } from "../service.ts";
import { TRIGGER, TRIGGER_CONFIG } from "../../schema.ts";

const TRIGGER_ID = "22222222-2222-4222-8222-222222222222";

type G = MockGraph;

function createGraph(overrides: Record<string, unknown> = {}): G {
  return mockGraph({
    create_entity: () => Promise.resolve(entity(TRIGGER_ID, "T", { schema_id: TRIGGER })),
    update_properties: () => Promise.resolve(undefined),
    add_link: () => Promise.resolve(undefined),
    delete_entity: () => Promise.resolve(undefined),
    ...overrides,
  } as never);
}

function existingTrigger(): G {
  return mockGraph({
    get_entity_full: () =>
      Promise.resolve({
        entity: entity(TRIGGER_ID, "watch replies", {
          schema_id: TRIGGER,
          properties: {
            name: "watch replies",
            gate_prompt: "a reply from the vendor arrived",
            action_prompt: "update the note",
            status: "active",
            event_kinds: ["sync_ingested"],
            debounce_seconds: 0,
            firing_count: 0,
          },
        }),
        links: [],
      }),
    update_properties: () => Promise.resolve(undefined),
    update_entity_name: () => Promise.resolve(undefined),
  } as never);
}

const rpc = { execute: vi.fn(() => Promise.resolve(null)) };

/**
 * @test-id: tst_module_triggers_write_001
 * @scenario: scn_demo_trigger_002
 * @covers: plugins/modules/triggers/module/service.ts::TriggersModule.create
 * @deterministic: yes
 * @fixtures: inline graph doubles
 *
 * @invariant INV-4 — a trigger without a condition is not creatable.
 */
describe("triggers.create requires a real gate condition", () => {
  it("tst_module_triggers_write_001 rejects a whitespace-only gate", async () => {
    const graph = createGraph();
    const { module } = mountModule(TriggersModule, { graph, rpc });

    await expect(
      module.create({ name: "n", action_prompt: "a", gate_prompt: "   " }),
    ).rejects.toThrow(/gate_prompt/);
    expect(graph.spies.create_entity).not.toHaveBeenCalled();
  });

  it("tst_module_triggers_write_001 rejects a missing gate", async () => {
    const graph = createGraph();
    const { module } = mountModule(TriggersModule, { graph, rpc });

    await expect(module.create({ name: "n", action_prompt: "a" } as never)).rejects.toThrow(
      /gate_prompt/,
    );
    expect(graph.spies.create_entity).not.toHaveBeenCalled();
  });

  it("tst_module_triggers_write_001 leaves no trigger behind when the config write fails", async () => {
    const graph = createGraph({
      update_properties: () => Promise.reject(new Error("facet store unavailable")),
    });
    const { module } = mountModule(TriggersModule, { graph, rpc });

    await expect(
      module.create({ name: "n", action_prompt: "a", gate_prompt: "a reply arrived" }),
    ).rejects.toThrow("facet store unavailable");

    expect(graph.spies.delete_entity).toHaveBeenCalledWith(TRIGGER_ID);
  });

  it("tst_module_triggers_write_001 leaves no trigger behind when a watch link fails", async () => {
    const graph = createGraph({
      get_entity_full: () => Promise.resolve(null),
      add_link: () => Promise.reject(new Error("link store unavailable")),
    });
    const { module } = mountModule(TriggersModule, { graph, rpc });

    await expect(
      module.create({
        name: "n",
        action_prompt: "a",
        gate_prompt: "a reply arrived",
        watch_entity_ids: ["33333333-3333-4333-8333-333333333333"],
      }),
    ).rejects.toThrow("link store unavailable");

    expect(graph.spies.delete_entity).toHaveBeenCalledWith(TRIGGER_ID);
  });
});

/**
 * @test-id: tst_module_triggers_write_002
 * @scenario: scn_demo_trigger_002
 * @covers: plugins/modules/triggers/module/service.ts::TriggersModule.update
 * @deterministic: yes
 * @fixtures: inline graph doubles
 *
 * @invariant INV-4, INV-25
 */
describe("triggers.update keeps the gate real and the write whole", () => {
  it("tst_module_triggers_write_002 rejects blanking the gate", async () => {
    const graph = existingTrigger();
    const { module } = mountModule(TriggersModule, { graph, rpc });

    await expect(module.update({ id: TRIGGER_ID, gate_prompt: "" })).rejects.toThrow(/gate_prompt/);
    expect(graph.spies.update_properties).not.toHaveBeenCalled();
  });

  it("tst_module_triggers_write_002 does not rename when the config write fails", async () => {
    const graph = mockGraph({
      get_entity_full: () =>
        Promise.resolve({
          entity: entity(TRIGGER_ID, "old name", {
            schema_id: TRIGGER,
            properties: {
              name: "old name",
              gate_prompt: "g",
              action_prompt: "a",
              status: "active",
              event_kinds: ["sync_ingested"],
              debounce_seconds: 0,
              firing_count: 0,
            },
          }),
          links: [],
        }),
      update_properties: () => Promise.reject(new Error("facet store unavailable")),
      update_entity_name: () => Promise.resolve(undefined),
    } as never);
    const { module } = mountModule(TriggersModule, { graph, rpc });

    await expect(module.update({ id: TRIGGER_ID, name: "new name" })).rejects.toThrow(
      "facet store unavailable",
    );

    expect(graph.spies.update_entity_name).not.toHaveBeenCalled();
  });
});

/**
 * @test-id: tst_module_triggers_write_003
 * @scenario: scn_demo_trigger_002
 * @covers: plugins/modules/triggers/module/service.ts::TriggersModule.update
 * @deterministic: yes
 * @fixtures: inline graph doubles
 *
 * @invariant INV-25 — regression. The snapshot used for compensation was taken
 * AFTER the first field was applied, so a failed rename restored the old NAME
 * while persisting the NEW gate_prompt: a failed update silently rewrote the
 * trigger's condition. Found by review probe, not by the original tests.
 */
describe("triggers.update compensation restores EVERY field", () => {
  it("tst_module_triggers_write_003 a failed rename keeps the original gate_prompt", async () => {
    const writes: Record<string, unknown>[] = [];
    const graph = mockGraph({
      get_entity_full: () =>
        Promise.resolve({
          entity: entity(TRIGGER_ID, "old name", {
            schema_id: TRIGGER,
            properties: {
              name: "old name",
              gate_prompt: "OLD GATE",
              action_prompt: "a",
              status: "active",
              event_kinds: ["sync_ingested"],
              debounce_seconds: 0,
              firing_count: 0,
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
    const { module } = mountModule(TriggersModule, { graph, rpc });

    await expect(
      module.update({ id: TRIGGER_ID, name: "new name", gate_prompt: "NEW GATE" }),
    ).rejects.toThrow("rename store unavailable");

    const restored = writes.at(-1);
    expect(restored).toMatchObject({ name: "old name", gate_prompt: "OLD GATE" });
  });

  it("tst_module_triggers_write_003 a failed rollback names BOTH failures", async () => {
    let attaches = 0;
    const graph = mockGraph({
      get_entity_full: () =>
        Promise.resolve({
          entity: entity(TRIGGER_ID, "old name", {
            schema_id: TRIGGER,
            properties: {
              name: "old name",
              gate_prompt: "OLD GATE",
              action_prompt: "a",
              status: "active",
              event_kinds: ["sync_ingested"],
              debounce_seconds: 0,
              firing_count: 0,
            },
          }),
          links: [],
        }),
      update_properties: () => {
        attaches++;
        return attaches === 1
          ? Promise.resolve(undefined)
          : Promise.reject(new Error("rollback store unavailable"));
      },
      update_entity_name: () => Promise.reject(new Error("rename store unavailable")),
    } as never);
    const { module } = mountModule(TriggersModule, { graph, rpc });

    // The host serialises errors as String(e.stack), which carries neither
    // AggregateError.errors nor .cause — so both causes must be in the text.
    await expect(module.update({ id: TRIGGER_ID, name: "new name" })).rejects.toThrow(
      /rename store unavailable[\s\S]*rollback store unavailable/,
    );
  });
});

/**
 * @test-id: tst_module_triggers_crud_001
 * @scenario: scn_triggers_crud_001
 * @covers: plugins/modules/triggers/module/service.ts::create,update,delete,link,unlink
 * @deterministic: yes
 * @fixtures: one trigger, two watch targets, and strict host doubles
 * @legacy-id: tst_trig_plugin_100_crud_roundtrip
 * @legacy-id: tst_trig_plugin_101_link_unlink_list_for_entity
 * @legacy-id: tst_trig_plugin_102_create_belongs_to_episode
 * @legacy-id: tst_trig_plugin_104_update_partial_preserves_other_fields
 * @legacy-id: tst_trig_plugin_106_unlink_is_selective
 * @legacy-id: tst_trig_plugin_108_not_found_paths_error
 */
describe("tst_module_triggers_crud_001 — trigger definition commands", () => {
  it("creates a complete definition and parent/watch links before invalidating cache", async () => {
    const targetId = "33333333-3333-4333-8333-333333333333";
    const episodeId = "44444444-4444-4444-8444-444444444444";
    const graph = createGraph({
      get_entity_full: () =>
        Promise.resolve({ entity: entity(episodeId, "Parent", { schema_id: "episodes.episode" }), links: [] }),
    });
    const execute = vi.fn((method: string) => {
      if (method === "triggers.validate_watch") return Promise.resolve(null);
      if (method === "triggers.invalidate_cache") return Promise.resolve(null);
      throw new Error(`unexpected rpc: ${method}`);
    });
    const module = mountModule(TriggersModule, { graph, rpc: { execute } }).module;

    const result = await module.create({
      name: "  Price tracker  ",
      gate_prompt: " price changed ",
      action_prompt: " notify me ",
      watch_entity_ids: [targetId],
      episode_id: episodeId,
      debounce_seconds: 30,
    });

    expect(result).toMatchObject({
      id: TRIGGER_ID,
      name: "Price tracker",
      gate_prompt: "price changed",
      action_prompt: "notify me",
      status: "active",
      episode_id: episodeId,
    });
    expect(graph.spies.update_properties).toHaveBeenCalledWith({
      entity_id: TRIGGER_ID,
      properties: expect.objectContaining({
        name: "Price tracker",
        gate_prompt: "price changed",
        action_prompt: "notify me",
        event_kinds: ["sync_ingested"],
        debounce_seconds: 30,
        firing_count: 0,
      }),
    });
    const addLink = graph.spies.add_link;
    if (addLink === undefined) throw new Error("trigger create: add_link spy missing");
    expect(addLink.mock.calls.map(([value]) => value)).toEqual([
      { from_id: TRIGGER_ID, to_id: targetId, kind: "watches" },
      { from_id: TRIGGER_ID, to_id: episodeId, kind: "triggers.belongs_to" },
    ]);
    expect(execute).toHaveBeenLastCalledWith("triggers.invalidate_cache", {});
  });

  it("partially updates only requested config fields", async () => {
    let properties = {
      name: "watch replies",
      gate_prompt: "a reply from the vendor arrived",
      action_prompt: "update the note",
      status: "active",
      event_kinds: ["sync_ingested"],
      debounce_seconds: 0,
      firing_count: 0,
    };
    const graph = mockGraph({
      get_entity_full: () =>
        Promise.resolve({
          entity: entity(TRIGGER_ID, "watch replies", {
            schema_id: TRIGGER,
            properties,
          }),
          links: [],
        }),
      update_properties: (params: { entity_id: string; properties: Record<string, unknown> }) => {
        properties = { ...params.properties } as typeof properties;
        return Promise.resolve(undefined);
      },
      update_entity_name: () => Promise.resolve(undefined),
    });
    const execute = vi.fn(() => Promise.resolve(null));
    const module = mountModule(TriggersModule, { graph, rpc: { execute } }).module;

    const result = await module.update({
      id: TRIGGER_ID,
      gate_prompt: "new condition",
      debounce_seconds: 600,
    });

    expect(result).toMatchObject({
      name: "watch replies",
      gate_prompt: "new condition",
      action_prompt: "update the note",
      status: "active",
      debounce_seconds: 600,
    });
    expect(graph.spies.update_entity_name).not.toHaveBeenCalled();
    expect(graph.spies.update_properties).toHaveBeenCalledWith({
      entity_id: TRIGGER_ID,
      properties: expect.objectContaining({
        name: "watch replies",
        gate_prompt: "new condition",
        action_prompt: "update the note",
      }),
    });
  });

  it("links an owned target and unlinks only the matching watches edge", async () => {
    const targetId = "33333333-3333-4333-8333-333333333333";
    const keepId = "44444444-4444-4444-8444-444444444444";
    const triggerDetail = {
      entity: entity(TRIGGER_ID, "T", {
        schema_id: TRIGGER,
        properties: {
          name: "T",
          gate_prompt: "g",
          action_prompt: "a",
          status: "active",
          event_kinds: ["sync_ingested"],
          debounce_seconds: 0,
          firing_count: 0,
        },
      }),
      links: [],
    };
    const graph = mockGraph({
      get_entity_full: (id: string) =>
        Promise.resolve(id === TRIGGER_ID ? triggerDetail : { entity: entity(id, "Target"), links: [] }),
      add_link: () => Promise.resolve(undefined),
      list_links_for_entity: () =>
        Promise.resolve([
          { id: "drop", from_id: TRIGGER_ID, to_id: targetId, kind: "watches" },
          { id: "keep", from_id: TRIGGER_ID, to_id: keepId, kind: "watches" },
          { id: "other-kind", from_id: TRIGGER_ID, to_id: targetId, kind: "belongs_to" },
        ]),
      delete_link: () => Promise.resolve(undefined),
    });
    const module = mountModule(TriggersModule, {
      graph,
      rpc: { execute: vi.fn(() => Promise.resolve(null)) },
    }).module;

    await expect(module.link({ trigger_id: TRIGGER_ID, entity_id: targetId })).resolves.toEqual({
      linked: true,
    });
    await expect(module.unlink({ trigger_id: TRIGGER_ID, entity_id: targetId })).resolves.toEqual({
      unlinked: true,
    });
    expect(graph.spies.delete_link).toHaveBeenCalledTimes(1);
    expect(graph.spies.delete_link).toHaveBeenCalledWith("drop");
  });

  it("deletes an existing trigger and rejects missing command targets", async () => {
    const graph = mockGraph({
      get_entity_full: () => Promise.resolve(null),
    });
    const module = mountModule(TriggersModule, {
      graph,
      rpc: { execute: vi.fn(() => Promise.resolve(null)) },
    }).module;

    await expect(module.update({ id: TRIGGER_ID, name: "x" })).rejects.toThrow(
      `trigger not found: ${TRIGGER_ID}`,
    );
    await expect(module.delete({ id: TRIGGER_ID })).rejects.toThrow(
      `trigger not found: ${TRIGGER_ID}`,
    );

    const existing = existingTrigger();
    existing.spies.delete_entity = vi.fn(() => Promise.resolve(undefined));
    const deletable = mountModule(TriggersModule, {
      graph: existing,
      rpc: { execute: vi.fn(() => Promise.resolve(null)) },
    }).module;
    await expect(deletable.delete({ id: TRIGGER_ID })).resolves.toEqual({ deleted: true });
    expect(existing.spies.delete_entity).toHaveBeenCalledWith(TRIGGER_ID);
  });
});
