import { describe, expect, it } from "vitest";
import { mockLogger, mountModule } from "@magnis/testkit/module";
import type { PluginDeps } from "@magnis/plugin-sdk";

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
