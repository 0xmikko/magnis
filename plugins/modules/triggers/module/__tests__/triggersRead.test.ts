/**
 * @layer: module
 * @test-id: tst_module_triggers_read_001
 * @scenario: scn_triggers_read_001
 * @covers: plugins/modules/triggers/module/service.ts::get,list,list_for_entity,fire_history
 * @deterministic: yes
 * @fixtures: fixed trigger definition, links, and native RPC responses
 * @legacy-id: tst_trig_plugin_100_crud_roundtrip
 * @legacy-id: tst_trig_plugin_101_link_unlink_list_for_entity
 * @legacy-id: tst_trig_plugin_102_create_belongs_to_episode
 * @legacy-id: tst_trig_plugin_108_not_found_paths_error
 */
import { describe, expect, it, vi } from "vitest";
import { entity, mockGraph, mountModule } from "@magnis/testkit/module";
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
    entity: entity(TRIGGER_ID, "Watch prices", { schema_id: TRIGGER, properties: CONFIG }),
    links: [
      { id: "watch", from_id: TRIGGER_ID, to_id: TARGET_ID, kind: "watches" },
      { id: "parent", from_id: TRIGGER_ID, to_id: EPISODE_ID, kind: "triggers.belongs_to" },
    ],
  };
}

describe("tst_module_triggers_read_001 — trigger definition reads", () => {
  it("shapes get with watched and parent entities", async () => {
    const graph = mockGraph({
      get_entity_full: (id: string) => {
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
      watched_entities: [{ id: TARGET_ID, name: "Vendor inbox" }],
      parent_episode_id: EPISODE_ID,
      parent_episode_name: "Fundraise",
    });
  });

  it("filters list by config status and includes watched names", async () => {
    const paused = {
      entity: entity("paused", "Paused", {
        schema_id: TRIGGER,
        properties: { ...CONFIG, name: "Paused", status: "paused" },
      }),
      links: [],
    };
    const graph = mockGraph({
      list_entities: () =>
        Promise.resolve({ items: [triggerDetail().entity, paused.entity], total: 2 }),
      get_entity_full: (id: string) => {
        if (id === TRIGGER_ID) return Promise.resolve(triggerDetail());
        if (id === "paused") return Promise.resolve(paused);
        if (id === TARGET_ID) return Promise.resolve({ entity: entity(id, "Vendor inbox"), links: [] });
        return Promise.resolve(null);
      },
    });
    const module = mountModule(TriggersModule, { graph }).module;

    const result = await module.list({ status: "active" });
    expect(result).toEqual([
      expect.objectContaining({ id: TRIGGER_ID, watched_entity_names: ["Vendor inbox"] }),
    ]);
  });

  it("lists each watcher once across direct and resolved watchable anchors", async () => {
    const relatedId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const graph = mockGraph({
      get_entity_full: (id: string) => {
        if (id === TARGET_ID) return Promise.resolve({ entity: entity(id, "Contact"), links: [] });
        if (id === TRIGGER_ID) return Promise.resolve(triggerDetail());
        return Promise.resolve(null);
      },
      list_links_for_entity: () =>
        Promise.resolve([{ id: "watch", from_id: TRIGGER_ID, to_id: TARGET_ID, kind: "watches" }]),
    });
    const execute = vi.fn((method: string) => {
      if (method === "triggers.resolve_watchable") {
        return Promise.resolve({
          watchable: [{ id: relatedId, name: "Email", schema_id: "email.address", link_kind: "identity" }],
        });
      }
      throw new Error(`unexpected rpc: ${method}`);
    });
    const module = mountModule(TriggersModule, { graph, rpc: { execute } }).module;

    const result = await module.list_for_entity({ entity_id: TARGET_ID });
    expect(result.map((item) => item.id)).toEqual([TRIGGER_ID]);
    expect(graph.spies.list_links_for_entity).toHaveBeenCalledTimes(2);
  });

  it("delegates fire history with a default or explicit bound", async () => {
    const history = [
      { fired_at: "2026-08-02T00:00:00Z", event_entity_id: TARGET_ID, outcome: "spawned" },
    ];
    const execute = vi.fn(() => Promise.resolve(history));
    const module = mountModule(TriggersModule, { rpc: { execute } }).module;

    await expect(module.fire_history({ trigger_id: TRIGGER_ID })).resolves.toBe(history);
    await module.fire_history({ trigger_id: TRIGGER_ID, limit: 2 });
    expect(execute.mock.calls).toEqual([
      ["triggers.fire_history", { trigger_id: TRIGGER_ID, limit: 50 }],
      ["triggers.fire_history", { trigger_id: TRIGGER_ID, limit: 2 }],
    ]);
  });

  it("returns no anchor results and a uniform error for missing triggers", async () => {
    const graph = mockGraph({ get_entity_full: () => Promise.resolve(null) });
    const module = mountModule(TriggersModule, { graph }).module;

    await expect(module.get({ id: TRIGGER_ID })).rejects.toThrow(`trigger not found: ${TRIGGER_ID}`);
    await expect(module.list_for_entity({ entity_id: TARGET_ID })).resolves.toEqual([]);
  });
});
