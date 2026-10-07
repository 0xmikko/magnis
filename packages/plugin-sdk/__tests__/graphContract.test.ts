/**
 * @layer: pkg_sdk
 * @test-id: tst_pkg_sdk_graph_001
 * @scenario: scn_google_pull_001
 * @covers: packages/plugin-sdk/contract/module.ts::GraphService
 * @deterministic: yes
 * @fixtures: none
 */
import { expect, expectTypeOf, test } from "vitest";
import { entity, mockGraph, mountModule, syncStateDouble } from "@magnis/testkit/module";
import type { SetSyncEnabledParams, UpdateEntitySyncEnabledResult } from "@magnis/sdk";
import { searchEntitiesPage, writeTool } from "../index.ts";
import type { GraphService, PluginDeps } from "../contract/module.ts";

test("tst_pkg_sdk_graph_extras_001 requests extras across every search page without losing pin zero or stopped sync", async () => {
  const record = entity("10000000-0000-0000-0000-000000000001", "Acme");
  const extras = { pinOrder: 0, archived: false, private: true, indexed: "pending" as const,
    syncEnabled: false, syncRevision: "9007199254740993" };
  const graph = mockGraph({ searchEntitiesByName: async (params) => params.extras === true
    ? [{ entity: record, extras }]
    : [record] });
  const result = await searchEntitiesPage(graph, { query: "Acme", schemaId: "companies.company", limit: 1, offset: 0, extras: true });
  expect(result.items).toEqual([{ entity: record, extras }]);
  expect(graph.spies.searchEntitiesByName).toHaveBeenCalledWith({ query: "Acme", schemaIds: ["companies.company"], limit: 2, extras: true });
  await expect(searchEntitiesPage(graph, { query: "Acme", schemaId: "companies.company", limit: 1, offset: 0 }))
    .resolves.toMatchObject({ items: [record] });
});

test("tst_pkg_sdk_graph_001 accepts a link kind in listLinksForEntity", () => {
  expectTypeOf<Parameters<GraphService["listLinksForEntity"]>[1]>()
    .toEqualTypeOf<string | undefined>();
  expectTypeOf<Parameters<GraphService["admitSyncEntities"]>[1]>()
    .toEqualTypeOf<readonly string[] | undefined>();
});

class SyncModule {
  constructor(private readonly deps: PluginDeps) {}

  @writeTool("setSyncEnabled", {
    entity: "telegram.chat",
    description: "Set chat synchronization",
    params: {
      type: "object",
      properties: { id: { type: "string" }, syncEnabled: { type: "boolean" } },
      required: ["id", "syncEnabled"],
      additionalProperties: false,
    },
  })
  async setSyncEnabled(params: SetSyncEnabledParams): Promise<UpdateEntitySyncEnabledResult> {
    const result = await this.deps.graph.updateEntitySyncEnabled(params);
    await this.deps.graph.syncState("apply");
    return result;
  }
}

test("registers an approved camelCase operation and dispatches its saved revision unchanged", async () => {
  const graph = mockGraph({
    updateEntitySyncEnabled: () => Promise.resolve({ syncRevision: "9007199254740993" }),
    syncState: syncStateDouble(),
  });
  const mounted = await mountModule(SyncModule, { mode: "dispatch", graph, ctx: { extensionId: "telegram" } });
  expect(mounted.tools).toMatchObject([{
    name: "telegram.chat.setSyncEnabled",
    binding: { entity: "telegram.chat", operation: "setSyncEnabled" },
    requiresApproval: true,
  }]);
  const params = { id: "chat-uuid", syncEnabled: false };
  await expect(mounted.rpc("telegram.chat.setSyncEnabled", params)).resolves.toEqual({ syncRevision: "9007199254740993" });
  expect(graph.spies.updateEntitySyncEnabled).toHaveBeenCalledWith(params);
  expect(graph.spies.syncState).toHaveBeenCalledWith("apply");
});
