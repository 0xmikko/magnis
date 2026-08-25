import { createHash } from "node:crypto";
import { lstat, mkdir, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  parseRuntimeArtifactRef,
  RUNTIME_TARGETS,
  runtimeArchiveName,
  runtimeReferenceName,
  runtimeReferenceUrl,
  type RuntimeArtifactRef,
  type RuntimeTarget,
} from "../../../packages/runtime-contracts/src/artifact";

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

export interface RuntimeDownloadInput {
  readonly runtimeVersion: string;
  readonly target: RuntimeTarget;
  readonly expectedSha256: string;
  readonly outputDirectory: string;
  readonly fetch?: typeof fetch;
}

export interface DownloadedRuntime {
  readonly reference: RuntimeArtifactRef;
  readonly referencePath: string;
  readonly archivePath: string;
}

/**
 * Acquires one explicit release input for a public desktop candidate build.
 * The reference URL is derived from the public immutable naming contract, its
 * bytes must equal the supplied SHA-256 intent, and the archive then must
 * equal that reference. An absent release or any mismatch is an error; this
 * never searches a cache, release channel, or private checkout.
 *
 * @tested-by tst_desktop_runtime_download_001
 */
export async function downloadRuntime(input: RuntimeDownloadInput): Promise<DownloadedRuntime> {
  assertSha256(input.expectedSha256, "expected runtime SHA-256");
  const outputDirectory = resolve(input.outputDirectory);
  await ensureEmptyDirectory(outputDirectory);

  const fetchImpl = input.fetch ?? fetch;
  const referenceUrl = runtimeReferenceUrl(input.runtimeVersion, input.target);
  const referenceText = await downloadText(fetchImpl, referenceUrl, "runtime reference");
  const reference = parseRuntimeArtifactRef(parseJson(referenceText, "runtime reference"));
  if (reference.runtimeVersion !== input.runtimeVersion || reference.target !== input.target) {
    throw new Error("runtime reference does not match the requested version and target");
  }
  if (reference.sha256 !== input.expectedSha256) {
    throw new Error("runtime reference SHA-256 does not match the explicit candidate input");
  }

  const archive = await downloadBytes(fetchImpl, reference.url, "runtime archive");
  if (sha256(archive) !== reference.sha256) {
    throw new Error("runtime archive SHA-256 does not match the selected runtime reference");
  }

  const referencePath = join(outputDirectory, runtimeReferenceName(reference.runtimeVersion, reference.target));
  const archivePath = join(outputDirectory, runtimeArchiveName(reference.runtimeVersion, reference.target));
  await Promise.all([
    writeFile(referencePath, referenceText, { mode: 0o644 }),
    writeFile(archivePath, archive, { mode: 0o644 }),
  ]);
  return { reference, referencePath, archivePath };
}

async function main(): Promise<void> {
  const input = parseCommandLine(Bun.argv.slice(2));
  const result = await downloadRuntime(input);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function parseCommandLine(args: readonly string[]): Omit<RuntimeDownloadInput, "fetch"> {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (
      flag === undefined ||
      value === undefined ||
      !["--version", "--target", "--sha256", "--out-dir"].includes(flag) ||
      values.has(flag)
    ) {
      throw new Error("usage: bun download-runtime.ts --version <semver> --target <triple> --sha256 <digest> --out-dir <directory>");
    }
    values.set(flag, value);
  }
  const runtimeVersion = values.get("--version");
  const target = values.get("--target");
  const expectedSha256 = values.get("--sha256");
  const outputDirectory = values.get("--out-dir");
  if (runtimeVersion === undefined || target === undefined || expectedSha256 === undefined || outputDirectory === undefined) {
    throw new Error("runtime download requires version, target, SHA-256 and output directory");
  }
  if (!isRuntimeTarget(target)) {
    throw new Error(`runtime download target '${target}' is not supported`);
  }
  return { runtimeVersion, target, expectedSha256, outputDirectory };
}

async function ensureEmptyDirectory(path: string): Promise<void> {
  try {
    const status = await lstat(path);
    if (!status.isDirectory() || status.isSymbolicLink()) {
      throw new Error(`runtime download output must be a real directory: ${path}`);
    }
    if ((await readdir(path)).length > 0) {
      throw new Error(`runtime download output must be empty: ${path}`);
    }
  } catch (error: unknown) {
    if (!isMissingPath(error)) throw error;
    await mkdir(path, { recursive: true });
  }
}

async function downloadText(fetchImpl: typeof fetch, url: string, subject: string): Promise<string> {
  return new TextDecoder().decode(await downloadBytes(fetchImpl, url, subject));
}

async function downloadBytes(fetchImpl: typeof fetch, url: string, subject: string): Promise<Uint8Array> {
  let response: Response;
  try {
    response = await fetchImpl(url);
  } catch (error: unknown) {
    throw new Error(`failed to download ${subject} from '${url}'`, { cause: error });
  }
  if (!response.ok) {
    throw new Error(`failed to download ${subject} from '${url}': HTTP ${String(response.status)}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

function parseJson(text: string, subject: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error: unknown) {
    throw new Error(`${subject} is not valid JSON`, { cause: error });
  }
}

function assertSha256(value: string, subject: string): void {
  if (!SHA256_PATTERN.test(value)) {
    throw new Error(`${subject} must be a lowercase SHA-256 digest`);
  }
}

function isRuntimeTarget(value: string): value is RuntimeTarget {
  return RUNTIME_TARGETS.includes(value as RuntimeTarget);
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function isMissingPath(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

if (import.meta.main) {
  await main();
}
