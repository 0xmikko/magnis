#!/usr/bin/env bun
import { SQL } from "bun";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CATALOG_ROOT = resolve(import.meta.dirname, "../..");
const RUN_MARKER = "telegram-performance-run.json";
const GIT_PROCESS_VARIABLES = new Set([
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_COMMON_DIR",
  "GIT_PREFIX",
  "GIT_OBJECT_DIRECTORY",
]);
const USAGE = `usage:
  bun acceptance/telegram-performance/run.ts check  --app-root ABS
  bun acceptance/telegram-performance/run.ts start  --app-root ABS --data-root ABS --port N [--env-file ABS]
  bun acceptance/telegram-performance/run.ts reset  --app-root ABS --data-root ABS
  bun acceptance/telegram-performance/run.ts report --data-root ABS`;

type Command = "check" | "start" | "reset" | "report";

interface Options {
  readonly command: Command;
  readonly appRoot: string | null;
  readonly dataRoot: string | null;
  readonly port: number | null;
  readonly envFile: string | null;
}

export interface AppIdentity {
  readonly root: string;
  readonly branch: string;
  readonly commit: string;
}

export interface SyncSummary {
  readonly turns: number;
  readonly envelopes: number;
  readonly inserted: number;
  readonly removed: number;
  readonly durationMs: number;
  readonly fetchMs: number;
  readonly admitMs: number;
  readonly overlapMs: number;
  readonly wallMs: number;
  readonly firstTurnAt: string | null;
  readonly lastTurnAt: string | null;
}

interface RunMarker {
  readonly startedAt: string;
  readonly app: AppIdentity;
  readonly catalog: Omit<AppIdentity, "root">;
}

/**
 * Reset only synchronization output and progress. The four authentication
 * tables are fingerprinted inside the same PostgreSQL statement; any change
 * raises and rolls the statement back.
 *
 * @tested-by: tst_cat_tg_performance_runner_002
 * @invariant: a performance reset never changes a saved Telegram session
 */
export const RESET_SQL = `
DO $telegram_performance_reset$
DECLARE
  secrets_before text;
  credentials_before text;
  connections_before text;
  accounts_before text;
BEGIN
  SELECT md5(coalesce(string_agg(to_jsonb(row_value)::text, '' ORDER BY to_jsonb(row_value)::text), ''))
    INTO secrets_before FROM secrets AS row_value;
  SELECT md5(coalesce(string_agg(to_jsonb(row_value)::text, '' ORDER BY to_jsonb(row_value)::text), ''))
    INTO credentials_before FROM source_credentials AS row_value;
  SELECT md5(coalesce(string_agg(to_jsonb(row_value)::text, '' ORDER BY to_jsonb(row_value)::text), ''))
    INTO connections_before FROM source_connections AS row_value;
  SELECT md5(coalesce(string_agg(to_jsonb(row_value)::text, '' ORDER BY to_jsonb(row_value)::text), ''))
    INTO accounts_before FROM source_accounts AS row_value;

  TRUNCATE TABLE
    sync_cursors,
    sync_jobs,
    sync_state,
    graph_discard,
    embedding_index,
    embedding_fts,
    embedding_vectors,
    property_index,
    links,
    entities,
    events
  RESTART IDENTITY CASCADE;

  IF secrets_before IS DISTINCT FROM (
      SELECT md5(coalesce(string_agg(to_jsonb(row_value)::text, '' ORDER BY to_jsonb(row_value)::text), ''))
      FROM secrets AS row_value
    ) OR credentials_before IS DISTINCT FROM (
      SELECT md5(coalesce(string_agg(to_jsonb(row_value)::text, '' ORDER BY to_jsonb(row_value)::text), ''))
      FROM source_credentials AS row_value
    ) OR connections_before IS DISTINCT FROM (
      SELECT md5(coalesce(string_agg(to_jsonb(row_value)::text, '' ORDER BY to_jsonb(row_value)::text), ''))
      FROM source_connections AS row_value
    ) OR accounts_before IS DISTINCT FROM (
      SELECT md5(coalesce(string_agg(to_jsonb(row_value)::text, '' ORDER BY to_jsonb(row_value)::text), ''))
      FROM source_accounts AS row_value
    ) THEN
    RAISE EXCEPTION 'Telegram performance reset changed authentication state';
  END IF;
END
$telegram_performance_reset$;
`;

function fail(message: string): never {
  throw new Error(`${message}\n${USAGE}`);
}

function absolutePath(flag: string, value: string): string {
  if (!isAbsolute(value)) fail(`${flag} must be an absolute path`);
  return value;
}

function parseOptions(args: readonly string[]): Options {
  const [rawCommand, ...rest] = args;
  if (rawCommand !== "check" && rawCommand !== "start" && rawCommand !== "reset" && rawCommand !== "report") {
    fail("Expected check, start, reset or report");
  }
  let appRoot: string | null = null;
  let dataRoot: string | null = null;
  let port: number | null = null;
  let envFile: string | null = null;
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (value === undefined) fail(`${String(flag)} requires a value`);
    switch (flag) {
      case "--app-root":
        appRoot = absolutePath(flag, value);
        break;
      case "--data-root":
        dataRoot = absolutePath(flag, value);
        break;
      case "--env-file":
        envFile = absolutePath(flag, value);
        break;
      case "--port":
        if (!/^\d+$/.test(value) || Number(value) + 2000 > 65_535) {
          fail("--port must be a port number below 63536");
        }
        port = Number(value);
        break;
      default:
        fail(`Unknown argument: ${String(flag)}`);
    }
    index += 1;
  }
  if (rawCommand !== "report" && appRoot === null) fail("Pass --app-root <magnis-app-worktree>");
  if (rawCommand !== "check" && dataRoot === null) fail("Pass --data-root <persistent-stand-directory>");
  if (rawCommand === "start" && port === null) fail("Pass --port <backend-port>");
  if (rawCommand !== "start" && (port !== null || envFile !== null)) {
    fail("--port and --env-file belong only to start");
  }
  return { command: rawCommand, appRoot, dataRoot, port, envFile };
}

function readJson(path: string): Record<string, unknown> {
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Expected a JSON object: ${path}`);
  }
  return value as Record<string, unknown>;
}

/** Validate the selected checkout without modifying it. */
export function validateAppRoot(configured: string): string {
  const appRoot = realpathSync(configured);
  const pkg = readJson(join(appRoot, "package.json"));
  const scripts = pkg.scripts;
  if (scripts === null || typeof scripts !== "object" || Array.isArray(scripts)) {
    throw new Error(`Not a Magnis app worktree: ${appRoot}`);
  }
  const named = scripts as Record<string, unknown>;
  if (typeof named.dev !== "string") {
    throw new Error(`Not a Magnis app worktree: ${appRoot}`);
  }
  readJson(join(appRoot, "backend", "package.json"));
  if (!existsSync(join(appRoot, "scripts", "dev", "dev.ts"))) {
    throw new Error(`Not a Magnis app worktree: ${appRoot}`);
  }
  return appRoot;
}

function commandOutput(root: string, command: readonly string[]): string {
  const result = Bun.spawnSync([...command], {
    cwd: root,
    env: Object.fromEntries(
      Object.entries(process.env).filter(([name, value]) => !GIT_PROCESS_VARIABLES.has(name) && value !== undefined),
    ),
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) {
    throw new Error(new TextDecoder().decode(result.stderr).trim() || `${command.join(" ")} failed`);
  }
  return new TextDecoder().decode(result.stdout).trim();
}

/**
 * @tested-by: tst_cat_tg_performance_runner_001
 * @invariant: every measurement names the exact clean app branch and commit
 */
export function appIdentity(configured: string): AppIdentity {
  const root = validateAppRoot(configured);
  const dirty = commandOutput(root, ["git", "status", "--porcelain"]);
  if (dirty !== "") throw new Error(`Selected app worktree is dirty: ${root}`);
  const branch = commandOutput(root, ["git", "symbolic-ref", "--short", "HEAD"]);
  const commit = commandOutput(root, ["git", "rev-parse", "HEAD"]);
  return { root, branch, commit };
}

function catalogIdentity(): Omit<AppIdentity, "root"> {
  const dirty = commandOutput(CATALOG_ROOT, ["git", "status", "--porcelain"]);
  if (dirty !== "") throw new Error(`Catalog worktree is dirty: ${CATALOG_ROOT}`);
  return {
    branch: commandOutput(CATALOG_ROOT, ["git", "symbolic-ref", "--short", "HEAD"]),
    commit: commandOutput(CATALOG_ROOT, ["git", "rev-parse", "HEAD"]),
  };
}

function numberField(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * @tested-by: tst_cat_tg_performance_runner_003
 * @invariant: the report includes only live app Telegram turns after this run began
 */
export function summarizeSyncTurns(log: string, since: string): SyncSummary {
  const sinceMs = Date.parse(since);
  if (!Number.isFinite(sinceMs)) throw new Error(`Invalid run marker timestamp: ${since}`);
  const turns: (Record<string, unknown> & { ts: string })[] = [];
  for (const line of log.split("\n")) {
    if (line.trim() === "") continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      continue;
    }
    if (value === null || typeof value !== "object" || Array.isArray(value)) continue;
    const record = value as Record<string, unknown>;
    if (record.sourceId !== "telegram" || record.msg !== "sync turn" || typeof record.ts !== "string") continue;
    if (Date.parse(record.ts) < sinceMs) continue;
    const fields = ["durationMs", "fetchMs", "admitMs", "overlapMs", "envelopes", "inserted", "removed"];
    if (fields.some((field) => numberField(record[field]) === null)) continue;
    turns.push({ ...record, ts: record.ts });
  }
  turns.sort((left, right) => Date.parse(left.ts) - Date.parse(right.ts));
  const sum = (field: string): number => turns.reduce((total, turn) => total + (numberField(turn[field]) ?? 0), 0);
  const first = turns[0];
  const last = turns.at(-1);
  const firstStart = first === undefined ? null : Date.parse(first.ts) - (numberField(first.durationMs) ?? 0);
  const lastEnd = last === undefined ? null : Date.parse(last.ts);
  return {
    turns: turns.length,
    envelopes: sum("envelopes"),
    inserted: sum("inserted"),
    removed: sum("removed"),
    durationMs: sum("durationMs"),
    fetchMs: sum("fetchMs"),
    admitMs: sum("admitMs"),
    overlapMs: sum("overlapMs"),
    wallMs: firstStart === null || lastEnd === null ? 0 : lastEnd - firstStart,
    firstTurnAt: first?.ts ?? null,
    lastTurnAt: last?.ts ?? null,
  };
}

async function run(command: readonly string[], root: string, env: Record<string, string | undefined> = process.env): Promise<void> {
  const child = Bun.spawn([...command], { cwd: root, env, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
  const exitCode = await child.exited;
  if (exitCode !== 0) throw new Error(`${command.join(" ")} exited with ${String(exitCode)}`);
}

async function buildCatalog(channelRoot: string, revision: string): Promise<void> {
  mkdirSync(channelRoot, { recursive: true });
  await run(["bun", "scripts/build-catalog-index.ts"], CATALOG_ROOT, {
    ...process.env,
    CATALOG_OUT: channelRoot,
    GITHUB_SHA: revision,
  });
}

function fixtureConfigured(text: string): boolean {
  return /^\s*(?:export\s+)?TELEGRAM_FIXTURE_FILE\s*=\s*[^\s#]+/mu.test(text);
}

function assertLiveTelegram(appRoot: string, envFile: string | null): void {
  if ((process.env.TELEGRAM_FIXTURE_FILE ?? "").trim() !== "") {
    throw new Error("TELEGRAM_FIXTURE_FILE is set; the performance stand accepts only live Telegram");
  }
  for (const path of [envFile, join(appRoot, ".env")]) {
    if (path !== null && existsSync(path) && fixtureConfigured(readFileSync(path, "utf8"))) {
      throw new Error(`${path} configures TELEGRAM_FIXTURE_FILE; the performance stand accepts only live Telegram`);
    }
  }
}

async function start(options: Options): Promise<void> {
  if (options.appRoot === null || options.dataRoot === null || options.port === null) throw new Error("Invalid start options");
  const app = appIdentity(options.appRoot);
  const catalog = catalogIdentity();
  const envFile = options.envFile === null ? null : realpathSync(options.envFile);
  assertLiveTelegram(app.root, envFile);
  const channelRoot = join(options.dataRoot, "catalog");
  await buildCatalog(channelRoot, catalog.commit);
  mkdirSync(options.dataRoot, { recursive: true });
  const marker: RunMarker = { startedAt: new Date().toISOString(), app, catalog };
  writeFileSync(join(options.dataRoot, RUN_MARKER), `${JSON.stringify(marker, null, 2)}\n`);
  console.log(`telegram-performance: app ${app.branch}@${app.commit}`);
  console.log(`telegram-performance: catalog ${catalog.branch}@${catalog.commit}`);
  console.log(`telegram-performance: data ${options.dataRoot}`);
  const bunArgs = [
    "bun",
    ...(envFile === null ? [] : [`--env-file=${envFile}`]),
    "scripts/dev/dev.ts",
    "--port",
    String(options.port),
    "--data-root",
    options.dataRoot,
  ];
  await run(bunArgs, app.root, {
    ...process.env,
    MAGNIS_CATALOG_URL: pathToFileURL(channelRoot).href,
  });
}

async function databaseUp(appRoot: string, dataRoot: string): Promise<string> {
  const record = join(dataRoot, "run", "postgres.json");
  if (existsSync(record)) {
    throw new Error(`PostgreSQL is already recorded at ${record}; stop the stand before reset`);
  }
  const child = Bun.spawn(["bun", "scripts/db/postgres.ts", "up", "--data-root", dataRoot], {
    cwd: appRoot,
    env: process.env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "inherit",
  });
  const stdout = await new Response(child.stdout).text();
  const exitCode = await child.exited;
  process.stdout.write(stdout);
  const url = stdout.trimEnd().split("\n").at(-1);
  if (exitCode !== 0 || url?.startsWith("DATABASE_URL=") !== true) {
    if (existsSync(record)) {
      await run(["bun", "scripts/db/postgres.ts", "down", "--data-root", dataRoot], appRoot);
    }
    throw new Error(`PostgreSQL start exited with ${String(exitCode)} without DATABASE_URL`);
  }
  return url.slice("DATABASE_URL=".length);
}

async function reset(options: Options): Promise<void> {
  if (options.appRoot === null || options.dataRoot === null) throw new Error("Invalid reset options");
  const app = appIdentity(options.appRoot);
  const databaseUrl = await databaseUp(app.root, options.dataRoot);
  try {
    const database = new SQL(databaseUrl, { max: 1 });
    try {
      const result: unknown = await database.unsafe("SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()");
      const first: unknown = Array.isArray(result) ? (result as unknown[])[0] : undefined;
      const count = first !== null && typeof first === "object"
        ? Number((first as Record<string, unknown>).count)
        : Number.NaN;
      if (!Number.isInteger(count)) throw new Error("PostgreSQL returned an invalid active-session count");
      if (count !== 0) throw new Error(`Refusing reset while ${String(count)} other database session(s) are active`);
      await database.unsafe(RESET_SQL);
    } finally {
      await database.close();
    }
    console.log("telegram-performance: sync data reset; Telegram secrets and account binding preserved");
  } finally {
    await run(["bun", "scripts/db/postgres.ts", "down", "--data-root", options.dataRoot], app.root);
  }
}

function report(dataRoot: string): void {
  const marker = readJson(join(dataRoot, RUN_MARKER)) as unknown as RunMarker;
  if (typeof marker.startedAt !== "string") throw new Error("Performance run marker has no startedAt");
  const logPath = join(dataRoot, "logs", "backend.log");
  const summary = summarizeSyncTurns(readFileSync(logPath, "utf8"), marker.startedAt);
  const envelopesPerSecond = summary.wallMs === 0 ? 0 : summary.envelopes / (summary.wallMs / 1000);
  console.log(JSON.stringify({ marker, summary, envelopesPerSecond }, null, 2));
}

async function main(args: readonly string[]): Promise<void> {
  const options = parseOptions(args);
  if (options.command === "check") {
    if (options.appRoot === null) throw new Error("Invalid check options");
    console.log(JSON.stringify(appIdentity(options.appRoot), null, 2));
    return;
  }
  if (options.command === "start") {
    await start(options);
    return;
  }
  if (options.command === "reset") {
    await reset(options);
    return;
  }
  if (options.dataRoot === null) throw new Error("Invalid report options");
  report(options.dataRoot);
}

if (import.meta.main) {
  try {
    await main(process.argv.slice(2));
  } catch (error: unknown) {
    console.error(`telegram-performance: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
