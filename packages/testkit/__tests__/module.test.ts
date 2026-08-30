// @magnis/testkit/module — self-tests. Proves the throwing mockGraph, both
// mountModule modes, and the DTO builders, so the 9 modules that depend on the
// kit inherit a verified harness.
import { describe, expect, it, vi } from "vitest";
import {
  definePlugin,
  rpc,
  tool,
  type GraphService,
  type PluginDeps,
  type PluginModuleShape,
} from "@magnis/plugin-sdk";
import {
  entity,
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

function publishedShape(): PluginModuleShape {
  return (globalThis as unknown as { __magnis_plugin_module: PluginModuleShape })
    .__magnis_plugin_module;
}

async function initializeShape(shape: PluginModuleShape, extensionId: string): Promise<void> {
  const { deps } = mountModule(FixtureModule, { ctx: { extension_id: extensionId } });
  await shape.init(deps.graph, deps.ctx, deps.util, deps.rpc, deps.log);
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
    const { rpc: call, tools } = await mountModule(FixtureModule, { mode: "dispatch", ctx: { extension_id: "fixture" } });
    expect(tools.map((toolDefinition) => toolDefinition.name)).toEqual(["fixture.ping"]);
    expect(await call("fixture.ping", { n: 4 })).toEqual({ pong: 5 });
    expect(await call("ping", { n: 9 })).toEqual({ pong: 10 });
    // rpc-only handler is reachable via dispatch though absent from `tools`.
    expect(await call("fixture.secret")).toBe("shh");
  });

  it("tst_testkit_mount_dispatch_003 unknown handler throws", async () => {
    const { rpc: call } = await mountModule(FixtureModule, { mode: "dispatch", ctx: { extension_id: "fixture" } });
    expect(() => call("nope")).toThrow("no rpc handler: nope");
  });

  /**
   * @test-id: tst_testkit_mount_dispatch_004
   * @scenario: scn_module_decorator_004
   * @covers: packages/plugin-sdk/index.ts::definePlugin
   * @deterministic: yes
   * @fixtures: none
   */
  it("tst_testkit_mount_dispatch_004 repeated init on one published shape stays idempotent", async () => {
    definePlugin(FixtureModule);
    const shape = publishedShape();
    await initializeShape(shape, "fixture");
    await initializeShape(shape, "fixture");
    expect(shape.toolDefinitions.map((definition) => definition.name)).toEqual(["fixture.ping"]);
    expect(Object.keys(shape.rpcHandlers).sort()).toEqual(["fixture.ping", "fixture.secret"]);
  });

  /**
   * @test-id: tst_testkit_mount_dispatch_005
   * @scenario: scn_module_decorator_005
   * @covers: packages/plugin-sdk/index.ts::record
   * @deterministic: yes
   * @fixtures: none
   */
  it("tst_testkit_mount_dispatch_005 legacy and standard ABIs inherit the same base tool", async () => {
    class LegacyBase {
      constructor(_deps: PluginDeps) {}
      inherited(): string { return "legacy"; }
    }
    class LegacyDerived extends LegacyBase {}
    const legacyDescriptor = Object.getOwnPropertyDescriptor(LegacyBase.prototype, "inherited");
    if (legacyDescriptor === undefined) throw new Error("missing legacy method descriptor");
    tool("inherited", { description: "inherited", params: {} })(
      LegacyBase.prototype,
      "inherited",
      legacyDescriptor,
    );
    definePlugin(LegacyDerived);
    const legacyShape = publishedShape();
    await initializeShape(legacyShape, "legacy");

    class StandardBase {
      constructor(_deps: PluginDeps) {}
      inherited(): string { return "standard"; }
    }
    class StandardDerived extends StandardBase {}
    const initializers: Array<(this: object) => void> = [];
    tool("inherited", { description: "inherited", params: {} })(
      StandardBase.prototype.inherited,
      {
        kind: "method",
        name: "inherited",
        static: false,
        private: false,
        addInitializer(initializer): void { initializers.push(initializer); },
      },
    );
    const standardInstance = new StandardDerived(mountModule(FixtureModule).deps);
    for (const initializer of initializers) initializer.call(standardInstance);
    definePlugin(StandardDerived);
    const standardShape = publishedShape();
    await initializeShape(standardShape, "standard");

    expect(legacyShape.toolDefinitions.map((definition) => definition.name)).toEqual([
      "legacy.inherited",
    ]);
    expect(standardShape.toolDefinitions.map((definition) => definition.name)).toEqual([
      "standard.inherited",
    ]);
    expect(legacyShape.rpcHandlers["legacy.inherited"]?.({})).toBe("legacy");
    expect(standardShape.rpcHandlers["standard.inherited"]?.({})).toBe("standard");
  });

  /**
   * @test-id: tst_testkit_mount_dispatch_006
   * @scenario: scn_module_decorator_006
   * @covers: packages/plugin-sdk/index.ts::record
   * @deterministic: yes
   * @fixtures: none
   */
  it("tst_testkit_mount_dispatch_006 both decorator ABIs reject static methods", () => {
    class LegacyStatic {
      static ping(): string { return "legacy"; }
    }
    const descriptor = Object.getOwnPropertyDescriptor(LegacyStatic, "ping");
    if (descriptor === undefined) throw new Error("missing static method descriptor");
    expect(() =>
      tool("ping", { description: "ping", params: {} })(LegacyStatic, "ping", descriptor)
    ).toThrow("plugin decorators require a public instance method");

    expect(() =>
      tool("ping", { description: "ping", params: {} })(LegacyStatic.ping, {
        kind: "method",
        name: "ping",
        static: true,
        private: false,
        addInitializer(): void {},
      })
    ).toThrow("plugin decorators require a public instance method");
  });
});

describe("builders", () => {
  it("tst_testkit_builders_001 produce the real DTO shapes", () => {
    expect(entity("a", "Acme")).toMatchObject({ id: "a", name: "Acme", schema_id: "" });
    expect(entity("a", "Acme", { schema_id: "companies.company" }).schema_id).toBe("companies.company");
    expect(windowRow(entity("a", "Acme"))).toEqual({
      entity: { id: "a", name: "Acme", schema_id: "", created_at: "2026-01-01T00:00:00Z" },
    });
    expect(linkedRow(entity("a", "Acme"), { kind: "authored_by" }).link).toMatchObject({
      from_id: "a",
      kind: "authored_by",
    });
  });
});
