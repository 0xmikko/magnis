import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import {
  parseRuntimeArtifactManifest,
  parseRuntimeArtifactRef,
  runtimeArchiveName,
  validateRuntimeArtifactCompatibility,
  type RuntimeArtifactIdentity,
  type RuntimeArtifactManifest,
  type RuntimeTarget,
} from "../../../packages/runtime-contracts/src/artifact";

const MANIFEST_PATH = "manifest.json";

export interface RuntimeStageInput {
  readonly archivePath: string;
  readonly referencePath: string;
  readonly target: RuntimeTarget;
  readonly outputDirectory: string;
}

/**
 * Verifies and stages one caller-selected public runtime archive for Tauri.
 * The destination changes only after its archive, reference, manifest and
 * every declared payload digest agree. No private checkout or ambient binary
 * is ever consulted.
 *
 * @tested-by tst_desktop_runtime_stage_001
 * @tested-by tst_desktop_runtime_stage_002
 */
export async function stageRuntime(input: RuntimeStageInput): Promise<RuntimeArtifactIdentity> {
  const archivePath = resolve(input.archivePath);
  const referencePath = resolve(input.referencePath);
  const outputDirectory = resolve(input.outputDirectory);
  await assertRegularFile(archivePath, "runtime archive");
  await assertRegularFile(referencePath, "runtime reference");

  const reference = parseRuntimeArtifactRef(parseJson(await readFile(referencePath, "utf8"), "runtime reference"));
  if (reference.target !== input.target) {
    throw new Error(`runtime reference target '${reference.target}' does not match requested target '${input.target}'`);
  }
  if (archivePath !== join(dirname(archivePath), runtimeArchiveName(reference.runtimeVersion, reference.target))) {
    throw new Error(`runtime archive must use its canonical filename '${runtimeArchiveName(reference.runtimeVersion, reference.target)}'`);
  }
  if (sha256(await readFile(archivePath)) !== reference.sha256) {
    throw new Error("runtime archive SHA-256 does not match the selected runtime reference");
  }

  const archiveEntries = await listArchiveEntries(archivePath);
  assertSafeArchiveEntries(archiveEntries);
  const manifest = parseRuntimeArtifactManifest(parseJson(
    await tarOutput(["-xOzf", archivePath, MANIFEST_PATH]),
    "runtime manifest",
  ));
  const identity = validateRuntimeArtifactCompatibility(reference, manifest);
  assertRuntimePayload(manifest, archiveEntries);

  await mkdir(dirname(outputDirectory), { recursive: true });
  const stagingDirectory = await mkdtemp(join(dirname(outputDirectory), ".magnis-runtime-stage-"));
  let moved = false;
  try {
    await runTar(["-xzf", archivePath, "-C", stagingDirectory]);
    await assertExtractedPayload(stagingDirectory, manifest);
    await replaceOutputDirectory(stagingDirectory, outputDirectory);
    moved = true;
    return identity;
  } finally {
    if (!moved) {
      await rm(stagingDirectory, { recursive: true, force: true });
    }
  }
}

async function main(): Promise<void> {
  const archivePath = requiredEnvironmentPath("MAGNIS_RUNTIME_ARCHIVE");
  const referencePath = requiredEnvironmentPath("MAGNIS_RUNTIME_REF");
  const target = requiredEnvironmentTarget("MAGNIS_RUNTIME_TARGET");
  const identity = await stageRuntime({
    archivePath,
    referencePath,
    target,
    outputDirectory: join(import.meta.dir, "../src-tauri/binaries"),
  });
  process.stdout.write(`staged Magnis runtime ${identity.runtimeVersion} (${identity.target})\n`);
}

function requiredEnvironmentPath(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} must name the exact runtime input`);
  }
  return value;
}

function requiredEnvironmentTarget(name: string): RuntimeTarget {
  const value = requiredEnvironmentPath(name);
  const known: readonly RuntimeTarget[] = [
    "x86_64-unknown-linux-gnu",
    "aarch64-unknown-linux-gnu",
    "x86_64-apple-darwin",
    "aarch64-apple-darwin",
  ];
  if (!known.includes(value as RuntimeTarget)) {
    throw new Error(`${name} must name a supported Magnis runtime target`);
  }
  return value as RuntimeTarget;
}

async function assertRegularFile(path: string, subject: string): Promise<void> {
  const status = await lstat(path);
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error(`${subject} must be a regular file: ${path}`);
  }
}

async function listArchiveEntries(archivePath: string): Promise<readonly string[]> {
  const listing = await tarOutput(["-tzf", archivePath]);
  const entries = listing.split("\n").filter((entry) => entry.length > 0);
  if (entries.length === 0) {
    throw new Error("runtime archive must not be empty");
  }
  return entries;
}

function assertSafeArchiveEntries(entries: readonly string[]): void {
  for (const entry of entries) {
    const path = entry.endsWith("/") ? entry.slice(0, -1) : entry;
    if (path.length === 0) continue;
    assertSafeArtifactPath(path);
  }
}

function assertRuntimePayload(manifest: RuntimeArtifactManifest, entries: readonly string[]): void {
  const archiveFiles = entries.filter((entry) => !entry.endsWith("/")).sort();
  const expectedFiles = [MANIFEST_PATH, ...Object.keys(manifest.files)].sort();
  if (archiveFiles.length !== expectedFiles.length || archiveFiles.some((path, index) => path !== expectedFiles[index])) {
    throw new Error("runtime archive files do not exactly match its manifest");
  }
  for (const prefix of ["runtime/data/", "runtime/migrations/", "runtime/web/"]) {
    if (!Object.keys(manifest.files).some((path) => path.startsWith(prefix))) {
      throw new Error(`runtime manifest must declare payload below '${prefix}'`);
    }
  }
}

async function assertExtractedPayload(directory: string, manifest: RuntimeArtifactManifest): Promise<void> {
  const files = await collectRegularFiles(directory);
  const expectedPaths = Object.keys(manifest.files).sort();
  const actualPaths = [...files.keys()].sort();
  if (actualPaths.length !== expectedPaths.length || actualPaths.some((path, index) => path !== expectedPaths[index])) {
    throw new Error("extracted runtime files do not exactly match its manifest");
  }
  for (const path of expectedPaths) {
    const digest = files.get(path);
    if (digest !== manifest.files[path]) {
      throw new Error(`runtime file SHA-256 does not match manifest: ${path}`);
    }
  }
}

async function collectRegularFiles(root: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  await collectRegularFilesAt(root, root, files);
  return files;
}

async function collectRegularFilesAt(root: string, directory: string, files: Map<string, string>): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectRegularFilesAt(root, path, files);
      continue;
    }
    if (!entry.isFile() || entry.isSymbolicLink()) {
      throw new Error(`runtime archive must not extract links or special files: ${path}`);
    }
    const artifactPath = relative(root, path).split(sep).join("/");
    assertSafeArtifactPath(artifactPath);
    if (artifactPath === MANIFEST_PATH) continue;
    files.set(artifactPath, sha256(await readFile(path)));
  }
}

async function replaceOutputDirectory(stagingDirectory: string, outputDirectory: string): Promise<void> {
  try {
    const existing = await lstat(outputDirectory);
    if (!existing.isDirectory() || existing.isSymbolicLink()) {
      throw new Error(`runtime staging destination must be a real directory when it exists: ${outputDirectory}`);
    }
    await rm(outputDirectory, { recursive: true, force: false });
  } catch (error: unknown) {
    if (!isMissingPath(error)) throw error;
  }
  await rename(stagingDirectory, outputDirectory);
}

async function tarOutput(args: readonly string[]): Promise<string> {
  const child = Bun.spawn(["tar", ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`runtime archive command failed: tar ${args.join(" ")}\n${stderr}`);
  }
  return stdout;
}

async function runTar(args: readonly string[]): Promise<void> {
  await tarOutput(args);
}

function parseJson(text: string, subject: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error: unknown) {
    throw new Error(`${subject} is not valid JSON`, { cause: error });
  }
}

function assertSafeArtifactPath(path: string): void {
  const segments = path.split("/");
  if (
    path.startsWith("/") ||
    path.includes("\\") ||
    segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")
  ) {
    throw new Error(`runtime archive has unsafe path '${path}'`);
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function isMissingPath(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

if (import.meta.main) {
  await main();
}
