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

/**
 * @test-id: tst_scripts_agent_stack_007
 * @scenario: scn_catalog_layout_001
 * @covers: scripts/agent-verify.ts::typeConfig
 * @deterministic: yes
 * @fixtures: repository TypeScript project configuration; no provider calls
 *
 * A merge that moves a module deletes files whose whole project went with
 * them: such a path has no TypeScript owner left, and nothing to check.
 */
test("tst_scripts_agent_stack_007 a path whose project is gone has no TypeScript owner", () => {
  expect(agentVerify.typeConfig("plugins/modules/gone/module/service.ts")).toBeNull();
  expect(agentVerify.typeConfig("modules/email/module/service.ts")).toBe("modules/email/tsconfig.json");
});

/** @test-id: tst_scripts_agent_stack_005
 * @scenario: scn_socials_publication_001
 * @covers: plan-gate::gatePlan,shaKnownAndAncestor
 * @deterministic: yes
 * @fixtures: two isolated Git repositories and an inherited hook environment
 */
test("tst_scripts_agent_stack_005 validates Delivery receipts in the configured checkout under Git hooks", () => {
  const directory = mkdtempSync(join(tmpdir(), "socials-delivery-gate-"));
  const gitVars = spawnSync("git", ["rev-parse", "--local-env-vars"], { encoding: "utf8" }).stdout.trim().split("\n");
  const clean = Object.fromEntries(Object.entries(process.env).filter(([key]) => !gitVars.includes(key)));
  const git = (cwd: string, ...args: string[]): string => {
    const run = spawnSync("git", args, { cwd, env: clean, encoding: "utf8" });
    if (run.status !== 0) throw new Error(run.stderr);
    return run.stdout.trim();
  };
  try {
    const makeRepo = (name: string): string => {
      const path = join(directory, name);
      git(directory, "init", "-q", path);
      git(path, "config", "user.name", "Fixture");
      git(path, "config", "user.email", "fixture@example.test");
      writeFileSync(join(path, `${name}.txt`), name);
      git(path, "add", "."); git(path, "commit", "-qm", name);
      return path;
    };
    const catalog = makeRepo("catalog");
    const app = makeRepo("app");
    const localSha = git(catalog, "rev-parse", "HEAD");
    const remoteSha = git(app, "rev-parse", "HEAD");
    git(catalog, "config", "code-production.repository.app", app);
    const plan = join(catalog, "plan.md");
    const body = ["# Fixture", "Status: APPROVED", "Active Delivery: D2",
      "<!-- plan:delivery:D1:start -->", '<!-- plan:delivery-meta:{"active":false,"repository":"app"} -->',
      "Branch: `feat/fixture`;", `- [x] \`test -f app.txt\` exits 0 — ${remoteSha}`, "<!-- plan:delivery:D1:end -->",
      "<!-- plan:delivery:D2:start -->", '<!-- plan:delivery-meta:{"active":true} -->',
      "Branch: `feat/fixture`;", `- [x] \`test -f catalog.txt\` exits 0 — ${localSha}`, "<!-- plan:delivery:D2:end -->",
    ].join("\n");
    writeFileSync(plan, body);
    const check = () => spawnSync(process.execPath, [join(root, ".agents/code-production/runtime/plan-gate.ts"), plan, "--root", catalog], {
      cwd: catalog, encoding: "utf8", env: { ...clean, GIT_DIR: join(catalog, ".git"), GIT_WORK_TREE: catalog },
    });
    const passed = check();
    expect(passed.stdout + passed.stderr).not.toContain("VIOLATION");
    expect(passed.status).toBe(0);
    writeFileSync(plan, body.replace(`exits 0 — ${localSha}`, `exits 0 — ${remoteSha}`));
    expect(check().stdout).toContain("unknown-receipt");
    git(catalog, "config", "--unset", "code-production.repository.app");
    expect(check().status).not.toBe(0);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

/** @test-id: tst_scripts_agent_stack_006
 * @scenario: scn_socials_publication_001
 * @covers: plan-gate::shaKnownAndAncestor
 * @deterministic: yes
 * @fixtures: one Git repository with a merge in progress
 */
test("tst_scripts_agent_stack_006 a receipt that arrives with the merge being committed is known", () => {
  const directory = mkdtempSync(join(tmpdir(), "merge-receipt-gate-"));
  const gitVars = spawnSync("git", ["rev-parse", "--local-env-vars"], { encoding: "utf8" }).stdout.trim().split("\n");
  const clean = Object.fromEntries(Object.entries(process.env).filter(([key]) => !gitVars.includes(key)));
  const git = (cwd: string, ...args: string[]): string => {
    const run = spawnSync("git", args, { cwd, env: clean, encoding: "utf8" });
    if (run.status !== 0) throw new Error(run.stderr);
    return run.stdout.trim();
  };
  try {
    const repo = join(directory, "catalog");
    git(directory, "init", "-q", "--initial-branch=main", repo);
    git(repo, "config", "user.name", "Fixture");
    git(repo, "config", "user.email", "fixture@example.test");
    const commit = (name: string): string => {
      writeFileSync(join(repo, `${name}.txt`), name);
      git(repo, "add", "."); git(repo, "commit", "-qm", name);
      return git(repo, "rev-parse", "HEAD");
    };
    commit("base");
    git(repo, "checkout", "-qb", "side");
    const incoming = commit("incoming");
    git(repo, "checkout", "-q", "main");
    commit("ours");
    git(repo, "checkout", "-qb", "elsewhere", "main~1");
    const unrelated = commit("unrelated");
    git(repo, "checkout", "-q", "main");
    git(repo, "merge", "--no-commit", "--no-ff", "side");
    const plan = join(directory, "plan.md");
    const body = (receipt: string) => ["# Fixture", "Status: APPROVED", `- [x] \`test -f incoming.txt\` exits 0 — ${receipt}`].join("\n");
    const check = () => spawnSync(process.execPath, [join(root, ".agents/code-production/runtime/plan-gate.ts"), plan, "--root", repo, "--no-exec"], {
      cwd: repo, encoding: "utf8", env: { ...clean, GIT_DIR: join(repo, ".git"), GIT_WORK_TREE: repo },
    });

    // @tested-by: tst_scripts_agent_stack_006
    // @invariant: the merge being committed makes MERGE_HEAD a parent, so its
    // receipts are known; a commit on neither side stays unknown.
    writeFileSync(plan, body(incoming));
    const passed = check();
    expect(passed.stdout + passed.stderr).not.toContain("VIOLATION");
    expect(passed.status).toBe(0);
    writeFileSync(plan, body(unrelated));
    expect(check().stdout).toContain("unknown-receipt");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
