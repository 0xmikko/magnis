import { describe, expect, it } from "vitest";
import { mockLogger, mountModule } from "@magnis/testkit/module";
import { definePlugin } from "@magnis/plugin-sdk";
import type { PluginDeps, PluginContext, PluginModuleShape } from "@magnis/plugin-sdk";

const ctx: PluginContext = { user_id: "u1", extension_kind: "plugin", extension_id: "test" };

/**
 * @test-id: tst_sdk_log_001
 * @scenario: scn_plugin_logging_001
 * @covers: packages/plugin-sdk/contract/module.ts::PluginDeps.log
 * @deterministic: yes
 * @fixtures: inline module
 *
 * Test environment: vitest node lane
 * Clients: direct calls through the testkit mount
 * Mocks: testkit capturing logger
 * Data: one structured entry with fields, one without
 *
 * @invariant INV-21 — a plugin can emit a structured log entry that reaches
 * the host logger. Without this surface every plugin failure is invisible,
 * which is what made the email/notes/trigger defects guesswork.
 */

class LoggingModule {
  constructor(private readonly deps: PluginDeps) {}

  async run(): Promise<void> {
    await this.deps.log.log("warn", "note content write failed", { entity_id: "e-1" });
  }
}

describe("plugin log surface", () => {
  it("tst_sdk_log_001 a module emits a structured entry the host captures", async () => {
    const log = mockLogger();
    const { module } = mountModule(LoggingModule, { log });

    await module.run();

    expect(log.entries).toEqual([
      { level: "warn", message: "note content write failed", fields: { entity_id: "e-1" } },
    ]);
  });

  it("tst_sdk_log_001 fields are optional", async () => {
    const log = mockLogger();
    const { deps } = mountModule(LoggingModule, { log });

    await deps.log.log("info", "sync finished");

    expect(log.entries).toEqual([{ level: "info", message: "sync finished", fields: undefined }]);
  });

  it("tst_sdk_log_001 every mount gets a logger even when none is supplied", () => {
    const { deps } = mountModule(LoggingModule);

    expect(typeof deps.log.log).toBe("function");
  });
});

/**
 * @test-id: tst_sdk_log_002
 * @scenario: scn_plugin_logging_001
 * @covers: packages/plugin-sdk/index.ts::definePlugin.init
 * @deterministic: yes
 *
 * @invariant INV-21 — the host boundary is Rust/V8 and passes arguments
 * positionally, so TypeScript cannot enforce arity there. Before the guard,
 * `init` with four arguments RESOLVED, every handler registered, and the
 * plugin ran until a failure path touched `deps.log` — crashing inside the
 * error handler. Proven by a review probe.
 */
describe("the host contract for the logger is enforced, not assumed", () => {
  it("tst_sdk_log_002 init without the logger rejects instead of running blind", async () => {
    definePlugin(LoggingModule);
    const shape = (globalThis as unknown as { __magnis_plugin_module: PluginModuleShape })
      .__magnis_plugin_module;

    await expect(
      (shape.init as unknown as (...a: unknown[]) => Promise<void>)({}, ctx, {}, {
        execute: () => Promise.resolve(undefined),
      }),
    ).rejects.toThrow(/logger/i);
  });
});
