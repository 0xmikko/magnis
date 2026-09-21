/**
 * @test-id: tst_cat_tg_performance_runner_001
 * @scenario: scn_tg_performance_runner_boundary_001
 * @covers: acceptance/telegram-performance/run.ts::appIdentity
 * @deterministic: yes
 * @fixtures: one temporary minimal app worktree
 */
import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  appIdentity,
  RESET_SQL,
  runCommand,
  summarizeSyncTurns,
  validateAppRoot,
} from "./run";

function temporaryApp(): { readonly parent: string; readonly root: string } {
  const parent = mkdtempSync(join(tmpdir(), "magnis-telegram-performance-runner-"));
  const root = join(parent, "app");
  mkdirSync(join(root, "backend"), { recursive: true });
  mkdirSync(join(root, "scripts", "dev"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({
    scripts: { dev: "fixture" },
  }));
  writeFileSync(join(root, "backend", "package.json"), "{}");
  writeFileSync(join(root, "scripts", "dev", "dev.ts"), "");
  const git = (...args: string[]): void => {
    const result = Bun.spawnSync(["git", ...args], {
      cwd: root,
      env: { HOME: process.env.HOME ?? "", PATH: process.env.PATH ?? "" },
      stdout: "pipe",
      stderr: "pipe",
    });
    if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
  };
  git("init", "-b", "feat/fixture");
  git("config", "user.email", "fixture@example.invalid");
  git("config", "user.name", "Fixture");
  git("add", ".");
  git("commit", "-m", "fixture");
  return { parent, root };
}

test("tst_cat_tg_performance_runner_001 records the selected app branch and commit", () => {
  const app = temporaryApp();
  try {
    expect(validateAppRoot(app.root)).toBe(realpathSync(app.root));
    const identity = appIdentity(app.root);
    expect(identity.root).toBe(realpathSync(app.root));
    expect(identity.branch).toBe("feat/fixture");
    expect(identity.commit).toMatch(/^[0-9a-f]{40}$/);
  } finally {
    rmSync(app.parent, { recursive: true, force: true });
  }
});

/**
 * @test-id: tst_cat_tg_performance_runner_002
 * @scenario: scn_tg_performance_reset_001
 * @covers: acceptance/telegram-performance/run.ts::RESET_SQL
 * @deterministic: yes
 * @fixtures: none
 */
test("tst_cat_tg_performance_runner_002 reset clears sync results without touching authentication", () => {
  expect(RESET_SQL).toContain("UPDATE sync_state");
  expect(RESET_SQL).toContain("lease_generation = lease_generation + 1");
  expect(RESET_SQL).not.toMatch(/TRUNCATE TABLE[^;]*\bsync_state\b/i);
  expect(RESET_SQL).toContain("entities");
  for (const preserved of ["secrets", "source_credentials", "source_connections", "source_accounts"]) {
    expect(RESET_SQL).not.toMatch(new RegExp(`(?:TRUNCATE|DELETE\\s+FROM)[^;]*\\b${preserved}\\b`, "i"));
  }
});

/**
 * @test-id: tst_cat_tg_performance_runner_003
 * @scenario: scn_tg_performance_report_001
 * @covers: acceptance/telegram-performance/run.ts::summarizeSyncTurns
 * @deterministic: yes
 * @fixtures: fixed JSON log lines
 */
test("tst_cat_tg_performance_runner_003 reports only real Telegram turns after the run marker", () => {
  const lines = [
    { sourceId: "telegram", msg: "sync turn", ts: "2026-09-21T09:59:59.000Z", durationMs: 10, fetchMs: 4, admitMs: 6, overlapMs: 0, envelopes: 1, inserted: 1, removed: 0 },
    { sourceId: "google", msg: "sync turn", ts: "2026-09-21T10:00:01.000Z", durationMs: 20, fetchMs: 8, admitMs: 12, overlapMs: 0, envelopes: 2, inserted: 2, removed: 0 },
    { sourceId: "telegram", msg: "sync turn", ts: "2026-09-21T10:00:02.000Z", durationMs: 1000, fetchMs: 600, admitMs: 700, overlapMs: 300, envelopes: 100, inserted: 101, removed: 1 },
    { sourceId: "telegram", msg: "sync turn", ts: "2026-09-21T10:00:04.000Z", durationMs: 1500, fetchMs: 1000, admitMs: 700, overlapMs: 200, envelopes: 50, inserted: 50, removed: 0 },
  ].map((line) => JSON.stringify(line)).join("\n");

  expect(summarizeSyncTurns(lines, "2026-09-21T10:00:00.000Z")).toEqual({
    turns: 2,
    envelopes: 150,
    inserted: 151,
    removed: 1,
    durationMs: 2500,
    fetchMs: 1600,
    admitMs: 1400,
    overlapMs: 500,
    wallMs: 3000,
    firstTurnAt: "2026-09-21T10:00:02.000Z",
    lastTurnAt: "2026-09-21T10:00:04.000Z",
  });
});

/**
 * @test-id: tst_cat_tg_performance_runner_004
 * @scenario: scn_tg_performance_stop_001
 * @covers: acceptance/telegram-performance/run.ts::runCommand
 * @deterministic: yes
 * @fixtures: one child process with an explicit SIGINT cleanup receipt
 */
test("tst_cat_tg_performance_runner_004 waits for child cleanup after SIGINT", async () => {
  const root = mkdtempSync(join(tmpdir(), "magnis-telegram-performance-stop-"));
  const marker = join(root, "clean");
  try {
    const child = `
      import { writeFileSync } from "node:fs";
      process.once("SIGINT", () => {
        writeFileSync(process.env.RUN_COMMAND_MARKER, "clean");
        process.exit(0);
      });
      setTimeout(() => {
        process.kill(process.ppid, "SIGINT");
        process.kill(process.pid, "SIGINT");
      }, 10);
      await new Promise(() => undefined);
    `;
    await runCommand(["bun", "-e", child], root, {
      ...process.env,
      RUN_COMMAND_MARKER: marker,
    });
    expect(readFileSync(marker, "utf8")).toBe("clean");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
