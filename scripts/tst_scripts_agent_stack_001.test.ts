import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { expect, test } from "bun:test";

import * as agentVerify from "./agent-verify.ts";

const root = resolve(import.meta.dir, "..");
const head = "a".repeat(40);

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "catalog-hooks-"));
  const calls = join(directory, "calls");
  const receipt = join(directory, "verify-pr.sha");
  writeFileSync(receipt, `${head}\n`);
  writeFileSync(join(directory, "git"), `#!/bin/sh
set -eu
if [ "$1" = "-C" ]; then shift 2; fi
case "$*" in
  'rev-parse --show-toplevel') printf '%s\\n' "$FIXTURE_ROOT" ;;
  'rev-parse --abbrev-ref HEAD') printf '%s\\n' "$FIXTURE_BRANCH" ;;
  'rev-parse HEAD') printf '%s\\n' "$FIXTURE_HEAD" ;;
  'rev-parse --path-format=absolute --git-path code-production/verify-pr.sha') printf '%s\\n' "$FIXTURE_RECEIPT" ;;
  'diff --cached --name-only --diff-filter=ACMR -- docs/plans/*.md'|'ls-files docs/plans/*.md'|'diff --quiet'|'diff --cached --quiet'|'diff --cached --name-only -z --diff-filter=ACMRD') ;;
  *) printf 'unexpected fixture git: %s\\n' "$*" >&2; exit 97 ;;
esac
`, { mode: 0o755 });
  writeFileSync(join(directory, "bun"), `#!/bin/sh
set -eu
printf '%s\\n' "$*" >> "$FIXTURE_CALLS"
if [ "$*" = 'run agent:verify:commit' ]; then
  exec "$FIXTURE_BUN" "$FIXTURE_ROOT/scripts/agent-verify.ts" commit
fi
`, { mode: 0o755 });
  return {
    run(hook: string, branch = "feat/fixture", input = "") {
      writeFileSync(calls, "");
      const result = spawnSync("bash", [join(root, ".githooks", hook)], {
        cwd: directory, input, encoding: "utf8", timeout: 10_000,
        env: {
          ...process.env, PATH: `${directory}:${process.env.PATH}`,
          FIXTURE_ROOT: root, FIXTURE_BRANCH: branch, FIXTURE_HEAD: head,
          FIXTURE_RECEIPT: receipt, FIXTURE_CALLS: calls, FIXTURE_BUN: process.execPath,
        },
      });
      if (result.error) throw result.error;
      return {
        status: result.status,
        output: result.stdout + result.stderr,
        calls: existsSync(calls) ? readFileSync(calls, "utf8").trim().split("\n").filter(Boolean) : [],
      };
    },
    close() { rmSync(directory, { recursive: true, force: true }); },
  };
}

/**
 * @test-id: tst_scripts_agent_stack_001
 * @scenario: scn_tgflood_prep_001
 * @covers: .githooks/pre-commit; scripts/agent-verify.ts
 * @deterministic: yes
 * @fixtures: isolated fake Git/Bun executables; no repository writes or provider calls
 */
test("tst_scripts_agent_stack_001 rejects protected commits and dispatches scoped adapters", () => {
  const f = fixture();
  try {
    for (const branch of ["main", "staging"]) {
      const rejected = f.run("pre-commit", branch);
      expect(rejected.status).not.toBe(0);
      expect(rejected.output).toContain("not allowed");
      expect(rejected.calls).not.toContain("run typecheck");
    }
    const accepted = f.run("pre-commit");
    expect(accepted.status).toBe(0);
    expect(accepted.calls).toEqual(["run agent:verify:docs", "run agent:verify:commit"]);
  } finally { f.close(); }
});

/**
 * @test-id: tst_scripts_agent_stack_002
 * @scenario: scn_tgflood_prep_002
 * @covers: .githooks/pre-push
 * @deterministic: yes
 * @fixtures: fake clean Git head and exact-head receipt; hook invoked directly, never git push
 */
test("tst_scripts_agent_stack_002 refuses every main ref even when a complete gate receipt exists", () => {
  const f = fixture();
  try {
    const allowed = `refs/heads/feat/fixture ${head} refs/heads/feat/fixture ${head}\n`;
    const forbidden = `refs/heads/feat/fixture ${head} refs/heads/main ${head}\n`;
    const rejected = f.run("pre-push", "feat/fixture", allowed + forbidden);
    expect(rejected.status).not.toBe(0);
    expect(rejected.output).toContain("direct push to main is not allowed");
    expect(rejected.calls).toEqual([]);
    const accepted = f.run("pre-push", "feat/fixture", allowed);
    expect(accepted.status).toBe(0);
    expect(accepted.output).toContain("reusing complete gate receipt");
    expect(accepted.calls).toEqual([]);
  } finally { f.close(); }
});

/**
 * @test-id: tst_scripts_agent_stack_003
 * @scenario: scn_tgflood_prep_003
 * @covers: scripts/agent-verify.ts::backendLanes
 * @deterministic: yes
 * @fixtures: in-memory test sources; no repository writes or adapter execution
 */
test("tst_scripts_agent_stack_003 dispatches mixed bun and vitest targets as separate backend lanes", () => {
  const sources: Record<string, string> = {
    "sources/telegram/src/client.test.ts": 'import { test } from "bun:test";',
    "sources/x/src/__tests__/xContract.test.ts": "runSourceContract(config);",
    "sources/mock-gmail/src/execute.test.ts": 'import { it } from "vitest";',
    "modules/telegram/module/__tests__/telegramIngest.test.ts": 'import { it } from "vitest";',
    "scripts/build-catalog-index.test.ts": "import { test } from 'bun:test';",
  };
  expect(agentVerify.backendLanes(Object.keys(sources), (path) => sources[path] ?? "")).toEqual([
    ["sources/telegram/src/client.test.ts", "sources/x/src/__tests__/xContract.test.ts", "scripts/build-catalog-index.test.ts"],
    ["sources/mock-gmail/src/execute.test.ts", "modules/telegram/module/__tests__/telegramIngest.test.ts"],
  ]);
  expect(agentVerify.backendLanes(["sources/telegram/src/client.test.ts"], () => 'from "bun:test"')).toEqual([
    ["sources/telegram/src/client.test.ts"],
  ]);
});

/**
 * @test-id: tst_scripts_agent_stack_004
 * @scenario: scn_catalog_layout_001
 * @covers: scripts/agent-verify.ts::typeConfig; scripts/tsconfig.json
 * @deterministic: yes
 * @fixtures: repository TypeScript project configuration; no provider calls
 */
test("tst_scripts_agent_stack_004 root Vitest configs have a scoped TypeScript owner", () => {
  expect(agentVerify.typeConfig("vitest.config.ts")).toBe("scripts/tsconfig.json");
  expect(agentVerify.typeConfig("vitest.ui.config.ts")).toBe("scripts/tsconfig.json");
  const config = JSON.parse(readFileSync(join(root, "scripts", "tsconfig.json"), "utf8")) as { include: string[] };
  expect(config.include).toContain("../vitest.config.ts");
  expect(config.include).toContain("../vitest.ui.config.ts");
});
