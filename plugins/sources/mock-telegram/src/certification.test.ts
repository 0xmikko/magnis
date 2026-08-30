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
    await withCertifiedFixtureArtifact(
      "mock-telegram",
      {
        operationArguments: {
          "magnis.sync.fetch": { surface: "telegram" },
          "magnis.dataset.invoke:emit_chat": {
            action: "emit_chat",
            invocation_id: "cert-chat",
            action_time: "2026-08-05T10:00:00Z",
            settings: {},
            payload: { chat_id: 7, title: "Certification", chat_type: "group" },
          },
          "magnis.dataset.invoke:emit_message": {
            action: "emit_message",
            invocation_id: "cert-message",
            action_time: "2026-08-05T10:00:00Z",
            settings: {},
            payload: {
              chat_id: 7,
              message_id: 42,
              text: "Exact staged artifact",
              date: "2026-08-05T10:00:00Z",
            },
          },
        },
      },
      ({ root, packageHash, receipt, evidence }) => {
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
        expect(successfulOperation(evidence, "magnis.dataset.invoke:emit_chat")).toMatchObject({
          envelopes: [{ surface: "telegram", remote_id: "dataset:cert-chat:0" }],
        });
        expect(successfulOperation(evidence, "magnis.dataset.invoke:emit_message")).toMatchObject({
          envelopes: [{ surface: "telegram", remote_id: "dataset:cert-message:0" }],
        });
      },
    );
  });
});
