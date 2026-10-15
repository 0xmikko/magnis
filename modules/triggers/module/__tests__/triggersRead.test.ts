/**
 * @layer: module
 * @test-id: tst_module_triggers_read_001
 * @scenario: scn_triggers_read_001
 * @covers: modules/triggers/module/service.ts::get,list,list_for_entity,fire_history
 * @deterministic: yes
 * @fixtures: fixed trigger definition, links, and native RPC responses
 * @legacy-id: tst_trig_plugin_100_crud_roundtrip
 * @legacy-id: tst_trig_plugin_101_link_unlink_list_for_entity
 * @legacy-id: tst_trig_plugin_102_create_belongs_to_episode
 * @legacy-id: tst_trig_plugin_108_not_found_paths_error
 */
import { describe, expect, it, vi } from "vitest";
import type { PluginModuleShape } from "@magnis/plugin-sdk";
import { entity, link, mockGraph, mountModule, page } from "@magnis/testkit/module";
import { TRIGGER } from "../../schema.ts";
import { TriggersModule } from "../service.ts";

const TRIGGER_ID = "88888888-8888-4888-8888-888888888888";
const TARGET_ID = "99999999-9999-4999-8999-999999999999";
const EPISODE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const CONFIG = {
  name: "Watch prices",
  gate_prompt: "price changed",
  action_prompt: "notify me",
  status: "active",
  event_kinds: ["sync_ingested"],
  debounce_seconds: 60,
  firing_count: 2,
  last_fired_at: "2026-08-01T12:00:00Z",
};

function triggerDetail() {
  return {
    entity: entity(TRIGGER_ID, "Watch prices", { schemaId: TRIGGER, properties: CONFIG }),
    links: [
      link(TRIGGER_ID, TARGET_ID, "watches", { id: "watch" }),
      link(TRIGGER_ID, EPISODE_ID, "belongs_to", { id: "parent" }),
    ],
  };
}

describe("tst_module_triggers_read_001 — trigger definition reads", () => {
  it("shapes get with watched and parent entities", async () => {
    const graph = mockGraph({
      getEntities: () => Promise.resolve([entity(EPISODE_ID, "Fundraise", { schemaId: "episodes.episode" })]),
      getEntityFull: (id: string) => {
        if (id === TRIGGER_ID) return Promise.resolve(triggerDetail());
        if (id === TARGET_ID) return Promise.resolve({ entity: entity(id, "Vendor inbox"), links: [] });
        if (id === EPISODE_ID) return Promise.resolve({ entity: entity(id, "Fundraise"), links: [] });
        return Promise.resolve(null);
      },
    });
    const module = mountModule(TriggersModule, { graph }).module;

    await expect(module.get({ id: TRIGGER_ID })).resolves.toMatchObject({
      id: TRIGGER_ID,
      name: "Watch prices",
      status: "active",
      watchedEntities: [{ id: TARGET_ID, name: "Vendor inbox" }],
      parentEpisodeId: EPISODE_ID,
      parentEpisodeName: "Fundraise",
    });
  });

  it("tst_module_trigger_parent_001 ignores project membership and ended parents, and rejects multiple active Episode parents", async () => {
    const project = entity("project", "Launch", { schemaId: "projects.project" });
    const ended = entity("ended-episode", "Old", { schemaId: "episodes.episode" });
    const parent = entity(EPISODE_ID, "Current", { schemaId: "episodes.episode" });
    const other = entity("other-episode", "Other", { schemaId: "episodes.episode" });
    const detail = {
      entity: triggerDetail().entity,
      links: [
        link(TRIGGER_ID, project.id, "belongs_to"),
        link(TRIGGER_ID, ended.id, "belongs_to", { validUntil: "2026-01-01T00:00:00Z" }),
        link(TRIGGER_ID, parent.id, "belongs_to"),
      ],
    };
    const rows = [project, ended, parent, other];
    const graph = mockGraph({
      getEntityFull: (id) => Promise.resolve(id === TRIGGER_ID ? detail : null),
      getEntities: (ids) => Promise.resolve(rows.filter((row) => ids.includes(row.id))),
    });
    const module = mountModule(TriggersModule, { graph }).module;
    await expect(module.get({ id: TRIGGER_ID })).resolves.toMatchObject({ parentEpisodeId: parent.id, parentEpisodeName: "Current" });
    detail.links.push(link(TRIGGER_ID, other.id, "belongs_to"));
    await expect(module.get({ id: TRIGGER_ID })).rejects.toThrow("multiple active parent Episodes");
  });

  it("filters list by config status and includes watched names", async () => {
    const paused = {
      entity: entity("paused", "Paused", {
        schemaId: TRIGGER,
        properties: { ...CONFIG, name: "Paused", status: "paused" },
      }),
      links: [],
    };
    const graph = mockGraph({
      listEntities: () =>
        Promise.resolve(page([triggerDetail().entity, paused.entity])),
      getEntityFull: (id: string) => {
        if (id === TRIGGER_ID) return Promise.resolve(triggerDetail());
        if (id === "paused") return Promise.resolve(paused);
        if (id === TARGET_ID) return Promise.resolve({ entity: entity(id, "Vendor inbox"), links: [] });
        return Promise.resolve(null);
      },
    });
    const module = mountModule(TriggersModule, { graph }).module;

    const result = await module.list({ status: "active" });
    expect(result).toEqual([
      expect.objectContaining({ id: TRIGGER_ID, watchedEntityNames: ["Vendor inbox"] }),
    ]);
  });

  it("lists each watcher once across direct and resolved watchable anchors", async () => {
    const relatedId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const graph = mockGraph({
      getEntityFull: (id: string) => {
        if (id === TARGET_ID) return Promise.resolve({ entity: entity(id, "Contact"), links: [] });
        if (id === TRIGGER_ID) return Promise.resolve(triggerDetail());
        return Promise.resolve(null);
      },
      listLinksForEntity: () =>
        Promise.resolve([link(TRIGGER_ID, TARGET_ID, "watches", { id: "watch" })]),
    });
    const execute = vi.fn((method: string) => {
      if (method === "triggers.resolve_watchable") {
        return Promise.resolve({
          watchable: [{ id: relatedId, name: "Email", schemaId: "email.address", linkKind: "identity" }],
        });
      }
      throw new Error(`unexpected rpc: ${method}`);
    });
    const module = mountModule(TriggersModule, { graph, rpc: { execute } }).module;

    const result = await module.list_for_entity({ entity_id: TARGET_ID });
    expect(result.map((item) => item.id)).toEqual([TRIGGER_ID]);
    expect(graph.spies.listLinksForEntity).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls).toEqual([["triggers.resolve_watchable", { entityId: TARGET_ID }]]);
  });

  /**
   * @test-id: tst_cat_entity_one_type_009
   * @covers modules/triggers/module/service.ts::TriggersModule
   *
   * The host registers every published rpc() method and refuses one whose name
   * a native method already serves, which takes the whole channel down.
   */
  it("tst_cat_entity_one_type_009 publishes no rpc() method under a native seam it calls", async () => {
    await mountModule(TriggersModule, { mode: "dispatch", ctx: { extensionId: "triggers" } });
    const shape = (globalThis as unknown as { __magnis_plugin_module: PluginModuleShape }).__magnis_plugin_module;
    // The native triggers seams this module calls (manifest `call`).
    const nativeSeams = [
      "triggers.validate_watch",
      "triggers.resolve_watchable",
      "triggers.invalidate_cache",
      "triggers.fire_history",
      "triggers.validate_schedule",
      "triggers.fire_now",
    ];
    expect(shape.rpcDeclarations.map((declaration) => declaration.name).filter((name) => nativeSeams.includes(name))).toEqual([]);
  });

  it("delegates fire history with a default or explicit bound", async () => {
    const history = [
      { firedAt: "2026-08-02T00:00:00Z", eventEntityId: TARGET_ID, outcome: "spawned" },
    ];
    const execute = vi.fn(() => Promise.resolve(history));
    const module = mountModule(TriggersModule, { rpc: { execute } }).module;

    await expect(module.fire_history({ trigger_id: TRIGGER_ID })).resolves.toBe(history);
    await module.fire_history({ trigger_id: TRIGGER_ID, limit: 2 });
    expect(execute.mock.calls).toEqual([
      ["triggers.fire_history", { triggerId: TRIGGER_ID, limit: 50 }],
      ["triggers.fire_history", { triggerId: TRIGGER_ID, limit: 2 }],
    ]);
  });

  it("forwards fire_now and resolve_watchable to the native seams in their camelCase params", async () => {
    const graph = mockGraph({
      getEntityFull: (id: string) => Promise.resolve(id === TRIGGER_ID ? triggerDetail() : null),
    });
    const fired = { fired: true, episodeId: EPISODE_ID };
    const execute = vi.fn((method: string) => {
      if (method === "triggers.fire_now") return Promise.resolve(fired);
      if (method === "triggers.resolve_watchable") return Promise.resolve({ watchable: [] });
      throw new Error(`unexpected rpc: ${method}`);
    });
    const module = mountModule(TriggersModule, { graph, rpc: { execute } }).module;

    await expect(
      module.fireNow({ trigger_id: TRIGGER_ID, event_entity_id: TARGET_ID, context: { reason: "manual" } }),
    ).resolves.toBe(fired);
    await module.fireNow({ trigger_id: TRIGGER_ID });
    await expect(module.resolveWatchable({ entity_id: TARGET_ID })).resolves.toEqual({ watchable: [] });
    expect(execute.mock.calls).toEqual([
      ["triggers.fire_now", { triggerId: TRIGGER_ID, eventEntityId: TARGET_ID, context: { reason: "manual" } }],
      ["triggers.fire_now", { triggerId: TRIGGER_ID }],
      ["triggers.resolve_watchable", { entityId: TARGET_ID }],
    ]);
  });

  it("returns no anchor results and a uniform error for missing triggers", async () => {
    const graph = mockGraph({ getEntityFull: () => Promise.resolve(null) });
    const module = mountModule(TriggersModule, { graph }).module;

    await expect(module.get({ id: TRIGGER_ID })).rejects.toThrow(`trigger not found: ${TRIGGER_ID}`);
    await expect(module.list_for_entity({ entity_id: TARGET_ID })).resolves.toEqual([]);
  });
});
