// @magnis/testkit/module — self-tests. Proves the throwing mockGraph, both
// mountModule modes, and the DTO builders, so the 9 modules that depend on the
// kit inherit a verified harness.
import { describe, expect, it, vi } from "vitest";
import { rpc, tool, type GraphService, type PluginDeps } from "@magnis/plugin-sdk";
import {
  canonical,
  entity,
  facet,
  linkedRow,
  mockGraph,
  mountModule,
  windowRow,
} from "@magnis/testkit/module";

// A minimal decorated module, exercised by the dispatch-mode tests. `ping` is a
// read tool; `secret` is an RPC-only handler (must NOT surface as a tool).
class FixtureModule {
  private readonly graph: GraphService;
  constructor(deps: PluginDeps) {
    this.graph = deps.graph;
  }

  @tool("ping", { description: "ping", params: { type: "object", properties: { n: { type: "integer" } } } })
  async ping(params: { n: number }): Promise<{ pong: number }> {
    return Promise.resolve({ pong: params.n + 1 });
  }

  @rpc("secret")
  async secret(): Promise<string> {
    return Promise.resolve("shh");
  }

  // Reaches into the graph — used to prove an unconfigured op throws end-to-end.
  async count(): Promise<number> {
    const page = await this.graph.list_entities({ schema_id: "x" });
    return page.total;
  }
}

describe("mockGraph", () => {
  it("tst_testkit_mockgraph_001 throws on an unconfigured op WHEN CALLED", () => {
    const graph = mockGraph();
    expect(() => graph.delete_entity("x")).toThrow("unexpected graph op: delete_entity");
  });

  it("tst_testkit_mockgraph_002 overridden op runs its impl and records a spy", async () => {
    const graph = mockGraph({ get_entity: () => Promise.resolve(entity("a", "Acme")) });
    const e = await graph.get_entity("a");
    expect(e?.name).toBe("Acme");
    expect(graph.spies.get_entity).toHaveBeenCalledTimes(1);
    expect(graph.spies.get_entity).toHaveBeenCalledWith("a");
  });

  it("tst_testkit_mockgraph_003 the same op access returns a stable spy (re-arm works)", async () => {
    const graph = mockGraph({ get_entity: () => Promise.resolve(null) });
    const getEntitySpy = graph.spies.get_entity;
    if (getEntitySpy === undefined)
      throw new Error("mockGraph: missing get_entity spy");
    getEntitySpy.mockResolvedValue(entity("z", "Zed"));
    const e = await graph.get_entity("z");
    expect(e?.name).toBe("Zed");
  });
});

describe("mountModule — direct", () => {
  it("tst_testkit_mount_direct_001 constructs the class with defaulted deps", async () => {
    const { module, graph, deps } = mountModule(FixtureModule);
    expect(await module.ping({ n: 1 })).toEqual({ pong: 2 });
    expect(deps.ctx).toMatchObject({ user_id: "u1", extension_kind: "plugin", extension_id: "test" });
    // default rpc is a spy on `execute` (RpcExecutor contract), not `call`.
    expect(typeof deps.rpc.execute).toBe("function");
    // the default graph is a throwing mockGraph
    expect(() => graph.get_entity("x")).toThrow("unexpected graph op: get_entity");
  });

  it("tst_testkit_mount_direct_002 an unconfigured graph op surfaces through a module method", async () => {
    const { module } = mountModule(FixtureModule);
    await expect(module.count()).rejects.toThrow("unexpected graph op: list_entities");
  });

  it("tst_testkit_mount_direct_003 opts override graph/ctx/rpc", () => {
    const graph = mockGraph({ list_entities: () => Promise.resolve({ items: [], total: 7 }) });
    const execute = vi.fn();
    const { module, deps } = mountModule(FixtureModule, {
      graph,
      ctx: { extension_id: "fixture" },
      rpc: { execute },
    });
    expect(deps.ctx.extension_id).toBe("fixture");
    expect(deps.rpc.execute).toBe(execute);
    return expect(module.count()).resolves.toBe(7);
  });
});

describe("mountModule — dispatch", () => {
  it("tst_testkit_mount_dispatch_001 harvests decorated tool names, excludes rpc-only", async () => {
    const { tools } = await mountModule(FixtureModule, { mode: "dispatch", ctx: { extension_id: "fixture" } });
    expect(tools.map((t) => t.name)).toEqual(["fixture.ping"]);
    expect(tools[0]).toMatchObject({ description: "ping", requires_approval: false });
  });

  it("tst_testkit_mount_dispatch_002 routes by full name and by bare suffix", async () => {
    const { rpc: call } = await mountModule(FixtureModule, { mode: "dispatch", ctx: { extension_id: "fixture" } });
    expect(await call("fixture.ping", { n: 4 })).toEqual({ pong: 5 });
    expect(await call("ping", { n: 9 })).toEqual({ pong: 10 });
    // rpc-only handler is reachable via dispatch though absent from `tools`.
    expect(await call("fixture.secret")).toBe("shh");
  });

  it("tst_testkit_mount_dispatch_003 unknown handler throws", async () => {
    const { rpc: call } = await mountModule(FixtureModule, { mode: "dispatch", ctx: { extension_id: "fixture" } });
    expect(() => call("nope")).toThrow("no rpc handler: nope");
  });
});

describe("builders", () => {
  it("tst_testkit_builders_001 produce the real DTO shapes", () => {
    expect(entity("a", "Acme")).toMatchObject({ id: "a", name: "Acme", schema_id: "" });
    expect(entity("a", "Acme", { schema_id: "companies.company" }).schema_id).toBe("companies.company");
    expect(windowRow(entity("a", "Acme"), { k: 1 })).toEqual({
      entity: { id: "a", name: "Acme", schema_id: "", created_at: "2026-01-01T00:00:00Z" },
      data: { k: 1 },
    });
    expect(facet("f1", "s.details", { x: 1 }, { entity_id: "a" })).toMatchObject({
      id: "f1",
      schema_id: "s.details",
      entity_id: "a",
      data: { x: 1 },
    });
    expect(canonical("a", "companies.name", "Acme")).toEqual({
      entity_id: "a",
      key: "companies.name",
      value: "Acme",
    });
    expect(linkedRow(entity("a", "Acme"), null, { kind: "authored_by" }).link).toMatchObject({
      from_id: "a",
      kind: "authored_by",
    });
  });
});
