import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { discoverSourceReleaseManifests } from "../../../scripts/certify-sources";

const repoRoot = join(import.meta.dir, "../../..");

describe("x-mcp admission", () => {
  /**
   * @test-id: tst_x_mcp_inadmissible_001
   * @scenario: scn_x_mcp_offline_closure_001
   * @covers: plugins/sources/x-mcp/manifest.toml
   * @deterministic: yes
   * @fixtures: authored x-mcp manifest and committed receipt directory
   */
  test("tst_x_mcp_inadmissible_001 network npx bridge has no catalog admission or receipt", async () => {
    const release = discoverSourceReleaseManifests(join(repoRoot, "plugins", "sources"))
      .find((candidate) => candidate.id === "x-mcp");
    expect(release).toMatchObject({
      disposition: "inadmissible",
      id: "x-mcp",
      root: join(repoRoot, "plugins", "sources", "x-mcp"),
      manifestPath: join(repoRoot, "plugins", "sources", "x-mcp", "manifest.toml"),
      reason: "spawn uses unpinned npx network execution and the artifact has no root-local dependency-closed implementation",
    });
    expect(existsSync(join(import.meta.dir, "src", "main.ts"))).toBe(false);
    const receipts = await Promise.all(
      readdirSync(join(repoRoot, "dist", "receipts"))
        .map((fileName) => Bun.file(join(repoRoot, "dist", "receipts", fileName)).text()),
    );
    expect(receipts.some((receipt) => receipt.includes('"sourceId":"x-mcp"'))).toBe(false);
  });
});
