import { existsSync } from "node:fs";

import { describe, expect, test } from "bun:test";

import { successfulOperation, withCertifiedFixtureArtifact } from "../../local/src/certification-harness";
import {
  FIXTURE_PHONE_CODE,
  FIXTURE_PHONE_PASSWORD,
  FIXTURE_PHONE_SESSION,
} from "./auth";

interface CeremonyReply {
  readonly id: number;
  readonly result?: unknown;
  readonly error?: unknown;
}

async function runExactPhoneCeremony(root: string): Promise<readonly CeremonyReply[]> {
  const child = Bun.spawn([process.execPath, "run", "dist/main.js", "--auth-mode"], {
    cwd: root,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  const requests = [
    { id: 1, name: "magnis.auth.begin", meta: { phone: "+15550001111" } },
    { id: 2, name: "magnis.auth.step", meta: { code: FIXTURE_PHONE_CODE } },
    { id: 3, name: "magnis.auth.step", meta: { password: FIXTURE_PHONE_PASSWORD } },
    { id: 4, name: "magnis.auth.revoke", meta: { session: FIXTURE_PHONE_SESSION } },
  ].map(({ id, name, meta }) => ({
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: { name, arguments: { _meta: meta } },
  }));
  const stdoutPromise = new Response(child.stdout).text();
  const stderrPromise = new Response(child.stderr).text();
  await child.stdin.write(`${requests.map((request) => JSON.stringify(request)).join("\n")}\n`);
  await child.stdin.end();
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    stdoutPromise,
    stderrPromise,
  ]);
  if (exitCode !== 0) throw new Error(`fixture phone artifact exited ${String(exitCode)}: ${stderr}`);
  return stdout
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as CeremonyReply);
}

function exactResult(replies: readonly CeremonyReply[], id: number): unknown {
  const reply = replies.find((candidate) => candidate.id === id);
  if (reply === undefined || reply.error !== undefined) {
    throw new Error(`fixture phone artifact operation ${String(id)} failed`);
  }
  return reply.result;
}

describe("Phone state-machine exact-artifact certification", () => {
  /**
   * @test-id: tst_statemock_phone_cert_001
   * @scenario: scn_statemock_phone_push_artifact_001
   * @covers: plugins/sources/mock-statemachine-phone/src/main.ts
   * @deterministic: yes
   * @fixtures: fixed phone-code Push archetype
   */
  test("tst_statemock_phone_cert_001 fixes phone-code Push authority inside the artifact", async () => {
    await withCertifiedFixtureArtifact(
      "mock-statemachine-phone",
      {
        operationArguments: {
          "magnis.sync.fetch": { surface: "telegram" },
          "magnis.auth.begin": { _meta: { phone: "+15550001111" } },
          "magnis.auth.step": { _meta: { code: FIXTURE_PHONE_CODE } },
          "magnis.auth.revoke": { _meta: { session: FIXTURE_PHONE_SESSION } },
        },
      },
      async ({ root, packageHash, receipt, evidence }) => {
        expect(receipt).toMatchObject({
          packageHash,
          sourceId: "mock-statemachine-phone",
          auth: "phone_code",
          delivery: "push",
          releaseTier: "development_fixture",
          surfaces: ["telegram"],
          callableOperations: expect.arrayContaining([
            "magnis.auth.begin",
            "magnis.auth.step",
            "magnis.auth.revoke",
          ]),
          scenarioIds: expect.arrayContaining([
            "tst_statemock_phone_auth_001",
            "tst_statemock_phone_cert_001",
          ]),
        });
        expect(existsSync(`${root}/auth/index.tsx`)).toBe(true);
        expect(successfulOperation(evidence, "listen_start")).toEqual({
          ok: true, subscription_id: "certification-probe",
        });
        expect(successfulOperation(evidence, "listen_stop")).toEqual({ ok: true });
        expect(successfulOperation(evidence, "magnis.sync.listen")).toEqual({
          ok: true, subscription_id: "sub:certification",
        });
        expect(successfulOperation(evidence, "magnis.sync.fetch")).toEqual({
          envelopes: [], nextCursor: null, hasMore: false,
        });
        expect(successfulOperation(evidence, "magnis.auth.probe")).toEqual({
          subject: "statemock",
        });
        expect(successfulOperation(evidence, "magnis.auth.begin")).toEqual({
          state: "code_sent",
        });
        expect(successfulOperation(evidence, "magnis.auth.step")).toEqual({
          state: "password_required",
        });
        expect(successfulOperation(evidence, "magnis.auth.revoke")).toEqual({ revoked: true });

        const ceremony = await runExactPhoneCeremony(root);
        expect(exactResult(ceremony, 1)).toEqual({ state: "code_sent" });
        expect(exactResult(ceremony, 2)).toEqual({ state: "password_required" });
        expect(exactResult(ceremony, 3)).toEqual({
          credential: FIXTURE_PHONE_SESSION,
          identity: {
            key: "fixture-phone-user",
            label: "Fixture Phone User",
          },
        });
        expect(exactResult(ceremony, 4)).toEqual({ revoked: true });
      },
    );
  });
});
