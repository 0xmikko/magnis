/**
 * @test-id: tst_cat_tg_performance_runner_001
 * @scenario: scn_tg_performance_runner_boundary_001
 * @covers: acceptance/telegram-performance/run.ts::appIdentity
 * @deterministic: yes
 * @fixtures: one temporary minimal app worktree
 */
import { expect, test } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  appIdentity,
  assertLiveSources,
  buildCatalog,
  clearStoppedDatabaseRecord,
  parseOptions,
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
    { sourceId: "telegram", surface: "telegram", msg: "sync turn", ts: "2026-09-21T09:59:59.000Z", durationMs: 10, fetchMs: 4, admitMs: 6, overlapMs: 0, pages: 1, bytes: 100, envelopes: 1, inserted: 1, removed: 0 },
    { sourceId: "telegram", surface: "telegram", msg: "sync turn", ts: "2026-09-21T10:00:02.000Z", durationMs: 1000, fetchMs: 600, admitMs: 700, overlapMs: 300, pages: 2, bytes: 2000, envelopes: 100, inserted: 101, removed: 1 },
    { sourceId: "telegram", surface: "telegram", msg: "sync turn", ts: "2026-09-21T10:00:04.000Z", durationMs: 1500, fetchMs: 1000, admitMs: 700, overlapMs: 200, pages: 1, bytes: 1000, envelopes: 50, inserted: 50, removed: 0 },
  ].map((line) => JSON.stringify(line)).join("\n");

  expect(summarizeSyncTurns(lines, "2026-09-21T10:00:00.000Z")).toEqual([{
    sourceId: "telegram",
    surface: "telegram",
    turns: 2,
    pages: 3,
    bytes: 3000,
    envelopes: 150,
    inserted: 151,
    removed: 1,
    durationMs: 2500,
    fetchMs: 1600,
    admitMs: 1400,
    overlapMs: 500,
    wallMs: 3000,
    envelopesPerSecond: 50,
    firstTurnAt: "2026-09-21T10:00:02.000Z",
    lastTurnAt: "2026-09-21T10:00:04.000Z",
  }]);
});

/**
 * @test-id: tst_cert_google_001
 * @scenario: scn_google_pull_005
 * @covers: acceptance/telegram-performance/run.ts::summarizeSyncTurns
 * @deterministic: yes
 * @fixtures: synthetic production sync-turn JSON; no provider or database
 */
test("tst_cert_google_001 reports Telegram and three Google surfaces separately", () => {
  const turn = (sourceId: string, surface: string, ts: string, envelopes: number, durationMs: number) => ({
    msg: "sync turn", sourceId, surface, ts, pages: 1, bytes: envelopes * 10,
    envelopes, inserted: envelopes, removed: 0, durationMs, fetchMs: durationMs / 2,
    admitMs: durationMs / 2, overlapMs: 0,
  });
  const log = [
    turn("telegram", "telegram", "2026-09-21T10:00:01.000Z", 20, 1000),
    turn("google", "email", "2026-09-21T10:00:02.000Z", 100, 1000),
    turn("google", "meetings", "2026-09-21T10:00:03.000Z", 8, 800),
    turn("google", "contacts", "2026-09-21T10:00:04.000Z", 10, 500),
    turn("google", "email", "2026-09-21T10:00:05.000Z", 50, 1000),
    turn("google", "email", "2026-09-21T09:59:59.000Z", 999, 1000),
    { ...turn("google", "email", "2026-09-21T10:00:06.000Z", 999, 1000), bytes: "invalid" },
  ].map((line) => JSON.stringify(line)).join("\n");
  expect(summarizeSyncTurns(log, "2026-09-21T10:00:00.000Z")).toEqual([
    { sourceId: "google", surface: "contacts", turns: 1, pages: 1, bytes: 100, envelopes: 10, inserted: 10, removed: 0,
      durationMs: 500, fetchMs: 250, admitMs: 250, overlapMs: 0, wallMs: 500, envelopesPerSecond: 20,
      firstTurnAt: "2026-09-21T10:00:04.000Z", lastTurnAt: "2026-09-21T10:00:04.000Z" },
    { sourceId: "google", surface: "email", turns: 2, pages: 2, bytes: 1500, envelopes: 150, inserted: 150, removed: 0,
      durationMs: 2000, fetchMs: 1000, admitMs: 1000, overlapMs: 0, wallMs: 4000, envelopesPerSecond: 37.5,
      firstTurnAt: "2026-09-21T10:00:02.000Z", lastTurnAt: "2026-09-21T10:00:05.000Z" },
    { sourceId: "google", surface: "meetings", turns: 1, pages: 1, bytes: 80, envelopes: 8, inserted: 8, removed: 0,
      durationMs: 800, fetchMs: 400, admitMs: 400, overlapMs: 0, wallMs: 800, envelopesPerSecond: 10,
      firstTurnAt: "2026-09-21T10:00:03.000Z", lastTurnAt: "2026-09-21T10:00:03.000Z" },
    { sourceId: "telegram", surface: "telegram", turns: 1, pages: 1, bytes: 200, envelopes: 20, inserted: 20, removed: 0,
      durationMs: 1000, fetchMs: 500, admitMs: 500, overlapMs: 0, wallMs: 1000, envelopesPerSecond: 20,
      firstTurnAt: "2026-09-21T10:00:01.000Z", lastTurnAt: "2026-09-21T10:00:01.000Z" },
  ]);
});

/**
 * @test-id: tst_cert_google_002
 * @scenario: scn_google_pull_005
 * @covers: acceptance/telegram-performance/run.ts::RESET_SQL; assertLiveSources
 * @deterministic: yes
 * @fixtures: one temporary env file; no provider or database
 */
test("tst_cert_google_002 preserves both providers' credentials and refuses Google fixture mode", () => {
  const root = mkdtempSync(join(tmpdir(), "magnis-google-stand-"));
  const envFile = join(root, "provider.env");
  const original = process.env.GOOGLE_FIXTURE_FILE;
  const originalTelegram = process.env.TELEGRAM_FIXTURE_FILE;
  try {
    writeFileSync(envFile, "GOOGLE_FIXTURE_FILE=/tmp/mock-google.json\n");
    delete process.env.GOOGLE_FIXTURE_FILE;
    delete process.env.TELEGRAM_FIXTURE_FILE;
    expect(() => assertLiveSources(root, envFile)).toThrow("GOOGLE_FIXTURE_FILE");
    process.env.GOOGLE_FIXTURE_FILE = "/tmp/mock-google.json";
    expect(() => assertLiveSources(root, null)).toThrow("GOOGLE_FIXTURE_FILE");
    for (const table of ["secrets", "source_credentials", "source_connections", "source_accounts"]) {
      expect(RESET_SQL).toContain(`FROM ${table} AS row_value`);
      expect(RESET_SQL).not.toMatch(new RegExp(`(?:TRUNCATE|DELETE\\s+FROM)[^;]*\\b${table}\\b`, "i"));
    }
    expect(RESET_SQL).toContain("UPDATE sync_state");
  } finally {
    if (original === undefined) delete process.env.GOOGLE_FIXTURE_FILE;
    else process.env.GOOGLE_FIXTURE_FILE = original;
    if (originalTelegram === undefined) delete process.env.TELEGRAM_FIXTURE_FILE;
    else process.env.TELEGRAM_FIXTURE_FILE = originalTelegram;
    rmSync(root, { recursive: true, force: true });
  }
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
      setTimeout(() => process.kill(process.ppid, "SIGINT"), 10);
      setTimeout(() => process.exit(2), 1_000);
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

/**
 * @test-id: tst_cat_tg_performance_runner_005
 * @scenario: scn_tg_performance_reuse_001
 * @covers: acceptance/telegram-performance/run.ts::clearStoppedDatabaseRecord
 * @deterministic: yes
 * @fixtures: one stopped and one listening loopback database record
 */
test("tst_cat_tg_performance_runner_005 clears only a stopped database record", async () => {
  const root = mkdtempSync(join(tmpdir(), "magnis-telegram-performance-record-"));
  const runRoot = join(root, "run");
  const record = join(runRoot, "postgres.json");
  mkdirSync(runRoot);
  const listener = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  try {
    writeFileSync(record, JSON.stringify({ port: listener.port }));
    await expect(clearStoppedDatabaseRecord(root)).rejects.toThrow("is still listening");
    expect(existsSync(record)).toBe(true);

    listener.stop(true);
    await clearStoppedDatabaseRecord(root);
    expect(existsSync(record)).toBe(false);
  } finally {
    listener.stop(true);
    rmSync(root, { recursive: true, force: true });
  }
});

/**
 * @test-id: tst_cat_tg_performance_runner_006
 * @scenario: scn_tg_performance_indexer_001
 * @covers: acceptance/telegram-performance/run.ts::parseOptions
 * @deterministic: yes
 * @fixtures: none
 */
test("tst_cat_tg_performance_runner_006 requires an explicit indexer mode", () => {
  const start = [
    "start",
    "--app-root", "/tmp/magnis-app",
    "--data-root", "/tmp/magnis-telegram-performance",
    "--port", "3261",
  ];
  expect(parseOptions([...start, "--indexer", "on"]).indexer).toBe("on");
  expect(parseOptions([...start, "--indexer", "off"]).indexer).toBe("off");
  expect(() => parseOptions(start)).toThrow("Pass --indexer <on|off>");
  expect(() => parseOptions([...start, "--indexer", "auto"])).toThrow("--indexer must be on or off");
});

/**
 * @test-id: tst_cat_tg_performance_runner_007
 * @scenario: scn_tg_performance_current_plugin_001
 * @covers: acceptance/telegram-performance/run.ts::buildCatalog
 * @deterministic: yes
 * @fixtures: one temporary command recorder
 */
test("tst_cat_tg_performance_runner_007 builds current plugins before the catalog", async () => {
  const root = mkdtempSync(join(tmpdir(), "magnis-telegram-performance-build-"));
  const bin = join(root, "bin");
  const log = join(root, "commands.log");
  const originalPath = process.env.PATH;
  const originalLog = process.env.CATALOG_BUILD_LOG;
  mkdirSync(bin);
  writeFileSync(join(bin, "bun"), "#!/bin/sh\nprintf '%s\\n' \"$*\" >> \"$CATALOG_BUILD_LOG\"\n");
  chmodSync(join(bin, "bun"), 0o755);
  process.env.PATH = `${bin}:${originalPath ?? ""}`;
  process.env.CATALOG_BUILD_LOG = log;
  try {
    await buildCatalog(join(root, "catalog"), "fixture-revision");
    expect(readFileSync(log, "utf8").trim().split("\n")).toEqual([
      "scripts/build-plugins.ts",
      "scripts/build-catalog-index.ts",
    ]);
  } finally {
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
    if (originalLog === undefined) delete process.env.CATALOG_BUILD_LOG;
    else process.env.CATALOG_BUILD_LOG = originalLog;
    rmSync(root, { recursive: true, force: true });
  }
});
