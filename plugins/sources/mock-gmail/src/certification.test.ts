import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { successfulOperation, withCertifiedFixtureArtifact } from "../../local/src/certification-harness";

describe("Mock Gmail exact-artifact certification", () => {
  /**
   * @test-id: tst_mockgmail_cert_001
   * @scenario: scn_mock_gmail_artifact_closure_001
   * @covers: plugins/sources/mock-gmail/src/main.ts
   * @deterministic: yes
   * @fixtures: root-local dataset action schemas
   */
  test("tst_mockgmail_cert_001 packages schemas and serves the declared fixture operations", async () => {
    await withCertifiedFixtureArtifact(
      "mock-gmail",
      {
        operationArguments: {
          "magnis.sync.fetch": { surface: "email" },
          "magnis.dataset.invoke:emit_message": {
            action: "emit_message",
            invocation_id: "cert-message",
            action_time: "2026-08-05T10:00:00Z",
            settings: {},
            payload: {
              message_id: "message-1",
              from_address: "sender@example.test",
              subject: "Certification",
              body_text: "Exact staged artifact",
              sent_at: "2026-08-05T10:00:00Z",
            },
          },
          "magnis.dataset.invoke:emit_meeting": {
            action: "emit_meeting",
            invocation_id: "cert-meeting",
            action_time: "2026-08-05T10:00:00Z",
            settings: {},
            payload: {
              event_id: "meeting-1",
              title: "Certification",
              starts_at: "2026-08-05T10:00:00Z",
              ends_at: "2026-08-05T10:30:00Z",
              attendees: [{ email: "attendee@example.test" }],
            },
          },
          "magnis.execute:send_message": {
            action: "send_message",
            draft: {
              to: [{ address: "recipient@example.test" }],
              cc: [],
              bcc: [],
              subject: "Certification",
              body_text: "Exact staged artifact",
              body_html: null,
              in_reply_to: null,
            },
          },
        },
      },
      ({ root, packageHash, receipt, evidence }) => {
        expect(receipt).toMatchObject({
          packageHash,
          sourceId: "mock-gmail",
          releaseTier: "development_fixture",
          surfaces: ["email", "meetings"],
          scenarioIds: expect.arrayContaining(["tst_mockgmail_cert_001"]),
        });
        expect(existsSync(join(root, "schemas/dataset-actions/emit-message.json"))).toBe(true);
        expect(existsSync(join(root, "schemas/dataset-actions/emit-meeting.json"))).toBe(true);
        expect(successfulOperation(evidence, "magnis.sync.fetch")).toEqual({
          envelopes: [], nextCursor: null, hasMore: false,
        });
        expect(successfulOperation(evidence, "magnis.dataset.invoke:emit_message")).toMatchObject({
          envelopes: [{ surface: "email", remote_id: "dataset:cert-message:0" }],
        });
        expect(successfulOperation(evidence, "magnis.dataset.invoke:emit_meeting")).toMatchObject({
          envelopes: [{ surface: "meetings", remote_id: "dataset:cert-meeting:0" }],
        });
        expect(successfulOperation(evidence, "magnis.execute:send_message")).toMatchObject({
          message_id: expect.stringMatching(/^mock-gmail-[0-9a-f]{32}$/),
          thread_id: expect.stringMatching(/^mock-gmail-thread-[0-9a-f]{32}$/),
        });
      },
    );
  });
});
