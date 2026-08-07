import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { assertMainPromotion } from "./main-promotion-policy";

const REPOSITORY = "0xmikko/magnis";

function pullRequestEvent(base: string, head: string, headRepository = REPOSITORY): unknown {
  return {
    pull_request: {
      base: { ref: base },
      head: { ref: head, repo: { full_name: headRepository } },
    },
  };
}

function runPolicyCli(event: unknown): { exitCode: number; stderr: string; stdout: string } {
  const fixtureDirectory = mkdtempSync(join(tmpdir(), "magnis-main-promotion-"));
  const eventPath = join(fixtureDirectory, "event.json");
  writeFileSync(eventPath, JSON.stringify(event));

  try {
    const result = Bun.spawnSync(
      ["bun", join(import.meta.dir, "main-promotion-policy.ts"), eventPath, REPOSITORY],
      { cwd: join(import.meta.dir, "..") },
    );
    return {
      exitCode: result.exitCode,
      stderr: result.stderr.toString(),
      stdout: result.stdout.toString(),
    };
  } finally {
    rmSync(fixtureDirectory, { force: true, recursive: true });
  }
}

describe("main promotion policy", () => {
  /**
   * @test-id: tst_ci_main_promotion_001
   * @scenario: scn_git_main_governance_001
   * @covers: scripts/main-promotion-policy.ts::assertMainPromotion
   * @deterministic: yes
   * @fixtures: inline pull_request event
   */
  test("tst_ci_main_promotion_001 accepts staging from the same repository", () => {
    expect(() => assertMainPromotion(pullRequestEvent("main", "staging"), REPOSITORY)).not.toThrow();
  });

  /**
   * @test-id: tst_ci_main_promotion_002
   * @scenario: scn_git_main_governance_001
   * @covers: scripts/main-promotion-policy.ts::assertMainPromotion
   * @deterministic: yes
   * @fixtures: inline pull_request event
   */
  test("tst_ci_main_promotion_002 rejects every feature branch targeting main", () => {
    expect(() => assertMainPromotion(pullRequestEvent("main", "feat/skip-staging"), REPOSITORY)).toThrow(
      "main accepts pull requests only from staging",
    );
  });

  /**
   * @test-id: tst_ci_main_promotion_003
   * @scenario: scn_git_main_governance_001
   * @covers: scripts/main-promotion-policy.ts::assertMainPromotion
   * @deterministic: yes
   * @fixtures: inline pull_request event
   */
  test("tst_ci_main_promotion_003 rejects a fork branch named staging", () => {
    expect(() =>
      assertMainPromotion(pullRequestEvent("main", "staging", "attacker/magnis"), REPOSITORY),
    ).toThrow("staging must belong to 0xmikko/magnis");
  });

  /**
   * @test-id: tst_ci_main_promotion_004
   * @scenario: scn_git_main_governance_001
   * @covers: scripts/main-promotion-policy.ts::main
   * @deterministic: yes
   * @fixtures: temporary pull_request event file
   */
  test("tst_ci_main_promotion_004 CLI accepts same-repository staging", () => {
    const result = runPolicyCli(pullRequestEvent("main", "staging"));

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("0xmikko/magnis:staging -> main");
  });

  /**
   * @test-id: tst_ci_main_promotion_005
   * @scenario: scn_git_main_governance_001
   * @covers: scripts/main-promotion-policy.ts::main
   * @deterministic: yes
   * @fixtures: temporary pull_request event file
   */
  test("tst_ci_main_promotion_005 CLI rejects a feature branch", () => {
    const result = runPolicyCli(pullRequestEvent("main", "fix/skip-staging"));

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("main accepts pull requests only from staging");
  });

  /**
   * @test-id: tst_ci_main_promotion_006
   * @scenario: scn_git_main_governance_001
   * @covers: .github/workflows/main-promotion-gate.yml
   * @deterministic: yes
   * @fixtures: repository workflow file
   */
  test("tst_ci_main_promotion_006 workflow runs trusted policy from the base revision", () => {
    const workflow = readFileSync(
      join(import.meta.dir, "..", ".github", "workflows", "main-promotion-gate.yml"),
      "utf8",
    );

    expect(workflow).toContain("pull_request_target:");
    expect(workflow).toMatch(/pull_request_target:\n    branches: \[main\]/);
    expect(workflow).toContain("ref: ${{ github.event.pull_request.base.sha }}");
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).toContain(
      'bun scripts/main-promotion-policy.ts "$GITHUB_EVENT_PATH" "$GITHUB_REPOSITORY"',
    );
  });
});
