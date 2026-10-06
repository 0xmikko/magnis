/**
 * @layer: pkg_sdk
 * @test-id: tst_pkg_sdk_graph_001
 * @scenario: scn_google_pull_001
 * @covers: packages/plugin-sdk/contract/module.ts::GraphService
 * @deterministic: yes
 * @fixtures: none
 */
import { expect, expectTypeOf, test } from "vitest";
import { mockGraph, mountModule, syncStateDouble } from "@magnis/testkit/module";
import type { SetSyncEnabledParams, UpdateEntitySyncEnabledResult } from "@magnis/sdk";
import { writeTool } from "../index.ts";
import type { GraphService, PluginDeps } from "../contract/module.ts";

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
