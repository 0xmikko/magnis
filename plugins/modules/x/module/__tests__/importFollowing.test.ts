/**
 * @layer: module
 * @test-id: tst_module_x_import_removed_001
 * @scenario: scn_compact_removed_workflows_001
 * @covers: plugins/modules/x/module/service.ts
 * @deterministic: yes
 * @fixtures: strict graph and RPC doubles
 */
import { describe, expect, it, vi } from "vitest";
import { mockGraph, mountModule } from "@magnis/testkit/module";
import { XModule } from "../service.ts";

describe("removed following import", () => {
  it("does not implement a bootstrap workflow", () => {
    const execute = vi.fn();
    const { module } = mountModule(XModule, { graph: mockGraph(), rpc: { execute } });
    expect("import_following" in module).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });
});
