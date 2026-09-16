import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { expect, test } from "bun:test";

const root = resolve(import.meta.dir, "..");
const sourceTest = "plugins/sources/telegram/src/client.test.ts";
const moduleTest = "plugins/modules/triggers/module/__tests__/triggersRead.test.ts";

/**
 * @test-id: tst_scripts_tgflood_001
 * @scenario: scn_tgflood_008
 * @covers: scripts/test-connectors.sh --agent
 * @deterministic: yes
 * @fixtures: test-owned Bun/Vitest command recorders, no provider sessions
 */
test("tst_scripts_tgflood_001 routes exact targets, retains filters and fails visibly", () => {
  const dir = mkdtempSync(join(tmpdir(), "telegram-test-runner-"));
  const calls = join(dir, "calls");
  try {
    for (const executable of ["bun", "bunx"]) {
      writeFileSync(join(dir, executable), `#!/bin/sh
printf '%s\\n' '${executable}' "$@" >> "$FLOOD_RUNNER_CALLS"
exit "$FLOOD_RUNNER_EXIT"
`, { mode: 0o755 });
    }
    const invoke = (args: string[], exit = 0) => {
      writeFileSync(calls, "");
      const result = spawnSync("bash", [join(root, "scripts/test-connectors.sh"), ...args], {
        cwd: root, encoding: "utf8", timeout: 10_000,
        env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, FLOOD_RUNNER_CALLS: calls, FLOOD_RUNNER_EXIT: String(exit) },
      });
      if (result.error) throw result.error;
      return { status: result.status, output: result.stdout + result.stderr, calls: readFileSync(calls, "utf8").trim().split("\n").filter(Boolean) };
    };
    for (const [target, runner] of [[sourceTest, ["bun", "test"]], [moduleTest, ["bunx", "vitest", "run"]]] as const) {
      const args = [target, "-t", "keeps a spaced filter"];
      const passed = invoke(["--agent", ...args]);
      expect(passed.status).toBe(0);
      expect(passed.calls).toEqual([...runner, ...args]);
      const failed = invoke(["--agent", ...args], 23);
      expect(failed.status).toBe(23);
      expect(failed.calls).toEqual([...runner, ...args]);
    }
    const multiple = invoke(["--agent", sourceTest, "scripts/tst_scripts_tgflood_001.test.ts"]);
    expect(multiple.calls).toEqual(["bun", "test", sourceTest, "scripts/tst_scripts_tgflood_001.test.ts"]);
    for (const args of [["missing.test.ts"], ["package.json"], [sourceTest, moduleTest]]) {
      const rejected = invoke(["--agent", ...args]);
      expect(rejected.status).not.toBe(0);
      expect(rejected.calls).toEqual([]);
    }
    const defaultLane = invoke(["--agent"]);
    expect(defaultLane.status).toBe(0);
    expect(defaultLane.calls).toEqual(["bunx", "vitest", "run"]);
    const complete = invoke([]);
    expect(complete.status).toBe(0);
    expect(complete.calls.filter((arg) => arg === "bun")).toHaveLength(12);
    expect(complete.calls).toContain("__tests__/tst_cat_src_cert_001.test.ts");
    expect(invoke([], 23).status).toBe(23);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

/**
 * @test-id: tst_scripts_tgflood_002
 * @scenario: scn_tgflood_008
 * @covers: scripts/test-connectors.sh --agent
 * @deterministic: yes
 * @fixtures: test-owned Bun/Vitest command recorders; a module's declaration test beside module/
 */
test("tst_scripts_tgflood_002 routes a module declaration test to the vitest lane", () => {
  const dir = mkdtempSync(join(tmpdir(), "telegram-test-runner-"));
  const calls = join(dir, "calls");
  try {
    for (const executable of ["bun", "bunx"]) {
      writeFileSync(join(dir, executable), `#!/bin/sh
printf '%s\\n' '${executable}' "$@" >> "$FLOOD_RUNNER_CALLS"
exit 0
`, { mode: 0o755 });
    }
    writeFileSync(calls, "");
    const declarationTest = "plugins/modules/telegram/entities.test.ts";
    const result = spawnSync("bash", [join(root, "scripts/test-connectors.sh"), "--agent", declarationTest, "-t", "carries the index flag"], {
      cwd: root, encoding: "utf8", timeout: 10_000,
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, FLOOD_RUNNER_CALLS: calls },
    });
    if (result.error) throw result.error;
    expect(result.status).toBe(0);
    expect(readFileSync(calls, "utf8").trim().split("\n").filter(Boolean))
      .toEqual(["bunx", "vitest", "run", declarationTest, "-t", "carries the index flag"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
