import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

const CATALOG_ROOT = resolve(import.meta.dirname, "../..");
const OVERLAY_ROOT = join(import.meta.dirname, "app");
const SDK_MEMBERS = [
  "network/MTProtoSender.js",
  "extensions/MessagePacker.js",
  "extensions/MessagePacker.d.ts",
  "client/telegramBaseClient.js",
  "client/telegramBaseClient.d.ts",
] as const;

const OVERLAY_FILES = [
  ["backend/test/tst_src_int_telegram_sync_001.manual.ts.template", "backend/test/tst_src_int_telegram_sync_001.test.ts"],
  ["backend/test/tst_src_int_telegram_graph_001.manual.ts.template", "backend/test/tst_src_int_telegram_graph_001.test.ts"],
  ["backend/test/harness/telegram-source-sync.ts.template", "backend/test/harness/telegram-source-sync.ts"],
  ["backend/test/harness/telegram-source-provider.ts.template", "backend/test/harness/telegram-source-provider.ts"],
  ["backend/test/harness/source-sync-postgres.ts.template", "backend/test/harness/source-sync-postgres.ts"],
] as const;

const GENERATED_FILES = [
  "backend/test/fixtures/telegram-fast-sync/pins.json",
  "test-e2e/fixtures/telegram-unicode/module__telegram.tgz",
  "test-e2e/fixtures/telegram-unicode/package.json",
] as const;

const INJECTION_TARGETS = [
  ...OVERLAY_FILES.map(([, destination]) => destination),
  ...GENERATED_FILES,
];

interface Options {
  appRoot: string;
  check: boolean;
  databaseUrl?: string;
}

interface CatalogPackage {
  kind: string;
  id: string;
  version: string;
  archive: { name: string; sha256: string };
  [key: string]: unknown;
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function readJson(path: string): Record<string, unknown> {
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Expected a JSON object: ${path}`);
  }
  return value as Record<string, unknown>;
}

/** The runner never overwrites a file owned by the selected app worktree. */
export function validateAppRoot(configured: string): string {
  const appRoot = realpathSync(configured);
  const pkg = readJson(join(appRoot, "package.json"));
  const scripts = pkg.scripts;
  if (scripts === null || typeof scripts !== "object" || Array.isArray(scripts)
    || typeof (scripts as Record<string, unknown>)["agent:test:backend"] !== "string") {
    throw new Error(`Not a Magnis app worktree: ${appRoot}`);
  }
  readJson(join(appRoot, "backend", "package.json"));
  for (const relative of INJECTION_TARGETS) {
    if (existsSync(join(appRoot, relative))) {
      throw new Error(`Telegram performance runner refuses to overwrite ${relative}`);
    }
  }
  return appRoot;
}

function validateOverlay(): void {
  for (const [source] of OVERLAY_FILES) {
    if (!existsSync(join(OVERLAY_ROOT, source))) {
      throw new Error(`Missing catalog-owned acceptance source: ${source}`);
    }
  }
}

function parseOptions(args: readonly string[]): Options {
  let appRoot: string | undefined;
  let databaseUrl: string | undefined;
  let check = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === undefined) throw new Error("Missing argument");
    if (argument === "--check") {
      check = true;
      continue;
    }
    if (argument === "--app-root" || argument === "--database-url") {
      const value = args[index + 1];
      if (value === undefined) throw new Error(`Missing value for ${argument}`);
      if (argument === "--app-root") appRoot = value;
      else databaseUrl = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  if (appRoot === undefined) throw new Error("Pass --app-root <magnis-app-worktree>");
  if (!check && databaseUrl === undefined) {
    throw new Error("Pass --database-url <native-postgresql-server-url>");
  }
  if (databaseUrl !== undefined) {
    const protocol = new URL(databaseUrl).protocol;
    if (protocol !== "postgres:" && protocol !== "postgresql:") {
      throw new Error("--database-url must be a PostgreSQL URL");
    }
  }
  return { appRoot, check, databaseUrl };
}

const GIT_PROCESS_VARIABLES = new Set([
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_COMMON_DIR",
  "GIT_PREFIX",
  "GIT_OBJECT_DIRECTORY",
]);

function catalogEnvironment(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env)
      .filter(([name, value]) => !GIT_PROCESS_VARIABLES.has(name) && value !== undefined),
  ) as Record<string, string>;
}

function commandOutput(command: readonly string[]): string {
  const result = Bun.spawnSync([...command], {
    cwd: CATALOG_ROOT,
    env: catalogEnvironment(),
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) {
    throw new Error(new TextDecoder().decode(result.stderr).trim() || `${command.join(" ")} failed`);
  }
  return new TextDecoder().decode(result.stdout).trim();
}

function buildCatalog(revision: string): void {
  const result = Bun.spawnSync(["bun", "scripts/build-catalog-index.ts"], {
    cwd: CATALOG_ROOT,
    env: { ...catalogEnvironment(), GITHUB_SHA: revision },
    stdout: "inherit",
    stderr: "inherit",
  });
  if (result.exitCode !== 0) throw new Error("Catalog build failed");
}

function telegramPackage(): CatalogPackage {
  const index = readJson(join(CATALOG_ROOT, "catalog", "index.json"));
  const packages = index.packages;
  if (!Array.isArray(packages)) throw new Error("Catalog index has no packages");
  const telegram = packages.find((candidate): candidate is CatalogPackage => {
    return candidate !== null && typeof candidate === "object"
      && (candidate as Record<string, unknown>).kind === "module"
      && (candidate as Record<string, unknown>).id === "telegram";
  });
  if (telegram === undefined) throw new Error("Catalog index has no Telegram module");
  return telegram;
}

function generatedPins(revision: string, moduleSha256: string): Record<string, unknown> {
  const sourceRoot = join(CATALOG_ROOT, "plugins", "sources", "telegram");
  const resolveFrom = createRequire(join(sourceRoot, "package.json")).resolve;
  const installedSdk = dirname(resolveFrom("telegram"));
  const sdkMembers = Object.fromEntries(
    SDK_MEMBERS.map((member) => [member, sha256(join(installedSdk, member))]),
  );
  return {
    catalogCommit: revision,
    sdkPatchSha256: sha256(join(CATALOG_ROOT, "patches", "telegram@2.26.22.patch")),
    sdkMembers,
    telegramModuleSha256: moduleSha256,
    scope: "Real Source imports and SDK; OS process isolation, package certification and authentication ceremony are not exercised.",
  };
}

function inject(appRoot: string, revision: string): readonly string[] {
  const telegram = telegramPackage();
  const archive = join(CATALOG_ROOT, "catalog", telegram.archive.name);
  if (sha256(archive) !== telegram.archive.sha256) {
    throw new Error("Built Telegram module does not match the catalog index");
  }
  const fixtureRoot = join(appRoot, "backend", "test", "fixtures", "telegram-fast-sync");
  const unicodeRoot = join(appRoot, "test-e2e", "fixtures", "telegram-unicode");
  mkdirSync(fixtureRoot, { recursive: false });
  mkdirSync(unicodeRoot, { recursive: false });
  const injected: string[] = [];
  try {
    for (const [source, destination] of OVERLAY_FILES) {
      const target = join(appRoot, destination);
      copyFileSync(join(OVERLAY_ROOT, source), target);
      injected.push(target);
    }
    const pinsTarget = join(appRoot, GENERATED_FILES[0]);
    writeFileSync(pinsTarget, `${JSON.stringify(generatedPins(revision, telegram.archive.sha256), null, 2)}\n`);
    injected.push(pinsTarget);
    const archiveTarget = join(appRoot, GENERATED_FILES[1]);
    copyFileSync(archive, archiveTarget);
    injected.push(archiveTarget);
    const packageTarget = join(appRoot, GENERATED_FILES[2]);
    writeFileSync(packageTarget, `${JSON.stringify({
      ...telegram,
      archive: { ...telegram.archive, bytes: statSync(archive).size },
    }, null, 2)}\n`);
    injected.push(packageTarget);
    return injected;
  } catch (error) {
    cleanup(injected, fixtureRoot, unicodeRoot);
    throw error;
  }
}

function cleanup(injected: readonly string[], fixtureRoot: string, unicodeRoot: string): void {
  for (const path of [...injected].reverse()) rmSync(path, { force: true });
  if (existsSync(fixtureRoot)) rmdirSync(fixtureRoot);
  if (existsSync(unicodeRoot)) rmdirSync(unicodeRoot);
}

async function run(options: Options): Promise<void> {
  validateOverlay();
  const appRoot = validateAppRoot(options.appRoot);
  if (options.check) {
    console.log(`telegram-performance: app boundary is ready: ${appRoot}`);
    return;
  }
  if (options.databaseUrl === undefined) throw new Error("Missing validated database URL");
  const revision = commandOutput(["git", "rev-parse", "HEAD"]);
  buildCatalog(revision);
  const fixtureRoot = join(appRoot, "backend", "test", "fixtures", "telegram-fast-sync");
  const unicodeRoot = join(appRoot, "test-e2e", "fixtures", "telegram-unicode");
  const injected = inject(appRoot, revision);
  try {
    const child = Bun.spawn([
      "bun",
      "run",
      "agent:test:backend",
      "--",
      "test/tst_src_int_telegram_sync_001.test.ts",
      "test/tst_src_int_telegram_graph_001.test.ts",
    ], {
      cwd: appRoot,
      env: {
        ...process.env,
        MAGNIS_SYNC_TEST_DATABASE_URL: options.databaseUrl,
        MAGNIS_TELEGRAM_SOURCE_ROOT: CATALOG_ROOT,
      },
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });
    const exitCode = await child.exited;
    if (exitCode !== 0) throw new Error(`Telegram performance stand failed with exit code ${String(exitCode)}`);
  } finally {
    cleanup(injected, fixtureRoot, unicodeRoot);
  }
}

if (import.meta.main) {
  await run(parseOptions(process.argv.slice(2)));
}
