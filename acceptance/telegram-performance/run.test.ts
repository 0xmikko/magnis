/**
 * @test-id: tst_cat_tg_performance_runner_001
 * @scenario: scn_tg_performance_runner_boundary_001
 * @covers: acceptance/telegram-performance/run.ts::validateAppRoot
 * @deterministic: yes
 * @fixtures: one temporary minimal app worktree
 */
import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { validateAppRoot } from "./run";

test("tst_cat_tg_performance_runner_001 accepts only an app root with absent injection targets", () => {
  const parent = mkdtempSync(join(tmpdir(), "magnis-telegram-performance-runner-"));
  const appRoot = join(parent, "app");
  try {
    mkdirSync(join(appRoot, "backend", "test"), { recursive: true });
    writeFileSync(join(appRoot, "package.json"), JSON.stringify({
      scripts: { "agent:test:backend": "bun run --cwd backend test" },
    }));
    writeFileSync(join(appRoot, "backend", "package.json"), "{}");

    expect(validateAppRoot(appRoot)).toBe(realpathSync(appRoot));

    writeFileSync(join(appRoot, "backend", "test", "tst_src_int_telegram_sync_001.test.ts"), "owned by app");
    expect(() => validateAppRoot(appRoot)).toThrow("refuses to overwrite");
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
