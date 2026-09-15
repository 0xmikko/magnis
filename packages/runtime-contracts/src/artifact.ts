export const RUNTIME_ARTIFACT_SCHEMA_VERSION = 1;
export const RUNTIME_PROTOCOL_VERSION = "magnis-runtime/v1";
export const RUNTIME_RELEASE_REPOSITORY = "0xmikko/magnis";

export const RUNTIME_TARGETS = [
  "x86_64-unknown-linux-gnu",
  "aarch64-unknown-linux-gnu",
  "x86_64-apple-darwin",
  "aarch64-apple-darwin",
] as const;

export type RuntimeTarget = (typeof RUNTIME_TARGETS)[number];

export interface RuntimeArtifactRef {
  readonly runtimeVersion: string;
  readonly protocolVersion: typeof RUNTIME_PROTOCOL_VERSION;
  readonly target: RuntimeTarget;
  readonly url: string;
  readonly sha256: string;
}

export interface RuntimeArtifactManifest {
  readonly schemaVersion: typeof RUNTIME_ARTIFACT_SCHEMA_VERSION;
  readonly runtimeVersion: string;
  readonly protocolVersion: typeof RUNTIME_PROTOCOL_VERSION;
  readonly target: RuntimeTarget;
  readonly executable: string;
  readonly runtimeRoot: "runtime";
  readonly webRoot: "runtime/web";
  readonly migrationsDigest: string;
  readonly files: Readonly<Record<string, string>>;
}

export interface RuntimeArtifactIdentity {
  readonly runtimeVersion: string;
  readonly protocolVersion: typeof RUNTIME_PROTOCOL_VERSION;
  readonly target: RuntimeTarget;
}

export class RuntimeArtifactContractError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "RuntimeArtifactContractError";
  }
}

const RUNTIME_VERSION_PATTERN = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

export function runtimeReleaseTag(runtimeVersion: string): string {
  assertRuntimeVersion(runtimeVersion, "runtimeVersion");
  return `runtime-v${runtimeVersion}`;
}

export function runtimeArchiveName(runtimeVersion: string, target: RuntimeTarget): string {
  assertRuntimeVersion(runtimeVersion, "runtimeVersion");
  return `magnis-runtime-v${runtimeVersion}-${target}.tar.gz`;
}

export function runtimeReferenceName(runtimeVersion: string, target: RuntimeTarget): string {
  assertRuntimeVersion(runtimeVersion, "runtimeVersion");
  return `magnis-runtime-v${runtimeVersion}-${target}.ref.json`;
}

export function runtimeArtifactUrl(runtimeVersion: string, target: RuntimeTarget): string {
  const releaseTag = runtimeReleaseTag(runtimeVersion);
  const archiveName = runtimeArchiveName(runtimeVersion, target);
  return `https://github.com/${RUNTIME_RELEASE_REPOSITORY}/releases/download/${releaseTag}/${archiveName}`;
}

export function runtimeReferenceUrl(runtimeVersion: string, target: RuntimeTarget): string {
  const releaseTag = runtimeReleaseTag(runtimeVersion);
  const referenceName = runtimeReferenceName(runtimeVersion, target);
  return `https://github.com/${RUNTIME_RELEASE_REPOSITORY}/releases/download/${releaseTag}/${referenceName}`;
}

export function parseRuntimeArtifactRef(value: unknown): RuntimeArtifactRef {
  const object = requireObject(value, "runtime artifact ref");
  assertExactKeys(object, ["runtimeVersion", "protocolVersion", "target", "url", "sha256"], "runtime artifact ref");

  const runtimeVersion = requireString(object.runtimeVersion, "runtime artifact ref.runtimeVersion");
  assertRuntimeVersion(runtimeVersion, "runtime artifact ref.runtimeVersion");
  const protocolVersion = parseProtocolVersion(object.protocolVersion, "runtime artifact ref.protocolVersion");
  const target = parseRuntimeTarget(object.target, "runtime artifact ref.target");
  const url = requireString(object.url, "runtime artifact ref.url");
  const sha256 = parseSha256(object.sha256, "runtime artifact ref.sha256");
  const expectedUrl = runtimeArtifactUrl(runtimeVersion, target);

  if (url !== expectedUrl) {
    throw new RuntimeArtifactContractError(
      `runtime artifact ref.url must be the immutable release asset '${expectedUrl}'`,
    );
  }

  return { runtimeVersion, protocolVersion, target, url, sha256 };
}

export function parseRuntimeArtifactManifest(value: unknown): RuntimeArtifactManifest {
  const object = requireObject(value, "runtime artifact manifest");
  assertExactKeys(
    object,
    [
      "schemaVersion",
      "runtimeVersion",
      "protocolVersion",
      "target",
      "executable",
      "runtimeRoot",
      "webRoot",
      "migrationsDigest",
      "files",
    ],
    "runtime artifact manifest",
  );

  if (object.schemaVersion !== RUNTIME_ARTIFACT_SCHEMA_VERSION) {
    throw new RuntimeArtifactContractError(
      "runtime artifact manifest.schemaVersion must be 1",
    );
  }

  const runtimeVersion = requireString(object.runtimeVersion, "runtime artifact manifest.runtimeVersion");
  assertRuntimeVersion(runtimeVersion, "runtime artifact manifest.runtimeVersion");
  const protocolVersion = parseProtocolVersion(object.protocolVersion, "runtime artifact manifest.protocolVersion");
  const target = parseRuntimeTarget(object.target, "runtime artifact manifest.target");
  const executable = requireString(object.executable, "runtime artifact manifest.executable");
  const runtimeRoot = requireString(object.runtimeRoot, "runtime artifact manifest.runtimeRoot");
  const webRoot = requireString(object.webRoot, "runtime artifact manifest.webRoot");
  const migrationsDigest = parseSha256(object.migrationsDigest, "runtime artifact manifest.migrationsDigest");
  const files = parseFileDigests(object.files);

  const expectedExecutable = `bin/magnis-server-${target}`;
  if (executable !== expectedExecutable) {
    throw new RuntimeArtifactContractError(
      `runtime artifact manifest.executable must be '${expectedExecutable}' for target '${target}'`,
    );
  }
  if (runtimeRoot !== "runtime") {
    throw new RuntimeArtifactContractError("runtime artifact manifest.runtimeRoot must be 'runtime'");
  }
  if (webRoot !== "runtime/web") {
    throw new RuntimeArtifactContractError("runtime artifact manifest.webRoot must be 'runtime/web'");
  }
  if (!Object.hasOwn(files, executable)) {
    throw new RuntimeArtifactContractError("runtime artifact manifest.files must declare the executable digest");
  }
  if (!Object.keys(files).some((path) => path.startsWith(`${webRoot}/`))) {
    throw new RuntimeArtifactContractError("runtime artifact manifest.files must declare a compiled web asset");
  }

  return {
    schemaVersion: RUNTIME_ARTIFACT_SCHEMA_VERSION,
    runtimeVersion,
    protocolVersion,
    target,
    executable,
    runtimeRoot,
    webRoot,
    migrationsDigest,
    files,
  };
}

export function validateRuntimeArtifactCompatibility(
  ref: RuntimeArtifactRef,
  manifest: RuntimeArtifactManifest,
): RuntimeArtifactIdentity {
  if (ref.runtimeVersion !== manifest.runtimeVersion) {
    throw new RuntimeArtifactContractError("runtime artifact runtimeVersion does not match the selected ref");
  }
  if (ref.target !== manifest.target) {
    throw new RuntimeArtifactContractError("runtime artifact target does not match the selected ref");
  }

  return {
    runtimeVersion: ref.runtimeVersion,
    protocolVersion: ref.protocolVersion,
    target: ref.target,
  };
}

function requireObject(value: unknown, subject: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new RuntimeArtifactContractError(`${subject} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

function assertExactKeys(object: Record<string, unknown>, expected: readonly string[], subject: string): void {
  const expectedKeys = new Set(expected);
  const actualKeys = Object.keys(object);
  const missing = expected.filter((key) => !Object.hasOwn(object, key));
  const unexpected = actualKeys.filter((key) => !expectedKeys.has(key));

  if (missing.length > 0 || unexpected.length > 0) {
    throw new RuntimeArtifactContractError(
      `${subject} keys are invalid: missing [${missing.join(", ")}], unexpected [${unexpected.join(", ")}]`,
    );
  }
}

function requireString(value: unknown, subject: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new RuntimeArtifactContractError(`${subject} must be a non-empty string`);
  }
  return value;
}

function assertRuntimeVersion(value: string, subject: string): void {
  if (!RUNTIME_VERSION_PATTERN.test(value)) {
    throw new RuntimeArtifactContractError(`${subject} must be a semantic version without build metadata`);
  }
}

function parseProtocolVersion(value: unknown, subject: string): typeof RUNTIME_PROTOCOL_VERSION {
  if (value !== RUNTIME_PROTOCOL_VERSION) {
    throw new RuntimeArtifactContractError(`${subject} must be '${RUNTIME_PROTOCOL_VERSION}'`);
  }
  return RUNTIME_PROTOCOL_VERSION;
}

function parseRuntimeTarget(value: unknown, subject: string): RuntimeTarget {
  if (typeof value !== "string" || !RUNTIME_TARGETS.includes(value as RuntimeTarget)) {
    throw new RuntimeArtifactContractError(`${subject} must be one of: ${RUNTIME_TARGETS.join(", ")}`);
  }
  return value as RuntimeTarget;
}

function parseSha256(value: unknown, subject: string): string {
  const sha256 = requireString(value, subject);
  if (!SHA256_PATTERN.test(sha256)) {
    throw new RuntimeArtifactContractError(`${subject} must be a lowercase SHA-256 digest`);
  }
  return sha256;
}

function parseFileDigests(value: unknown): Record<string, string> {
  const object = requireObject(value, "runtime artifact manifest.files");
  const entries = Object.entries(object);
  if (entries.length === 0) {
    throw new RuntimeArtifactContractError("runtime artifact manifest.files must not be empty");
  }

  const files: Record<string, string> = {};
  for (const [path, digest] of entries) {
    assertSafeArtifactPath(path);
    files[path] = parseSha256(digest, `runtime artifact manifest.files['${path}']`);
  }
  return files;
}

function assertSafeArtifactPath(path: string): void {
  const segments = path.split("/");
  if (
    path.startsWith("/") ||
    path.includes("\\") ||
    segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")
  ) {
    throw new RuntimeArtifactContractError(`unsafe artifact path '${path}'`);
  }
}
