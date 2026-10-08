// Triggers write surface — a trigger with no gate condition fires on
// EVERYTHING it watches. `create` silently defaulted a missing or blank
// `gate_prompt` to "", and `update` accepted "" as a real value, so the agent
// passing a differently-named field produced a live, unconditional trigger.
// The partial-write paths are the second half: entity, record and links were
// written one by one with nothing undone when a later step failed.

import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { JsonObject, PropertiesUpdate } from "@magnis/sdk";
import { entity, link, mockGraph, mountModule, type MockGraph } from "@magnis/testkit/module";
import { TriggersModule } from "../service.ts";
import { TRIGGER, TRIGGER_CONFIG } from "../../schema.ts";

const TRIGGER_ID = "22222222-2222-4222-8222-222222222222";

/**
 * @test-id: tst_module_triggers_forms_003
 * @scenario: scn_tools_trigger_forms
 * @covers: modules/triggers/module/service.ts
 * @deterministic: yes
 * @fixtures: actual harvested create schema, explicit watches and raw email/chat inputs
 */
it("tst_module_triggers_forms_003 compiles portable mutually exclusive create forms", async () => {
  const { tools } = await mountModule(TriggersModule, { mode: "dispatch", ctx: { extensionId: "triggers" } });
  const definition = tools.find(({ name }) => name === "triggers.trigger.create");
  if (definition === undefined) throw new Error("trigger create definition missing");
  const schema = z.fromJSONSchema(definition.inputSchema as Parameters<typeof z.fromJSONSchema>[0]);
  const prompts = { gate_prompt: "reply", action_prompt: "notify" };
  for (const form of [
    { name: "Watch", watch_entity_ids: [TRIGGER_ID] },
    { name: "Clock", schedule: { cron: "0 9 * * *" } },
    { from_address: "morgan@example.test" },
    { from_addresses: ["morgan@example.test"] },
    { from_address: "ada@example.test", from_addresses: ["morgan@example.test"] },
    { chat_id: 42 },
  ]) expect(schema.safeParse({ ...prompts, ...form }).success).toBe(true);
  for (const form of [
    {},
    { name: "Mixed", from_address: "morgan@example.test" },
    { chat_id: 42, from_addresses: ["morgan@example.test"] },
    { from_addresses: ["morgan@example.test"], watch_entity_ids: [TRIGGER_ID] },
    { chat_id: 42, watch_entity_ids: [TRIGGER_ID] },
    { from_addresses: [] },
  ]) expect(schema.safeParse({ ...prompts, ...form }).success).toBe(false);
  expect(schema.safeParse({ chat_id: 42 }).success).toBe(false);
});

type G = MockGraph;

function createGraph(overrides: Record<string, unknown> = {}): G {
  return mockGraph({
    createEntity: () => Promise.resolve(entity(TRIGGER_ID, "T", { schemaId: TRIGGER })),
    updateProperties: () => Promise.resolve(undefined),
    addLink: () => Promise.resolve(undefined),
    deleteEntity: () => Promise.resolve(undefined),
    ...overrides,
  } as never);
}

function existingTrigger(): G {
  return mockGraph({
    getEntityFull: () =>
      Promise.resolve({
        entity: entity(TRIGGER_ID, "watch replies", {
          schemaId: TRIGGER,
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
    updateProperties: () => Promise.resolve(undefined),
    updateEntityName: () => Promise.resolve(undefined),
  } as never);
}

const rpc = { execute: vi.fn(() => Promise.resolve(null)) };

/**
 * @test-id: tst_module_triggers_write_001
 * @scenario: scn_demo_trigger_002
 * @covers: modules/triggers/module/service.ts::TriggersModule.create
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
    expect(graph.spies.createEntity).not.toHaveBeenCalled();
  });

  it("tst_module_triggers_write_001 rejects a missing gate", async () => {
    const graph = createGraph();
    const { module } = mountModule(TriggersModule, { graph, rpc });

    await expect(module.create({ name: "n", action_prompt: "a" } as never)).rejects.toThrow(
      /gate_prompt/,
    );
    expect(graph.spies.createEntity).not.toHaveBeenCalled();
  });

  it("tst_module_triggers_write_001 leaves no trigger behind when the config write fails", async () => {
    const graph = createGraph({
      updateProperties: () => Promise.reject(new Error("facet store unavailable")),
    });
    const { module } = mountModule(TriggersModule, { graph, rpc });

    await expect(
      module.create({ name: "n", action_prompt: "a", gate_prompt: "a reply arrived" }),
    ).rejects.toThrow("facet store unavailable");

    expect(graph.spies.deleteEntity).toHaveBeenCalledWith(TRIGGER_ID);
  });

  it("tst_module_triggers_write_001 leaves no trigger behind when a watch link fails", async () => {
    const graph = createGraph({
      getEntityFull: () => Promise.resolve(null),
      addLink: () => Promise.reject(new Error("link store unavailable")),
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

    expect(graph.spies.deleteEntity).toHaveBeenCalledWith(TRIGGER_ID);
  });
});

/**
 * @test-id: tst_module_triggers_watch_validation_001
 * @scenario: scn_backend_tests_005
 * @covers: modules/triggers/module/service.ts::TriggersModule.create
 * @legacy-id: tst_int_trig_090_triggers_create_non_triggerable_returns_clarification
 * @legacy-id: tst_int_trig_091_triggers_create_triggerable_succeeds
 * @legacy-id: tst_int_trig_094_triggers_create_mixed_watchable_and_not
 * @deterministic: yes
 * @fixtures: strict native validate-watch RPC double
 */
describe("tst_module_triggers_watch_validation_001 — native watch validation", () => {
  it("returns the native clarification verbatim before writing", async () => {
    const clarification = {
      status: "clarification_needed",
      message: "one target does not produce events",
      nonTriggerableEntities: [
        { entity: { id: "subject", name: null, schemaId: "contacts.person" }, linkedWatchableEntities: [] },
      ],
    };
    const graph = createGraph();
    const execute = vi.fn((method: string) => {
      if (method === "triggers.validate_watch") return Promise.resolve(clarification);
      throw new Error(`unexpected rpc: ${method}`);
    });
    const { module } = mountModule(TriggersModule, { graph, rpc: { execute } });

    await expect(
      module.create({
        name: "watch",
        gate_prompt: "changed",
        action_prompt: "notify",
        watch_entity_ids: ["33333333-3333-4333-8333-333333333333"],
      }),
    ).resolves.toBe(clarification);
    expect(execute).toHaveBeenCalledWith("triggers.validate_watch", {
      watchEntityIds: ["33333333-3333-4333-8333-333333333333"],
    });
    expect(graph.spies.createEntity).not.toHaveBeenCalled();
  });
});

/**
 * @test-id: tst_module_triggers_write_002
 * @scenario: scn_demo_trigger_002
 * @covers: modules/triggers/module/service.ts::TriggersModule.update
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
    expect(graph.spies.updateProperties).not.toHaveBeenCalled();
  });

  it("tst_module_triggers_write_002 does not rename when the config write fails", async () => {
    const graph = mockGraph({
      getEntityFull: () =>
        Promise.resolve({
          entity: entity(TRIGGER_ID, "old name", {
            schemaId: TRIGGER,
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
      updateProperties: () => Promise.reject(new Error("facet store unavailable")),
      updateEntityName: () => Promise.resolve(undefined),
    } as never);
    const { module } = mountModule(TriggersModule, { graph, rpc });

    await expect(module.update({ id: TRIGGER_ID, name: "new name" })).rejects.toThrow(
      "facet store unavailable",
    );

    expect(graph.spies.updateEntityName).not.toHaveBeenCalled();
  });
});

/**
 * @test-id: tst_module_triggers_write_003
 * @scenario: scn_demo_trigger_002
 * @covers: modules/triggers/module/service.ts::TriggersModule.update
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
      getEntityFull: () =>
        Promise.resolve({
          entity: entity(TRIGGER_ID, "old name", {
            schemaId: TRIGGER,
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
      updateProperties: (p: PropertiesUpdate) => {
        writes.push({ ...(p.properties as JsonObject) });
        return Promise.resolve(undefined);
      },
      updateEntityName: () => Promise.reject(new Error("rename store unavailable")),
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
      getEntityFull: () =>
        Promise.resolve({
          entity: entity(TRIGGER_ID, "old name", {
            schemaId: TRIGGER,
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
      updateProperties: () => {
        attaches++;
        return attaches === 1
          ? Promise.resolve(undefined)
          : Promise.reject(new Error("rollback store unavailable"));
      },
      updateEntityName: () => Promise.reject(new Error("rename store unavailable")),
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
 * @covers: modules/triggers/module/service.ts::create,update,delete,link,unlink
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
      getEntityFull: () =>
        Promise.resolve({ entity: entity(episodeId, "Parent", { schemaId: "episodes.episode" }), links: [] }),
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
      gatePrompt: "price changed",
      actionPrompt: "notify me",
      status: "active",
      schemaId: TRIGGER,
      episodeId,
    });
    expect(execute).toHaveBeenCalledWith("triggers.validate_watch", { watchEntityIds: [targetId] });
    expect(graph.spies.updateProperties).toHaveBeenCalledWith({
      entityId: TRIGGER_ID,
      properties: expect.objectContaining({
        name: "Price tracker",
        gate_prompt: "price changed",
        action_prompt: "notify me",
        event_kinds: ["sync_ingested"],
        debounce_seconds: 30,
        firing_count: 0,
      }),
    });
    const addLink = graph.spies.addLink;
    if (addLink === undefined) throw new Error("trigger create: addLink spy missing");
    expect(addLink.mock.calls.map(([value]) => value)).toEqual([
      { from: TRIGGER_ID, to: targetId, kind: "watches" },
      { from: TRIGGER_ID, to: episodeId, kind: "belongs_to" },
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
      getEntityFull: () =>
        Promise.resolve({
          entity: entity(TRIGGER_ID, "watch replies", {
            schemaId: TRIGGER,
            properties,
          }),
          links: [],
        }),
      updateProperties: (params) => {
        properties = { ...(params.properties as typeof properties) };
        return Promise.resolve(undefined);
      },
      updateEntityName: () => Promise.resolve(undefined),
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
      gatePrompt: "new condition",
      actionPrompt: "update the note",
      status: "active",
      debounceSeconds: 600,
    });
    expect(graph.spies.updateEntityName).not.toHaveBeenCalled();
    expect(graph.spies.updateProperties).toHaveBeenCalledWith({
      entityId: TRIGGER_ID,
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
        schemaId: TRIGGER,
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
      getEntityFull: (id: string) =>
        Promise.resolve(id === TRIGGER_ID ? triggerDetail : { entity: entity(id, "Target"), links: [] }),
      addLink: () => Promise.resolve(undefined),
      listLinksForEntity: () =>
        Promise.resolve([
          link(TRIGGER_ID, targetId, "watches", { id: "drop" }),
          link(TRIGGER_ID, keepId, "watches", { id: "keep" }),
          link(TRIGGER_ID, targetId, "belongs_to", { id: "other-kind" }),
        ]),
      deleteLink: () => Promise.resolve(undefined),
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
    expect(graph.spies.deleteLink).toHaveBeenCalledTimes(1);
    expect(graph.spies.deleteLink).toHaveBeenCalledWith("drop");
  });

  it("deletes an existing trigger and rejects missing command targets", async () => {
    const graph = mockGraph({
      getEntityFull: () => Promise.resolve(null),
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
    existing.spies.deleteEntity = vi.fn(() => Promise.resolve(undefined));
    const deletable = mountModule(TriggersModule, {
      graph: existing,
      rpc: { execute: vi.fn(() => Promise.resolve(null)) },
    }).module;
    await expect(deletable.delete({ id: TRIGGER_ID })).resolves.toEqual({ deleted: true });
    expect(existing.spies.deleteEntity).toHaveBeenCalledWith(TRIGGER_ID);
  });
});

/** @test-id: tst_module_triggers_forms_001
 * @scenario: scn_tools_trigger_forms
 * @covers: modules/triggers/module/service.ts::TriggersModule.create
 * @deterministic: yes — owner RPC and graph doubles
 */
it("tst_module_triggers_forms_001 validates raw email form before owner lookup and creates one trigger", async () => {
  const graph = createGraph({ getEntityFull: () => Promise.resolve(null) });
  const execute = vi.fn(async (method: string) => method === "email.ensure_addresses" ? { ids: ["address-1"] } : null);
  const { module } = mountModule(TriggersModule, { graph, rpc: { execute } });
  await expect(module.create({ from_addresses: ["Morgan@Example.test"], gate_prompt: "receipt", action_prompt: "notify", episode_id: "foreign" })).rejects.toThrow("episode");
  expect(execute).not.toHaveBeenCalled();
  await expect(module.create({ from_addresses: ["Morgan@Example.test"], chat_id: 12, gate_prompt: "receipt", action_prompt: "notify" })).rejects.toThrow("form");
  expect(execute).not.toHaveBeenCalled();
  const result = await module.create({ from_addresses: ["Morgan@Example.test"], gate_prompt: "receipt", action_prompt: "notify", debounce_seconds: 12 });
  expect(execute).toHaveBeenCalledWith("email.ensure_addresses", { items: [{ address: "morgan@example.test" }] });
  expect(graph.spies.createEntity).toHaveBeenCalledTimes(1);
  expect(graph.spies.addLink).toHaveBeenCalledWith({ from: TRIGGER_ID, to: "address-1", kind: "watches" });
  expect(graph.spies.updateProperties).toHaveBeenCalledWith(expect.objectContaining({ properties: expect.objectContaining({ debounce_seconds: 12, schema_filter: "email" }) }));
  expect(result).toMatchObject({ name: "Email trigger: morgan@example.test" });
});

/** @test-id: tst_module_triggers_forms_002
 * @scenario: scn_tools_trigger_forms
 * @covers: modules/triggers/module/service.ts::TriggersModule.create
 * @deterministic: yes — owner chat lookup and exact graph write assertions
 */
it("tst_module_triggers_forms_002 resolves a raw Telegram chat once and preserves trigger settings", async () => {
  const graph = createGraph();
  const execute = vi.fn(async (method: string) => method === "telegram.chats.get" ? { entity_id: "chat-entity" } : null);
  const module = mountModule(TriggersModule, { graph, rpc: { execute } }).module;
  await expect(module.create({ chat_id: 42, gate_prompt: "reply", action_prompt: "notify", debounce_seconds: -1 })).rejects.toThrow("debounce");
  expect(execute).not.toHaveBeenCalled();
  const result = await module.create({ chat_id: 42, gate_prompt: "reply", action_prompt: "notify", debounce_seconds: 30 });
  expect(result).toMatchObject({ name: "Telegram trigger: chat 42" });
  expect(execute).toHaveBeenCalledWith("telegram.chats.get", { chat_id: 42 });
  expect(graph.spies.addLink).toHaveBeenCalledWith({ from: TRIGGER_ID, to: "chat-entity", kind: "watches" });
  expect(graph.spies.createEntity).toHaveBeenCalledTimes(1);
  expect(graph.spies.updateProperties).toHaveBeenCalledWith(expect.objectContaining({ properties: expect.objectContaining({ debounce_seconds: 30, schema_filter: "telegram" }) }));
});
