// Triggers write surface — a trigger with no gate condition fires on
// EVERYTHING it watches. `create` silently defaulted a missing or blank
// `gate_prompt` to "", and `update` accepted "" as a real value, so the agent
// passing a differently-named field produced a live, unconditional trigger.
// The partial-write paths are the second half: entity, facet and links were
// written one by one with nothing undone when a later step failed.

import { describe, expect, it, vi } from "vitest";
import { entity, facet, mockGraph, mountModule, type MockGraph } from "@magnis/testkit/module";
import { TriggersModule } from "../service.ts";
import { TRIGGER, TRIGGER_CONFIG } from "../../schema.ts";
import type { TriggerFacets } from "../../types.ts";

const TRIGGER_ID = "22222222-2222-4222-8222-222222222222";

type G = MockGraph<TriggerFacets>;

function createGraph(overrides: Record<string, unknown> = {}): G {
  return mockGraph<TriggerFacets>({
    create_entity: () => Promise.resolve(entity(TRIGGER_ID, "T", { schema_id: TRIGGER })),
    attach_facet: () => Promise.resolve(undefined),
    add_link: () => Promise.resolve(undefined),
    delete_entity: () => Promise.resolve(undefined),
    ...overrides,
  } as never);
}

function existingTrigger(): G {
  return mockGraph<TriggerFacets>({
    get_entity_full: () =>
      Promise.resolve({
        entity: entity(TRIGGER_ID, "watch replies", { schema_id: TRIGGER }),
        facets: [
          facet("f1", TRIGGER_CONFIG, {
            name: "watch replies",
            gate_prompt: "a reply from the vendor arrived",
            action_prompt: "update the note",
            status: "active",
            event_kinds: ["sync_ingested"],
            debounce_seconds: 0,
            firing_count: 0,
          }),
        ],
        links: [],
      }),
    attach_facet: () => Promise.resolve(undefined),
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
      attach_facet: () => Promise.reject(new Error("facet store unavailable")),
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
    expect(graph.spies.attach_facet).not.toHaveBeenCalled();
  });

  it("tst_module_triggers_write_002 does not rename when the config write fails", async () => {
    const graph = mockGraph<TriggerFacets>({
      get_entity_full: () =>
        Promise.resolve({
          entity: entity(TRIGGER_ID, "old name", { schema_id: TRIGGER }),
          facets: [
            facet("f1", TRIGGER_CONFIG, {
              name: "old name",
              gate_prompt: "g",
              action_prompt: "a",
              status: "active",
              event_kinds: ["sync_ingested"],
              debounce_seconds: 0,
              firing_count: 0,
            }),
          ],
          links: [],
        }),
      attach_facet: () => Promise.reject(new Error("facet store unavailable")),
      update_entity_name: () => Promise.resolve(undefined),
    } as never);
    const { module } = mountModule(TriggersModule, { graph, rpc });

    await expect(module.update({ id: TRIGGER_ID, name: "new name" })).rejects.toThrow(
      "facet store unavailable",
    );

    expect(graph.spies.update_entity_name).not.toHaveBeenCalled();
  });
});
