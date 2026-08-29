import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { successfulOperation, withCertifiedFixtureArtifact } from "../../local/src/certification-harness";

describe("Mock Telegram exact-artifact certification", () => {
  /**
   * @test-id: tst_mocktelegram_cert_001
   * @scenario: scn_mock_telegram_artifact_closure_001
   * @covers: plugins/sources/mock-telegram/src/main.ts
   * @deterministic: yes
   * @fixtures: root-local Telegram dataset action schemas
   */
  test("tst_mocktelegram_cert_001 packages schemas and serves the declared fixture operations", async () => {
    await withCertifiedFixtureArtifact("mock-telegram", {}, ({ root, packageHash, receipt, evidence }) => {
      expect(receipt).toMatchObject({
        packageHash,
        sourceId: "mock-telegram",
        releaseTier: "development_fixture",
        surfaces: ["telegram"],
        scenarioIds: expect.arrayContaining(["tst_mocktelegram_cert_001"]),
      });
      expect(existsSync(join(root, "schemas/dataset-actions/emit-chat.json"))).toBe(true);
      expect(existsSync(join(root, "schemas/dataset-actions/emit-message.json"))).toBe(true);
      expect(successfulOperation(evidence, "magnis.sync.fetch")).toEqual({
        envelopes: [], nextCursor: null, hasMore: false,
      });
    });
  });
});
