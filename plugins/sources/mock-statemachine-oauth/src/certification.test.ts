import { existsSync, readFileSync } from "node:fs";

import { describe, expect, test } from "bun:test";

import { successfulOperation, withCertifiedFixtureArtifact } from "../../local/src/certification-harness";
import {
  FIXTURE_OAUTH_CLIENT_ID,
  FIXTURE_OAUTH_CODE,
  FIXTURE_OAUTH_REFRESH_TOKEN,
} from "./auth";

describe("OAuth state-machine exact-artifact certification", () => {
  /**
   * @test-id: tst_statemock_oauth_cert_001
   * @scenario: scn_statemock_oauth_artifact_001
   * @covers: plugins/sources/mock-statemachine-oauth/src/main.ts
   * @deterministic: yes
   * @fixtures: fixed OAuth code, client id, identity and refresh token
   */
  test("tst_statemock_oauth_cert_001 fixes every OAuth poll surface inside the artifact", async () => {
    await withCertifiedFixtureArtifact(
      "mock-statemachine-oauth",
      {
        operationArguments: {
          "magnis.sync.fetch": { surface: "email" },
          "magnis.auth.exchange": {
            _meta: {
              client_id: FIXTURE_OAUTH_CLIENT_ID,
              code: FIXTURE_OAUTH_CODE,
            },
          },
          "magnis.auth.revoke": {
            _meta: { refresh_token: FIXTURE_OAUTH_REFRESH_TOKEN },
          },
        },
      },
      ({ root, packageHash, receipt, evidence }) => {
        expect(receipt).toMatchObject({
          packageHash,
          sourceId: "mock-statemachine-oauth",
          auth: "oauth2",
          delivery: "poll",
          releaseTier: "development_fixture",
          surfaces: ["email"],
          callableOperations: expect.arrayContaining([
            "magnis.auth.exchange",
            "magnis.auth.revoke",
          ]),
          scenarioIds: expect.arrayContaining([
            "tst_statemock_oauth_auth_001",
            "tst_statemock_oauth_cert_001",
          ]),
        });
        expect(readFileSync(`${root}/manifest.toml`, "utf8")).toContain(
          'auth_url = "https://provider.example/authorize"',
        );
        expect(existsSync(`${root}/auth/index.tsx`)).toBe(true);
        expect(successfulOperation(evidence, "magnis.sync.fetch")).toEqual({
          envelopes: [], nextCursor: null, hasMore: false,
        });
        expect(successfulOperation(evidence, "magnis.auth.probe")).toEqual({
          subject: "statemock",
        });
        expect(successfulOperation(evidence, "magnis.auth.exchange")).toEqual({
          credential: FIXTURE_OAUTH_REFRESH_TOKEN,
          identity: {
            key: "fixture-oauth-user",
            label: "fixture-oauth@example.com",
          },
        });
        expect(successfulOperation(evidence, "magnis.auth.revoke")).toEqual({ revoked: true });
      },
    );
  });
});
