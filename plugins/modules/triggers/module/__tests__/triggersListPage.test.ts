/**
 * @layer: module
 * @test-id: tst_module_triggers_list_page_001
 * @scenario: scn_triggers_standard_module_001
 * @covers: plugins/modules/triggers/module/service.ts::TriggersModule.list_page
 * @deterministic: yes
 *
 * The standard frontend module consumes a paginated, searchable RPC envelope.
 * The agent-facing `triggers.list` remains unchanged.
 */
import { describe, expect, it } from "vitest";
import type { PaginatedResponse } from "@magnis/plugin-sdk";
import { entity, facet, mockGraph, mountModule } from "@magnis/testkit/module";
import { TriggersModule } from "../service.ts";
import { TRIGGER, TRIGGER_CONFIG } from "../../schema.ts";
import type { TriggerFacets, TriggerListItem } from "../../types.ts";

describe("tst_module_triggers_list_page_001 — standard module list RPC", () => {
  it("paginates the graph directly beyond the agent list's 1,000-item cap", async () => {
    const last = entity("trigger-1001", "Last trigger", { schema_id: TRIGGER });
    const graph = mockGraph<TriggerFacets>({
      list_entities: () =>
        Promise.reject(new Error("list_page must not call the capped agent list source")),
      list_entities_window: (params) =>
        Promise.resolve({
          items: params.offset === 1_000
            ? [{
                entity: last,
                data: {
                  name: last.name,
                  gate_prompt: "",
                  action_prompt: "Run the last trigger",
                  status: "active",
                  event_kinds: ["entity.created"],
                  debounce_seconds: 0,
                  firing_count: 0,
                },
              }]
            : [],
          total: 1_001,
        }),
      get_entity_full: (id: string) =>
        Promise.resolve({
          entity: entity(id, "Last trigger", {
            schema_id: TRIGGER,
            properties: {
              name: "Last trigger",
              gate_prompt: "",
              action_prompt: "Run the last trigger",
              status: "active",
              event_kinds: ["entity.created"],
              debounce_seconds: 0,
              firing_count: 0,
            },
          }),
          facets: [],
          links: [],
        }),
    });
    const mounted = await mountModule(TriggersModule, {
      mode: "dispatch",
      graph,
      ctx: { extension_id: "triggers" },
    });

    const page = (await mounted.rpc("triggers.list_page", {
      limit: 1,
      offset: 1_000,
    })) as PaginatedResponse<TriggerListItem>;

    expect(page).toMatchObject({ total: 1_001, limit: 1, offset: 1_000 });
    expect(page.items.map((item) => item.id)).toEqual(["trigger-1001"]);
    expect(graph.spies.list_entities_window).toHaveBeenCalledWith(
      expect.objectContaining({
        schema: TRIGGER,
        limit: 1,
        offset: 1_000,
      }),
    );
    expect(graph.spies.list_entities).not.toHaveBeenCalled();
    expect(mounted.tools.some((tool) => tool.name === "triggers.list_page")).toBe(false);
  });

  it("returns an exact filtered page without exposing the UI RPC as an agent tool", async () => {
    const details = new Map([
      ["trigger-1", "Daily summary"],
      ["trigger-2", "Incoming reply monitor"],
      ["trigger-3", "Incoming reply follow-up"],
    ]);
    const graph = mockGraph<TriggerFacets>({
      list_entities_window: (params) =>
        Promise.resolve({
          items: params.offset === 0
            ? [...details].map(([id, name]) => ({
                entity: entity(id, name, { schema_id: TRIGGER }),
                data: {
                  name,
                  gate_prompt: "",
                  action_prompt: `Run ${name}`,
                  status: "active",
                  event_kinds: ["entity.created"],
                  debounce_seconds: 0,
                  firing_count: 0,
                },
              }))
            : [],
          total: details.size,
        }),
      get_entity_full: (id: string) => {
        const name = details.get(id);
        if (!name) return Promise.resolve(null);
        return Promise.resolve({
          entity: entity(id, name, {
            schema_id: TRIGGER,
            properties: {
              name,
              gate_prompt: "",
              action_prompt: `Run ${name}`,
              status: "active",
              event_kinds: ["entity.created"],
              debounce_seconds: 0,
              firing_count: 0,
            },
          }),
          facets: [],
          links: [],
        });
      },
    });
    const mounted = await mountModule(TriggersModule, {
      mode: "dispatch",
      graph,
      ctx: { extension_id: "triggers" },
    });

    const page = (await mounted.rpc("triggers.list_page", {
      search: "incoming",
      limit: 1,
      offset: 1,
    })) as PaginatedResponse<TriggerListItem>;

    expect(page).toMatchObject({ total: 2, limit: 1, offset: 1 });
    expect(page.items.map((item) => item.name)).toEqual(["Incoming reply follow-up"]);
    expect(mounted.tools.some((tool) => tool.name === "triggers.list_page")).toBe(false);
  });
});
