// @magnis/testkit/module — self-tests. Proves the throwing mockGraph, both
// mountModule modes, and the DTO builders, so the 9 modules that depend on the
// kit inherit a verified harness.
import { describe, expect, it, vi } from "vitest";
import {
  definePlugin,
  pageLimitMax,
  rpc,
  tool,
  writeTool,
  type GraphService,
  type PluginDeps,
  type PluginModuleShape,
} from "@magnis/plugin-sdk";
import {
  entity,
  link,
  linkedEntity,
  mockGraph,
  mountModule,
  page,
  sourceEnvelope,
} from "@magnis/testkit/module";

// A minimal decorated module, exercised by the dispatch-mode tests. `ping` is a
// read tool; `secret` is an RPC-only handler (must NOT surface as a tool).
class FixtureModule {
  private readonly graph: GraphService;
  constructor(deps: PluginDeps) {
    this.graph = deps.graph;
  }

  @tool("ping", { entity: "fixture.resource", description: "ping", params: { type: "object", properties: { n: { type: "integer" } } } })
  async ping(params: { n: number }): Promise<{ pong: number }> {
    return Promise.resolve({ pong: params.n + 1 });
  }

  @rpc("secret", { description: "secret", params: { type: "object", properties: {}, additionalProperties: false } })
  async secret(): Promise<string> {
    return Promise.resolve("shh");
  }

  // Reaches into the graph — used to prove an unconfigured op throws end-to-end.
  async count(): Promise<number> {
    const found = await this.graph.listEntities({ schemaId: "x" });
    return found.total;
  }
}

function publishedShape(): PluginModuleShape {
  return (globalThis as unknown as { __magnis_plugin_module: PluginModuleShape })
    .__magnis_plugin_module;
}

async function initializeShape(shape: PluginModuleShape, extensionId: string): Promise<void> {
  const { deps } = mountModule(FixtureModule, { ctx: { extensionId } });
  await shape.init(deps.graph, deps.ctx, deps.util, deps.rpc, deps.log);
}

describe("mockGraph", () => {
  it("tst_testkit_mockgraph_001 throws on an unconfigured op WHEN CALLED", () => {
    const graph = mockGraph();
    expect(() => graph.deleteEntity("x")).toThrow("unexpected graph op: deleteEntity");
  });

  it("tst_testkit_mockgraph_002 overridden op runs its impl and records a spy", async () => {
    const graph = mockGraph({ getEntity: () => Promise.resolve(entity("a", "Acme")) });
    const e = await graph.getEntity("a");
    expect(e?.name).toBe("Acme");
    expect(graph.spies.getEntity).toHaveBeenCalledTimes(1);
    expect(graph.spies.getEntity).toHaveBeenCalledWith("a");
  });

  it("tst_testkit_mockgraph_003 the same op access returns a stable spy (re-arm works)", async () => {
    const graph = mockGraph({ getEntity: () => Promise.resolve(null) });
    const getEntitySpy = graph.spies.getEntity;
    if (getEntitySpy === undefined)
      throw new Error("mockGraph: missing getEntity spy");
    getEntitySpy.mockResolvedValue(entity("z", "Zed"));
    const e = await graph.getEntity("z");
    expect(e?.name).toBe("Zed");
  });
  /**
   * @test-id: tst_testkit_mockgraph_004
   * @scenario: scn_x_sync_001
   * @covers: packages/testkit/module.ts::mockGraph
   * @deterministic: yes
   * @fixtures: an overridden migration listing
   */
  it("tst_testkit_mockgraph_004 refuses a migration page larger than the host serves, ahead of the override", async () => {
    const graph = mockGraph({ listSyncMigrationEntities: () => Promise.resolve({ items: [], next: null }) });

    // @tested-by: tst_testkit_mockgraph_004
    // @invariant: a module asking for more than pageLimitMax rows fails in its
    // tests as the host refuses it, and a page within the limit reaches the override.
    expect(() => graph.listSyncMigrationEntities({ schemaId: "x.profile", after: null, limit: pageLimitMax + 1 }))
      .toThrow(`migration limit must be between 1 and ${String(pageLimitMax)}`);
    await expect(graph.listSyncMigrationEntities({ schemaId: "x.profile", after: null, limit: pageLimitMax }))
      .resolves.toEqual({ items: [], next: null });
  });
});

describe("mountModule — direct", () => {
  it("tst_testkit_mount_direct_001 constructs the class with defaulted deps", async () => {
    const { module, graph, deps } = mountModule(FixtureModule);
    expect(await module.ping({ n: 1 })).toEqual({ pong: 2 });
    expect(deps.ctx).toEqual({ userId: "u1", extensionKind: "plugin", extensionId: "test" });
    // default rpc is a spy on `execute` (RpcExecutor contract), not `call`.
    expect(typeof deps.rpc.execute).toBe("function");
    // the default graph is a throwing mockGraph
    expect(() => graph.getEntity("x")).toThrow("unexpected graph op: getEntity");
  });

  it("tst_testkit_mount_direct_002 an unconfigured graph op surfaces through a module method", async () => {
    const { module } = mountModule(FixtureModule);
    await expect(module.count()).rejects.toThrow("unexpected graph op: listEntities");
  });

  it("tst_testkit_mount_direct_003 opts override graph/ctx/rpc", () => {
    const graph = mockGraph({ listEntities: () => Promise.resolve(page([], 7)) });
    const execute = vi.fn();
    const { module, deps } = mountModule(FixtureModule, {
      graph,
      ctx: { extensionId: "fixture" },
      rpc: { execute },
    });
    expect(deps.ctx.extensionId).toBe("fixture");
    expect(deps.rpc.execute).toBe(execute);
    return expect(module.count()).resolves.toBe(7);
  });
});

describe("mountModule — dispatch", () => {
  it("tst_testkit_mount_dispatch_001 harvests decorated tool names, excludes rpc-only", async () => {
    const { tools } = await mountModule(FixtureModule, { mode: "dispatch", ctx: { extensionId: "fixture" } });
    expect(tools.map((t) => t.name)).toEqual(["fixture.resource.ping"]);
    expect(tools[0]).toMatchObject({ description: "ping", requiresApproval: false });
  });

  /**
   * @test-id: tst_cat_entity_one_type_001
   * @covers packages/plugin-sdk/index.ts::definePlugin
   *
   * An rpc() method is published with its params schema beside the tools, so
   * the host registers it with its input schema; a tool is not repeated there.
   */
  it("tst_cat_entity_one_type_001 publishes each rpc() method with its params schema", async () => {
    await mountModule(FixtureModule, { mode: "dispatch", ctx: { extensionId: "fixture" } });
    expect(publishedShape().rpcDeclarations).toEqual([
      {
        name: "fixture.secret",
        description: "secret",
        params: { type: "object", properties: {}, additionalProperties: false },
      },
    ]);
  });

  it("tst_testkit_mount_dispatch_002 routes by full name and by bare suffix", async () => {
    const { rpc: call, tools } = await mountModule(FixtureModule, { mode: "dispatch", ctx: { extensionId: "fixture" } });
    expect(tools.map((toolDefinition) => toolDefinition.name)).toEqual(["fixture.resource.ping"]);
    expect(await call("fixture.resource.ping", { n: 4 })).toEqual({ pong: 5 });
    expect(await call("resource.ping", { n: 9 })).toEqual({ pong: 10 });
    // rpc-only handler is reachable via dispatch though absent from `tools`.
    expect(await call("fixture.secret", {})).toBe("shh");
  });

  it("tst_testkit_mount_dispatch_003 unknown handler throws", async () => {
    const { rpc: call } = await mountModule(FixtureModule, { mode: "dispatch", ctx: { extensionId: "fixture" } });
    expect(() => call("nope", {})).toThrow("no rpc handler: nope");
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
    expect(shape.toolDefinitions.map((definition) => definition.name)).toEqual(["fixture.resource.ping"]);
    expect(Object.keys(shape.rpcHandlers).sort()).toEqual(["fixture.resource.ping", "fixture.secret"]);
  });

  /**
   * @test-id: tst_testkit_mount_dispatch_005
   * @scenario: scn_module_decorator_005
   * @covers: packages/plugin-sdk/index.ts::record
   * @deterministic: yes
   * @fixtures: none
   */
  it("tst_testkit_mount_dispatch_005 real Bun decorators publish base then derived tools", async () => {
    class DecoratedBase {
      constructor(_deps: PluginDeps) {}

      @tool("base", { entity: "real.resource", description: "base", params: {} })
      base(): string { return "base"; }
    }

    class DecoratedDerived extends DecoratedBase {
      @tool("derived", { entity: "real.resource", description: "derived", params: {} })
      derived(): string { return "derived"; }
    }

    definePlugin(DecoratedDerived);
    const shape = publishedShape();
    await initializeShape(shape, "real");

    expect(shape.toolDefinitions.map((definition) => definition.name)).toEqual([
      "real.resource.base",
      "real.resource.derived",
    ]);
    expect(shape.rpcHandlers["real.resource.base"]?.({})).toBe("base");
    expect(shape.rpcHandlers["real.resource.derived"]?.({})).toBe("derived");
  });

  /**
   * @test-id: tst_testkit_mount_dispatch_007
   * @scenario: scn_module_decorator_007
   * @covers: packages/plugin-sdk/index.ts::record
   * @deterministic: yes
   * @fixtures: none
   */
  it("tst_testkit_mount_dispatch_007 real Bun decorators reject duplicate inherited suffixes", async () => {
    class DuplicateBase {
      constructor(_deps: PluginDeps) {}

      @tool("duplicate", { entity: "real.resource", description: "base", params: {} })
      base(): string { return "base"; }
    }

    class DuplicateDerived extends DuplicateBase {
      @tool("duplicate", { entity: "real.resource", description: "derived", params: {} })
      derived(): string { return "derived"; }
    }

    definePlugin(DuplicateDerived);
    const shape = publishedShape();
    await expect(initializeShape(shape, "real")).rejects.toThrow(
      'duplicate inherited plugin operation "real.resource.duplicate"',
    );
    expect(shape.toolDefinitions).toEqual([]);
    expect(shape.rpcHandlers).toEqual({});
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
      tool("ping", { entity: "fixture.resource", description: "ping", params: {} })(LegacyStatic, "ping", descriptor)
    ).toThrow("plugin decorators require a public instance method");

    expect(() =>
      tool("ping", { entity: "fixture.resource", description: "ping", params: {} })(LegacyStatic.ping, {
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
    expect(entity("a", "Acme")).toMatchObject({ id: "a", name: "Acme", schemaId: "", origin: "canonical" });
    expect(entity("a", "Acme", { schemaId: "companies.company" }).schemaId).toBe("companies.company");
    expect(link("a", "b", "works_at")).toMatchObject({ from: "a", to: "b", kind: "works_at", validUntil: null });
    expect(linkedEntity(entity("a", "Acme"), { kind: "authored_by" }).link).toMatchObject({
      from: "a",
      kind: "authored_by",
    });
    expect(page([entity("a", "Acme")])).toMatchObject({ total: 1, offset: 0 });
  });

  /**
   * @test-id: tst_testkit_source_envelope_001
   * @covers: packages/testkit/module.ts::sourceEnvelope
   * @deterministic: yes
   * @invariant: a sync handler test builds the one envelope the host sends,
   * typed by the SDK, never a module's own copy of it.
   */
  it("tst_testkit_source_envelope_001 builds the host's sync envelope from a payload", () => {
    expect(sourceEnvelope("email", { subject: "Hi" })).toEqual({
      sourceId: "fixture",
      surface: "email",
      accountId: "account-1",
      userId: "user-1",
      kind: "snapshot",
      payload: { subject: "Hi" },
      timestamp: "2026-01-01T00:00:00Z",
    });
    expect(sourceEnvelope("telegram", {}, { kind: "delete", remoteId: "tg:1", identityKey: "+1555" })).toMatchObject({
      surface: "telegram",
      kind: "delete",
      remoteId: "tg:1",
      identityKey: "+1555",
    });
  });
});

/**
 * @test-id: tst_testkit_entity_operations_001
 * @covers: packages/plugin-sdk/index.ts::definePlugin
 * @deterministic: yes
 */
it("tst_testkit_entity_operations_001 dispatches the same operation for distinct owned entities", async () => {
  class Messages {
    @writeTool("create", { entity: "mail.message", description: "Create message", params: {}, allowlistGate: { targetType: "email_address", targetArg: "to", batchArg: "messages" } })
    message(): string { return "message"; }
    @writeTool("create", { entity: "mail.address", description: "Create address", params: {} })
    address(): string { return "address"; }
  }
  definePlugin(Messages);
  const shape = publishedShape();
  await initializeShape(shape, "mail");
  expect(shape.toolDefinitions.map(({ name, binding }) => ({ name, binding }))).toEqual([
    { name: "mail.message.create", binding: { entity: "mail.message", operation: "create" } },
    { name: "mail.address.create", binding: { entity: "mail.address", operation: "create" } },
  ]);
  expect(shape.toolDefinitions[0]?.allowlistGate).toEqual({ targetType: "email_address", targetArg: "to", batchArg: "messages" });
  expect(shape.rpcHandlers["mail.message.create"]?.({})).toBe("message");
  expect(shape.rpcHandlers["mail.address.create"]?.({})).toBe("address");
  expect(shape.rpcHandlers["mail.create"]).toBeUndefined();
});

/**
 * @test-id: tst_testkit_entity_operations_002
 * @covers: packages/plugin-sdk/index.ts::definePlugin
 * @deterministic: yes
 */
it("tst_testkit_entity_operations_002 refuses foreign ownership without clearing the active module", async () => {
  class Owned {
    @tool("get", { entity: "mail.message", description: "Get", params: {} })
    get(): string { return "active"; }
  }
  definePlugin(Owned);
  const shape = publishedShape();
  await initializeShape(shape, "mail");
  const definitions = shape.toolDefinitions;
  const handlers = shape.rpcHandlers;
  await expect(initializeShape(shape, "telegram")).rejects.toThrow();
  expect(shape.toolDefinitions).toBe(definitions);
  expect(shape.rpcHandlers).toBe(handlers);
  expect(shape.rpcHandlers["mail.message.get"]?.({})).toBe("active");
});

/**
 * @test-id: tst_testkit_entity_operations_003
 * @covers: packages/plugin-sdk/index.ts::record
 * @deterministic: yes
 */
it("tst_testkit_entity_operations_003 standard decorators preserve pair identity and reject duplicate registrations", async () => {
  class Standard {
    create(): string { return "standard"; }
  }
  const context = { kind: "method" as const, name: "create", static: false, private: false, addInitializer(): void {} };
  const spec = { entity: "mail.message", description: "Create", params: {} };
  writeTool("create", spec)(Standard.prototype.create, context);
  definePlugin(Standard);
  const shape = publishedShape();
  await initializeShape(shape, "mail");
  expect(shape.toolDefinitions[0]).toMatchObject({ name: "mail.message.create", binding: { entity: "mail.message", operation: "create" }, requiresApproval: true });
  expect(shape.rpcHandlers["mail.message.create"]?.({})).toBe("standard");
  expect(() => writeTool("create", spec)(Standard.prototype.create, context)).toThrow("duplicate");
});
