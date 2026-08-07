// Cron schedules — the plugin never parses cron itself. Every set/change goes
// through the native `triggers.validate_schedule` seam (one parser of record,
// one clock: docs/plans/cron-triggers.md), and the NORMALIZED spec the seam
// returns — engine-stamped `activated_at`, materialized timezone — is persisted
// verbatim. A caller-supplied `activated_at` never reaches the config.

import { describe, expect, it, vi } from "vitest";
import { entity, facet, mockGraph, mountModule, type MockGraph } from "@magnis/testkit/module";
import { TriggersModule } from "../service.ts";
import { TRIGGER, TRIGGER_CONFIG } from "../../schema.ts";
import type { TriggerConfigData, TriggerFacets } from "../../types.ts";

const TRIGGER_ID = "22222222-2222-4222-8222-222222222222";

/// What the native seam returns — the plugin must treat it as opaque truth.
const NORMALIZED = {
  cron: "0 9 * * MON-FRI",
  timezone: "Europe/Belgrade",
  activated_at: "2026-08-07T10:00:00Z",
};

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

function existingTrigger(configExtra: Partial<TriggerConfigData> = {}): G {
  return mockGraph<TriggerFacets>({
    get_entity_full: () =>
      Promise.resolve({
        entity: entity(TRIGGER_ID, "digest", { schema_id: TRIGGER }),
        facets: [
          facet("f1", TRIGGER_CONFIG, {
            name: "digest",
            gate_prompt: "always",
            action_prompt: "summarize",
            status: "active",
            event_kinds: ["sync_ingested"],
            debounce_seconds: 0,
            firing_count: 0,
            ...configExtra,
          }),
        ],
        links: [],
      }),
    attach_facet: () => Promise.resolve(undefined),
    update_entity_name: () => Promise.resolve(undefined),
  } as never);
}

function seamRpc() {
  return {
    execute: vi.fn((method: string) => {
      if (method === "triggers.validate_schedule") {
        return Promise.resolve({ ...NORMALIZED });
      }
      return Promise.resolve(null);
    }),
  };
}

function persistedConfig(graph: G): TriggerConfigData {
  const attachFacet = graph.spies.attach_facet;
  if (!attachFacet) throw new Error("attach_facet spy not mounted");
  const calls = attachFacet.mock.calls as [{ schema_id: string; data: TriggerConfigData }][];
  const configWrites = calls.filter(([cmd]) => cmd.schema_id === TRIGGER_CONFIG);
  expect(configWrites.length).toBeGreaterThan(0);
  const lastWrite = configWrites[configWrites.length - 1];
  if (!lastWrite) throw new Error("no config write recorded");
  return lastWrite[0].data;
}

/**
 * @test-id: tst_module_triggers_sched_001
 * @scenario: scn_cron_trigger_001
 * @covers: plugins/modules/triggers/module/service.ts::TriggersModule.create
 * @deterministic: yes
 * @fixtures: inline graph doubles
 *
 * @invariant: the persisted schedule is the seam's normalized spec VERBATIM —
 * engine clock, not plugin wall clock; caller-supplied activated_at ignored.
 */
describe("triggers.create with a schedule", () => {
  it("tst_module_triggers_sched_001 persists the seam's normalized spec verbatim", async () => {
    const graph = createGraph();
    const rpc = seamRpc();
    const { module } = mountModule(TriggersModule, { graph, rpc });

    await module.create({
      name: "digest",
      gate_prompt: "always",
      action_prompt: "summarize",
      schedule: {
        cron: "0 9 * * MON-FRI",
        timezone: "Europe/Belgrade",
        // The agent boundary is untyped — a caller CAN pass activated_at.
        // It must never reach the seam or the persisted config.
        activated_at: "1999-01-01T00:00:00Z",
      } as never,
    });

    expect(rpc.execute).toHaveBeenCalledWith("triggers.validate_schedule", {
      cron: "0 9 * * MON-FRI",
      timezone: "Europe/Belgrade",
    });
    expect(persistedConfig(graph).schedule).toEqual(NORMALIZED);
  });

  it("tst_module_triggers_sched_001 does not consult the seam without a schedule", async () => {
    const graph = createGraph();
    const rpc = seamRpc();
    const { module } = mountModule(TriggersModule, { graph, rpc });

    await module.create({ name: "n", gate_prompt: "g", action_prompt: "a" });

    const methods = rpc.execute.mock.calls.map(([method]) => method);
    expect(methods).not.toContain("triggers.validate_schedule");
    expect("schedule" in persistedConfig(graph)).toBe(false);
  });
});

/**
 * @test-id: tst_module_triggers_sched_002
 * @scenario: scn_cron_trigger_002
 * @covers: plugins/modules/triggers/module/service.ts::TriggersModule.create
 * @deterministic: yes
 * @fixtures: inline graph doubles
 *
 * @invariant: seam rejection (invalid cron / floor / timezone) surfaces to the
 * agent BEFORE any row is written — no half-created trigger.
 */
describe("triggers.create with an invalid schedule", () => {
  it("tst_module_triggers_sched_002 rejects before creating the entity", async () => {
    const graph = createGraph();
    const rpc = {
      execute: vi.fn((method: string) => {
        if (method === "triggers.validate_schedule") {
          return Promise.reject(
            new Error("schedule too frequent: minimum gap between occurrences is 240s"),
          );
        }
        return Promise.resolve(null);
      }),
    };
    const { module } = mountModule(TriggersModule, { graph, rpc });

    await expect(
      module.create({
        name: "n",
        gate_prompt: "g",
        action_prompt: "a",
        schedule: { cron: "*/4 * * * *" },
      }),
    ).rejects.toThrow(/too frequent/);
    expect(graph.spies.create_entity).not.toHaveBeenCalled();
  });
});

/**
 * @test-id: tst_module_triggers_sched_003
 * @scenario: scn_cron_trigger_001
 * @covers: plugins/modules/triggers/module/service.ts::TriggersModule.update
 * @deterministic: yes
 * @fixtures: inline graph doubles
 *
 * @invariant: update re-normalizes through the seam on every set/change, and
 * `schedule: null` clears the field without consulting the seam.
 */
describe("triggers.update schedule set and clear", () => {
  it("tst_module_triggers_sched_003 sets a schedule through the seam", async () => {
    const graph = existingTrigger();
    const rpc = seamRpc();
    const { module } = mountModule(TriggersModule, { graph, rpc });

    await module.update({
      id: TRIGGER_ID,
      schedule: { cron: "0 9 * * MON-FRI", timezone: "Europe/Belgrade" },
    });

    expect(rpc.execute).toHaveBeenCalledWith("triggers.validate_schedule", {
      cron: "0 9 * * MON-FRI",
      timezone: "Europe/Belgrade",
    });
    expect(persistedConfig(graph).schedule).toEqual(NORMALIZED);
  });

  it("tst_module_triggers_sched_003 clears a schedule with null, seam untouched", async () => {
    const graph = existingTrigger({ schedule: { ...NORMALIZED } });
    const rpc = seamRpc();
    const { module } = mountModule(TriggersModule, { graph, rpc });

    await module.update({ id: TRIGGER_ID, schedule: null });

    const methods = rpc.execute.mock.calls.map(([method]) => method);
    expect(methods).not.toContain("triggers.validate_schedule");
    expect("schedule" in persistedConfig(graph)).toBe(false);
  });
});
