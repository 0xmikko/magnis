#!/usr/bin/env bun

import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";

import { parse as parseToml } from "smol-toml";

import type { SourceCertificationReceipt } from "../packages/connector-sdk/contract/source";
import { collectSourceHostEvidence } from "../packages/testkit/host-driver";

import {
  accountCompatibilityHash,
  certificationReference,
  decodeSourceCertificationReceipt,
  encodeSourceCertificationReceipt,
  v1ReceiverInterfaceHash,
} from "../packages/testkit/receipt";
import type {
  SourceAccountCompatibilityInput,
} from "../packages/testkit/receipt";

type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type CatalogPackageKind = "module" | "source";

export interface SourceCertificationDeclaration {
  disposition: "admissible";
  protocol: "magnis.source/1";
  authority: "module_sync" | "tools_only";
  releaseTier: "production" | "development_fixture";
  delivery: "poll" | "push" | "none";
  pollIntervalSecs: number | null;
  serverInfoName: string;
  serverInfoVersion: string;
  runtimeKind: "connector_sdk" | "custom" | "external_wrapped";
  runtimeVersion: string;
  advertisedTools: readonly string[];
  callableOperations: readonly string[];
  scenarioIds: readonly string[];
  accountCompatibility: {
    hash: string;
    migratesFrom: readonly string[];
    input: SourceAccountCompatibilityInput;
  };
}

export interface AdmissibleSourceReleaseManifest {
  disposition: "admissible";
  id: string;
  root: string;
  manifestPath: string;
  manifest: Record<string, unknown>;
  declaration: SourceCertificationDeclaration;
}

export interface InadmissibleSourceReleaseManifest {
  disposition: "inadmissible";
  id: string;
  root: string;
  manifestPath: string;
  manifest: Record<string, unknown>;
  reason: string;
}

export type SourceReleaseManifest =
  | AdmissibleSourceReleaseManifest
  | InadmissibleSourceReleaseManifest;

export interface StagedCatalogPackage {
  kind: CatalogPackageKind;
  id: string;
  version: string;
  title: string;
  summary: string;
  publisher: string;
  dev: boolean;
  files: readonly { path: string; sha256: string }[];
  root: string;
  packageHash: string;
  definitionHash: string;
  certification: SourceCertificationDeclaration | null;
}

interface LegacyCatalogPackage {
  kind: CatalogPackageKind;
  id: string;
  version: string;
  title: string;
  summary: string;
  publisher: string;
  dev: boolean;
  files: readonly { path: string; sha256: string }[];
}

interface StrictSourceCatalogPackage extends LegacyCatalogPackage {
  package_hash: string;
  certification: {
    path: string;
    sha256: string;
  };
}

interface CatalogIndexV1 {
  schema_version: 1;
  generated_from: string;
  packages: readonly LegacyCatalogPackage[];
}

interface CatalogIndexV2 {
  schema_version: 2;
  generated_from: string;
  packages: readonly (LegacyCatalogPackage | StrictSourceCatalogPackage)[];
}

export interface WriteCertifiedCatalogIndexesOptions {
  catalogOut: string;
  generatedFrom: string;
  receiptInputDir: string;
  discovered?: readonly StagedCatalogPackage[];
}

export interface CertifiedCatalogResult {
  discovered: readonly StagedCatalogPackage[];
  indexV1: CatalogIndexV1;
  indexV2: CatalogIndexV2;
}

const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const SOURCE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function prefixedSha256(value: Buffer | string): string {
  return `sha256:${sha256(value)}`;
}

function requiredRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredString(record: Record<string, unknown>, key: string, label: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label}.${key} must be a non-empty string`);
  }
  return value;
}

function optionalString(record: Record<string, unknown>, key: string, fallback: string): string {
  const value = record[key];
  if (value === undefined) return fallback;
  if (typeof value !== "string") throw new Error(`manifest.${key} must be a string`);
  return value;
}

function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    const entries = value as readonly JsonValue[];
    return `[${entries.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  const record = value as Readonly<Record<string, JsonValue>>;
  return `{${Object.keys(record)
    .sort((left, right) => Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")))
    .map((key) => {
      const entry = record[key];
      if (entry === undefined) throw new Error(`manifest value '${key}' is undefined`);
      return `${JSON.stringify(key)}:${canonicalJson(entry)}`;
    })
    .join(",")}}`;
}

function toJsonValue(value: unknown, label: string): JsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) => toJsonValue(entry, `${label}[${String(index)}]`));
  }
  if (isRecord(value)) {
    const out: Record<string, JsonValue> = {};
    for (const key of Object.keys(value).sort()) {
      const entry = value[key];
      if (entry === undefined) throw new Error(`${label}.${key} is undefined`);
      out[key] = toJsonValue(entry, `${label}.${key}`);
    }
    return out;
  }
  throw new Error(`${label} contains a non-JSON value`);
}

function sortedFiles(root: string): string[] {
  const files: string[] = [];
  const collect = (current: string): void => {
    const entries = readdirSync(current, { withFileTypes: true }).sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
    );
    for (const entry of entries) {
      const path = join(current, entry.name);
      const metadata = lstatSync(path);
      if (metadata.isSymbolicLink()) throw new Error(`symlink in staged package: ${path}`);
      if (metadata.isDirectory()) collect(path);
      else if (metadata.isFile()) files.push(path);
      else throw new Error(`unsupported staged package entry: ${path}`);
    }
  };
  collect(root);
  return files;
}

/** Hash a staged package byte-for-byte with the app host's `hashTree` algebra.
 * Receipt output is deliberately outside this tree, so the hash cannot refer
 * to itself.
 *
 * @tested-by: tst_cat_src_cert_001
 * @invariant: certification binds the exact bytes the host later installs.
 */
export function hashStagedPackage(root: string): string {
  const files = sortedFiles(root).map((path): readonly [string, string] => [
    relative(root, path).replaceAll("\\", "/"),
    sha256(readFileSync(path)),
  ]);
  return prefixedSha256(JSON.stringify(files));
}

function sourceDatasetActions(
  root: string,
  sourceId: string,
  manifest: Record<string, unknown>,
): readonly { name: string; request_schema: JsonValue }[] {
  const dataset = manifest.dataset;
  if (dataset === undefined) return [];
  if (!isRecord(dataset)) throw new Error(`source '${sourceId}' dataset must be a table`);
  const actions = dataset.actions;
  if (actions === undefined) return [];
  if (!Array.isArray(actions)) throw new Error(`source '${sourceId}' dataset.actions must be an array`);
  return actions.map((action, index) => {
    if (!isRecord(action)) {
      throw new Error(`source '${sourceId}' dataset.actions[${String(index)}] must be a table`);
    }
    const name = requiredString(action, "name", `source '${sourceId}' dataset.actions[${String(index)}]`);
    const schema = requiredString(action, "schema", `source '${sourceId}' dataset.actions[${String(index)}]`);
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(join(root, ...schema.split("/")), "utf8")) as unknown;
    } catch (error: unknown) {
      throw new Error(`source '${sourceId}' cannot read dataset schema '${schema}'`, { cause: error });
    }
    return { name, request_schema: toJsonValue(parsed, `source '${sourceId}' dataset schema '${schema}'`) };
  }).sort((left, right) => left.name.localeCompare(right.name));
}

/** The app's exact `sourceManifestContract` projection. Certification metadata,
 * cards, auth and spawn policy deliberately do not affect definition identity;
 * referenced dataset request schemas do.
 *
 * @tested-by: tst_cat_src_cert_001
 * @invariant: catalog definitionHash is byte-identical to app admission.
 */
export function sourceDefinitionHash(
  root: string,
  sourceId: string,
  manifest: Record<string, unknown>,
): string {
  const surfaces = unorderedStrings(manifest.surfaces, `source '${sourceId}' surfaces`);
  const dataset = manifest.dataset;
  let exportSettings: readonly string[] = [];
  if (dataset !== undefined) {
    if (!isRecord(dataset)) throw new Error(`source '${sourceId}' dataset must be a table`);
    const authored = dataset.export_settings;
    if (authored !== undefined) {
      exportSettings = unorderedStrings(authored, `source '${sourceId}' dataset.export_settings`);
    }
  }
  const contract: JsonValue = {
    id: requiredString(manifest, "id", `source '${sourceId}' manifest`),
    version: requiredString(manifest, "version", `source '${sourceId}' manifest`),
    manifest_format: 3,
    magnis_api_version: "0.1.0",
    surfaces: [...new Set(surfaces)].sort(),
    export_settings: [...exportSettings].sort(),
    actions: sourceDatasetActions(root, sourceId, manifest),
  };
  return prefixedSha256(canonicalJson(contract));
}

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`${label} must be ${allowed.join(" or ")}`);
  }
  return value as T;
}

function sortedStrings(
  value: unknown,
  label: string,
  allowEmpty: boolean,
): readonly string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry === "")) {
    throw new Error(`${label} must be an array of non-empty strings`);
  }
  const strings = value as string[];
  if (!allowEmpty && strings.length === 0) throw new Error(`${label} must not be empty`);
  if (new Set(strings).size !== strings.length) throw new Error(`${label} must not contain duplicates`);
  for (let index = 1; index < strings.length; index += 1) {
    const previous = strings[index - 1];
    const current = strings[index];
    if (previous === undefined || current === undefined || current < previous) {
      throw new Error(`${label} must be sorted`);
    }
  }
  return strings;
}

function unorderedStrings(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry === "")) {
    throw new Error(`${label} must be an array of non-empty strings`);
  }
  return value as readonly string[];
}

function decodeAccountCompatibility(
  sourceId: string,
  raw: Record<string, unknown>,
): SourceCertificationDeclaration["accountCompatibility"] {
  const account = raw.account_compatibility;
  if (!isRecord(account)) {
    throw new Error(`source '${sourceId}' has no certification.account_compatibility declaration`);
  }
  const authValue = oneOf(
    account.auth,
    ["none", "api_key", "oauth2", "phone_code", "shared_provider"] as const,
    `source '${sourceId}' certification.account_compatibility.auth`,
  );
  const surfacesRaw = account.surfaces;
  if (!Array.isArray(surfacesRaw) || surfacesRaw.length === 0) {
    throw new Error(`source '${sourceId}' certification.account_compatibility.surfaces must not be empty`);
  }
  const surfaces = surfacesRaw.map((surface, index) => {
    const label = `source '${sourceId}' certification.account_compatibility.surfaces[${String(index)}]`;
    if (!isRecord(surface)) {
      throw new Error(
        `source '${sourceId}' certification.account_compatibility.surfaces[${String(index)}] must be a table`,
      );
    }
    const receiverInterfaceHash = requiredString(
      surface,
      "receiver_interface_hash",
      `source '${sourceId}' certification.account_compatibility.surfaces[${String(index)}]`,
    );
    if (!HASH_PATTERN.test(receiverInterfaceHash)) {
      throw new Error(
        `source '${sourceId}' certification.account_compatibility.surfaces[${String(index)}].receiver_interface_hash must be a canonical sha256 hash`,
      );
    }
    const name = requiredString(
      surface,
      "name",
      `source '${sourceId}' certification.account_compatibility.surfaces[${String(index)}]`,
    );
    if (receiverInterfaceHash !== v1ReceiverInterfaceHash(name)) {
      throw new Error(`${label}.receiver_interface_hash does not match the canonical v1 receiver contract`);
    }
    const progress = surface.progress;
    if (!isRecord(progress)) {
      throw new Error(`${label}.progress must be a table`);
    }
    return {
      name,
      cursorTerminalNull: oneOf(
        surface.cursor_terminal_null,
        ["retain", "clear"] as const,
        `source '${sourceId}' certification.account_compatibility.surfaces[${String(index)}].cursor_terminal_null`,
      ),
      progress: {
        target: oneOf(
          progress.target,
          [
            "bounded_window",
            "forward_and_backfill",
            "full_snapshot",
            "per_identity_history",
            "programmable_fixture",
          ] as const,
          `${label}.progress.target`,
        ),
        continuation: oneOf(
          progress.continuation,
          ["opaque_cursor"] as const,
          `${label}.progress.continuation`,
        ),
        forwardCheckpoint: oneOf(
          progress.forward_checkpoint,
          ["opaque_cursor"] as const,
          `${label}.progress.forward_checkpoint`,
        ),
        coverage: oneOf(
          progress.coverage,
          ["per_identity_range", "range", "snapshot", "tracked_identity_set", "unknown"] as const,
          `${label}.progress.coverage`,
        ),
        liveFence: oneOf(
          progress.live_fence,
          ["none", "subscription_ack"] as const,
          `${label}.progress.live_fence`,
        ),
      },
      receiverInterfaceHash,
    };
  });
  const input: SourceAccountCompatibilityInput = {
    auth: authValue === "none" ? null : authValue,
    identityRule: requiredString(
      account,
      "identity_rule",
      `source '${sourceId}' certification.account_compatibility`,
    ),
    credentialKeys: sortedStrings(
      account.credential_keys,
      `source '${sourceId}' certification.account_compatibility.credential_keys`,
      true,
    ),
    mintedCredentialKeys: sortedStrings(
      account.minted_credential_keys,
      `source '${sourceId}' certification.account_compatibility.minted_credential_keys`,
      true,
    ),
    surfaces,
  };
  const migratesFrom = sortedStrings(
    account.migrates_from,
    `source '${sourceId}' certification.account_compatibility.migrates_from`,
    true,
  );
  if (migratesFrom.some((hash) => !HASH_PATTERN.test(hash))) {
    throw new Error(
      `source '${sourceId}' certification.account_compatibility.migrates_from must contain canonical sha256 hashes`,
    );
  }
  return { hash: accountCompatibilityHash(input), migratesFrom, input };
}

export function decodeSourceCertificationDeclaration(
  sourceId: string,
  manifest: Record<string, unknown>,
): SourceCertificationDeclaration {
  const raw = manifest.certification;
  if (!isRecord(raw)) throw new Error(`source '${sourceId}' has no [certification] declaration`);

  const disposition = oneOf(
    raw.disposition,
    ["admissible"] as const,
    `source '${sourceId}' certification.disposition`,
  );

  const protocol = oneOf(
    raw.protocol,
    ["magnis.source/1"] as const,
    `source '${sourceId}' certification.protocol`,
  );
  const authority = oneOf(
    raw.authority,
    ["module_sync", "tools_only"] as const,
    `source '${sourceId}' certification.authority`,
  );
  const releaseTier = oneOf(
    raw.release_tier,
    ["production", "development_fixture"] as const,
    `source '${sourceId}' certification.release_tier`,
  );
  const delivery = oneOf(
    raw.delivery,
    ["poll", "push", "none"] as const,
    `source '${sourceId}' certification.delivery`,
  );
  const serverInfoVersion = requiredString(
    raw,
    "server_info_version",
    `source '${sourceId}' certification`,
  );
  const serverInfoName = requiredString(
    raw,
    "server_info_name",
    `source '${sourceId}' certification`,
  );
  const runtimeKind = oneOf(
    raw.runtime_kind,
    ["connector_sdk", "custom", "external_wrapped"] as const,
    `source '${sourceId}' certification.runtime_kind`,
  );
  const runtimeVersion = requiredString(
    raw,
    "runtime_version",
    `source '${sourceId}' certification`,
  );
  const advertisedTools = sortedStrings(
    raw.advertised_tools,
    `source '${sourceId}' certification.advertised_tools`,
    true,
  );
  const callableOperations = sortedStrings(
    raw.callable_operations,
    `source '${sourceId}' certification.callable_operations`,
    false,
  );
  const scenarioIds = sortedStrings(
    raw.scenario_ids,
    `source '${sourceId}' certification.scenario_ids`,
    false,
  );
  const accountCompatibility = decodeAccountCompatibility(sourceId, raw);
  const manifestAuth = manifest.auth;
  const declaredAuth = accountCompatibility.input.auth;
  if (manifestAuth === undefined) {
    if (declaredAuth !== null) {
      throw new Error(
        `source '${sourceId}' has no manifest auth but certifies account auth ${declaredAuth}`,
      );
    }
  } else {
    const manifestAuthRecord = requiredRecord(manifestAuth, `source '${sourceId}' auth`);
    const manifestAuthKind = oneOf(
      manifestAuthRecord.type,
      ["api_key", "oauth2", "phone_code", "shared_provider"] as const,
      `source '${sourceId}' auth.type`,
    );
    if (manifestAuthKind !== declaredAuth) {
      throw new Error(
        `source '${sourceId}' manifest auth ${manifestAuthKind} does not match certification account auth ${String(declaredAuth)}`,
      );
    }
  }
  const interval = raw.poll_interval_secs;
  const pollIntervalSecs = interval === undefined ? null : interval;
  if (
    pollIntervalSecs !== null &&
    (typeof pollIntervalSecs !== "number" ||
      !Number.isInteger(pollIntervalSecs) ||
      pollIntervalSecs <= 0)
  ) {
    throw new Error(`source '${sourceId}' certification.poll_interval_secs must be a positive integer`);
  }
  if (delivery === "poll" && pollIntervalSecs === null) {
    throw new Error(`source '${sourceId}' poll delivery requires certification.poll_interval_secs`);
  }
  if (delivery !== "poll" && pollIntervalSecs !== null) {
    throw new Error(`source '${sourceId}' non-poll delivery forbids certification.poll_interval_secs`);
  }
  if (authority === "tools_only" && delivery !== "none") {
    throw new Error(`source '${sourceId}' tools_only authority requires delivery=none`);
  }
  if (authority === "module_sync" && delivery === "none") {
    throw new Error(`source '${sourceId}' module_sync authority forbids delivery=none`);
  }

  return {
    disposition,
    protocol,
    authority,
    releaseTier,
    delivery,
    pollIntervalSecs,
    serverInfoName,
    serverInfoVersion,
    runtimeKind,
    runtimeVersion,
    advertisedTools,
    callableOperations,
    scenarioIds,
    accountCompatibility,
  };
}

/** Discover every authored Source release package from one sorted directory
 * snapshot. Each manifest must say either `admissible` (and carry the full
 * v1 declaration) or `inadmissible` (and carry an exact reason). There is no
 * implicit legacy/default lane.
 *
 * @tested-by: tst_cat_src_cert_001
 * @invariant: a newly added Source manifest cannot evade certification by
 * being absent from a hand-maintained script list.
 */
export function discoverSourceReleaseManifests(
  sourcesRoot: string,
): readonly SourceReleaseManifest[] {
  if (!existsSync(sourcesRoot)) return [];
  const releases: SourceReleaseManifest[] = [];
  const entries = readdirSync(sourcesRoot, { withFileTypes: true }).sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith("_")) continue;
    const root = join(sourcesRoot, entry.name);
    const manifestPath = join(root, "manifest.toml");
    if (!existsSync(manifestPath)) continue;
    const parsed = parseToml(readFileSync(manifestPath, "utf8")) as unknown;
    if (!isRecord(parsed)) throw new Error(`source '${entry.name}' manifest must be a TOML table`);
    const id = requiredString(parsed, "id", `source '${entry.name}' manifest`);
    if (id !== entry.name) throw new Error(`source '${entry.name}' manifest id is '${id}'`);
    if (!SOURCE_ID_PATTERN.test(id)) throw new Error(`source '${id}' has an invalid id`);
    requiredString(parsed, "version", `source '${id}' manifest`);
    const certification = parsed.certification;
    if (!isRecord(certification) || certification.disposition === undefined) {
      throw new Error(`source '${id}' has no explicit certification disposition`);
    }
    if (certification.disposition === "inadmissible") {
      const reason = requiredString(certification, "reason", `source '${id}' certification`);
      releases.push({ disposition: "inadmissible", id, root, manifestPath, manifest: parsed, reason });
      continue;
    }
    if (certification.disposition !== "admissible") {
      throw new Error(`source '${id}' certification.disposition must be admissible or inadmissible`);
    }
    releases.push({
      disposition: "admissible",
      id,
      root,
      manifestPath,
      manifest: parsed,
      declaration: decodeSourceCertificationDeclaration(id, parsed),
    });
  }
  return releases;
}

function sourceReferencedFiles(sourceId: string, manifest: Record<string, unknown>): readonly string[] {
  const dataset = manifest.dataset;
  if (dataset === undefined) return [];
  if (!isRecord(dataset)) throw new Error(`source '${sourceId}' dataset must be a table`);
  const actions = dataset.actions;
  if (actions === undefined) return [];
  if (!Array.isArray(actions)) throw new Error(`source '${sourceId}' dataset.actions must be an array`);
  const references = actions.map((action, index) => {
    if (!isRecord(action)) {
      throw new Error(`source '${sourceId}' dataset.actions[${String(index)}] must be a table`);
    }
    const reference = requiredString(
      action,
      "schema",
      `source '${sourceId}' dataset.actions[${String(index)}]`,
    );
    const segments = reference.split("/");
    if (
      reference.startsWith("/") ||
      reference.includes("\\") ||
      segments.some((segment) => segment === "" || segment === "." || segment === "..")
    ) {
      throw new Error(`source '${sourceId}' referenced file '${reference}' is not root-local`);
    }
    return reference;
  });
  return [...new Set(references)].sort();
}

/** Prove the staged package is dependency-closed for every executable and
 * manifest file reference. Only the fixed root-local Bun entry is admissible;
 * network/package-manager commands are never interpreted as package content.
 *
 * @tested-by: tst_cat_src_cert_001
 * @invariant: certification never blesses an artifact whose executable or
 * declared schema lives outside its immutable package root.
 */
export function assertStagedSourceArtifactClosure(
  sourceId: string,
  root: string,
  manifest: Record<string, unknown>,
): void {
  const entryPath = join(root, "dist", "main.js");
  if (!existsSync(entryPath) || !statSync(entryPath).isFile()) {
    throw new Error(`source '${sourceId}' root-local executable 'dist/main.js' is missing`);
  }
  const spawn = manifest.spawn;
  if (spawn !== undefined) {
    if (!isRecord(spawn)) throw new Error(`source '${sourceId}' spawn must be a table`);
    const command = spawn.command;
    const args = spawn.args;
    if (
      command !== "bun" ||
      !Array.isArray(args) ||
      args.length !== 2 ||
      args[0] !== "run" ||
      args[1] !== "dist/main.js"
    ) {
      throw new Error(`source '${sourceId}' spawn must execute root-local dist/main.js`);
    }
  }
  for (const reference of sourceReferencedFiles(sourceId, manifest)) {
    const path = join(root, ...reference.split("/"));
    if (!existsSync(path) || !statSync(path).isFile()) {
      throw new Error(`source '${sourceId}' referenced file '${reference}' is missing`);
    }
    try {
      JSON.parse(readFileSync(path, "utf8")) as unknown;
    } catch (error: unknown) {
      throw new Error(
        `source '${sourceId}' referenced file '${reference}' is not valid JSON`,
        { cause: error },
      );
    }
  }
}

export function sourceManifestReferencedFiles(
  sourceId: string,
  manifest: Record<string, unknown>,
): readonly string[] {
  return sourceReferencedFiles(sourceId, manifest);
}

function discoverKind(catalogOut: string, kind: CatalogPackageKind): StagedCatalogPackage[] {
  const kindRoot = join(catalogOut, "packages", kind);
  if (!existsSync(kindRoot)) return [];
  const packages: StagedCatalogPackage[] = [];
  for (const id of readdirSync(kindRoot).sort()) {
    const root = join(kindRoot, id);
    if (!statSync(root).isDirectory()) continue;
    const manifestPath = join(root, "manifest.toml");
    if (!existsSync(manifestPath)) throw new Error(`${kind} '${id}' has no staged manifest.toml`);
    const parsed = parseToml(readFileSync(manifestPath, "utf8")) as unknown;
    if (!isRecord(parsed)) throw new Error(`${kind} '${id}' manifest must be a TOML table`);
    const authoredId = requiredString(parsed, "id", `${kind} '${id}' manifest`);
    if (authoredId !== id) throw new Error(`${kind} '${id}' manifest id is '${authoredId}'`);
    if (!SOURCE_ID_PATTERN.test(authoredId)) throw new Error(`${kind} '${id}' has an invalid id`);
    const version = requiredString(parsed, "version", `${kind} '${id}' manifest`);
    if (kind === "source") assertStagedSourceArtifactClosure(id, root, parsed);
    const files = sortedFiles(root).map((path) => ({
      path: relative(root, path).replaceAll("\\", "/"),
      sha256: sha256(readFileSync(path)),
    }));
    packages.push({
      kind,
      id,
      version,
      title: optionalString(parsed, "title", id),
      summary: optionalString(parsed, "summary", ""),
      publisher: optionalString(parsed, "publisher", ""),
      dev: parsed.dev === true,
      files,
      root,
      packageHash: hashStagedPackage(root),
      definitionHash: kind === "source"
        ? sourceDefinitionHash(root, id, parsed)
        : prefixedSha256(canonicalJson(toJsonValue(parsed, "manifest"))),
      certification: kind === "source" ? decodeSourceCertificationDeclaration(id, parsed) : null,
    });
  }
  return packages;
}

/** Discover the exact staged set once, with deterministic kind/id/file order.
 * Both index versions consume this returned immutable snapshot.
 *
 * @tested-by: tst_cat_src_cert_001
 * @invariant: index v1 and v2 cannot be assembled from divergent directory scans.
 */
export function discoverStagedCatalog(catalogOut: string): readonly StagedCatalogPackage[] {
  return [
    ...discoverKind(catalogOut, "module"),
    ...discoverKind(catalogOut, "source"),
  ];
}

/** Inspect one exact previously published Source tree using a declaration from
 * the canonical current matrix. The old manifest is never rewritten and its
 * package/definition hashes remain identities of the selected-channel bytes. */
export function inspectRetroactiveSourceArtifact(
  root: string,
  declaration: SourceCertificationDeclaration,
): StagedCatalogPackage {
  const manifestPath = join(root, "manifest.toml");
  const parsed = parseToml(readFileSync(manifestPath, "utf8")) as unknown;
  if (!isRecord(parsed)) throw new Error(`retroactive Source '${root}' manifest must be a table`);
  const id = requiredString(parsed, "id", "retroactive Source manifest");
  if (!SOURCE_ID_PATTERN.test(id)) throw new Error(`retroactive Source '${id}' has an invalid id`);
  assertStagedSourceArtifactClosure(id, root, parsed);
  const files = sortedFiles(root).map((path) => ({
    path: relative(root, path).replaceAll("\\", "/"),
    sha256: sha256(readFileSync(path)),
  }));
  return {
    kind: "source",
    id,
    version: requiredString(parsed, "version", `retroactive Source '${id}' manifest`),
    title: optionalString(parsed, "title", id),
    summary: optionalString(parsed, "summary", ""),
    publisher: optionalString(parsed, "publisher", ""),
    dev: parsed.dev === true,
    files,
    root,
    packageHash: hashStagedPackage(root),
    definitionHash: sourceDefinitionHash(root, id, parsed),
    certification: declaration,
  };
}

function sourceInitializeEvidence(
  entry: StagedCatalogPackage,
  value: unknown,
): {
  mcpProtocolVersion: string;
  serverInfoName: string;
  serverInfoVersion: string;
  capabilitiesHash: string;
} {
  const reply = requiredRecord(value, `source '${entry.id}' initialize reply`);
  if (reply.error !== undefined) throw new Error(`source '${entry.id}' initialize returned an error`);
  const result = requiredRecord(reply.result, `source '${entry.id}' initialize result`);
  const serverInfo = requiredRecord(result.serverInfo, `source '${entry.id}' initialize serverInfo`);
  const capabilities = requiredRecord(
    result.capabilities,
    `source '${entry.id}' initialize capabilities`,
  );
  const declaration = entry.certification;
  if (declaration === null) throw new Error(`source '${entry.id}' has no certification declaration`);
  const experimental = requiredRecord(
    capabilities.experimental,
    `source '${entry.id}' initialize capabilities.experimental`,
  );
  const magnis = requiredRecord(
    experimental.magnis,
    `source '${entry.id}' initialize capabilities.experimental.magnis`,
  );
  const sync = requiredRecord(
    magnis.sync,
    `source '${entry.id}' initialize capabilities.experimental.magnis.sync`,
  );
  const actualSurfaces = unorderedStrings(sync.surfaces, `source '${entry.id}' initialize surfaces`);
  const expectedSurfaces = declaration.accountCompatibility.input.surfaces.map(({ name }) => name);
  if (JSON.stringify([...actualSurfaces].sort()) !== JSON.stringify([...expectedSurfaces].sort())) {
    throw new Error(`source '${entry.id}' initialize surfaces do not match its declaration`);
  }
  if (sync.mode !== declaration.delivery) {
    throw new Error(`source '${entry.id}' initialize mode does not match its declaration`);
  }
  if (declaration.delivery === "poll" && sync.interval_secs !== declaration.pollIntervalSecs) {
    throw new Error(`source '${entry.id}' initialize interval does not match its declaration`);
  }
  const serverInfoName = requiredString(serverInfo, "name", `source '${entry.id}' serverInfo`);
  const serverInfoVersion = requiredString(serverInfo, "version", `source '${entry.id}' serverInfo`);
  if (
    serverInfoName !== declaration.serverInfoName ||
    serverInfoVersion !== declaration.serverInfoVersion
  ) {
    throw new Error(`source '${entry.id}' initialize serverInfo does not match its declaration`);
  }
  return {
    mcpProtocolVersion: requiredString(result, "protocolVersion", `source '${entry.id}' initialize`),
    serverInfoName,
    serverInfoVersion,
    capabilitiesHash: prefixedSha256(canonicalJson(toJsonValue(capabilities, "initialize capabilities"))),
  };
}

function advertisedToolNames(entry: StagedCatalogPackage, value: unknown): readonly string[] {
  const reply = requiredRecord(value, `source '${entry.id}' tools/list reply`);
  if (reply.error !== undefined) throw new Error(`source '${entry.id}' tools/list returned an error`);
  const result = requiredRecord(reply.result, `source '${entry.id}' tools/list result`);
  if (!Array.isArray(result.tools)) throw new Error(`source '${entry.id}' tools/list tools must be an array`);
  return result.tools.map((tool, index) => {
    const record = requiredRecord(tool, `source '${entry.id}' tools/list[${String(index)}]`);
    return requiredString(record, "name", `source '${entry.id}' tools/list[${String(index)}]`);
  }).sort();
}

/** Mint a receipt only from a real dependency-closed stdio execution. Provider
 * scenario tests own semantic goldens; this probe additionally proves that the
 * exact artifact advertises its declared initialize shape and has a dispatcher
 * for every operation named by those scenarios. */
export async function mintSourceCertificationReceipt(
  entry: StagedCatalogPackage,
): Promise<SourceCertificationReceipt> {
  const declaration = entry.certification;
  if (entry.kind !== "source" || declaration === null) {
    throw new Error(`package '${entry.id}' is not a certifiable Source`);
  }
  const evidence = await collectSourceHostEvidence(entry.root, declaration.callableOperations);
  const initialize = sourceInitializeEvidence(entry, evidence.initialize);
  const tools = advertisedToolNames(entry, evidence.toolsList);
  if (JSON.stringify(tools) !== JSON.stringify(declaration.advertisedTools)) {
    throw new Error(`source '${entry.id}' tools/list does not match advertised_tools`);
  }
  return {
    packageHash: entry.packageHash,
    sourceId: entry.id,
    protocol: declaration.protocol,
    definitionHash: entry.definitionHash,
    accountCompatibility: {
      hash: declaration.accountCompatibility.hash,
      migratesFrom: declaration.accountCompatibility.migratesFrom,
    },
    authority: declaration.authority,
    releaseTier: declaration.releaseTier,
    delivery: declaration.delivery,
    auth: declaration.accountCompatibility.input.auth,
    surfaces: declaration.accountCompatibility.input.surfaces.map(({ name }) => name).sort(),
    advertisedTools: tools,
    callableOperations: declaration.callableOperations,
    initialize,
    interfaceHashes: declaration.accountCompatibility.input.surfaces
      .map(({ receiverInterfaceHash }) => receiverInterfaceHash)
      .sort(),
    runtime: {
      kind: declaration.runtimeKind,
      implementationHash: prefixedSha256(readFileSync(join(entry.root, "dist", "main.js"))),
      version: declaration.runtimeVersion,
    },
    scenarioIds: declaration.scenarioIds,
    certifierVersion: "1",
    testkitVersion: "0.1.0",
    matrixVersion: "v1",
  };
}

export async function writeSourceCertificationReceipts(
  entries: readonly StagedCatalogPackage[],
  outputDir: string,
): Promise<readonly SourceCertificationReceipt[]> {
  mkdirSync(outputDir, { recursive: true });
  const receipts: SourceCertificationReceipt[] = [];
  for (const entry of entries) {
    if (entry.kind !== "source") continue;
    receipts.push(await mintSourceCertificationReceipt(entry));
  }
  for (const receipt of receipts) {
    writeFileSync(join(outputDir, `${receipt.packageHash}.json`), encodeSourceCertificationReceipt(receipt));
  }
  return receipts;
}

/** Reconcile the generated fixture directory to one exact package-hash set.
 * Stale sidecars are actively removed so a prior manifest hash can never look
 * like an additional certified release. Missing expected sidecars fail closed. */
export function reconcileSourceReceiptFixtures(
  outputDir: string,
  expectedPackageHashes: readonly string[],
): void {
  const expected = new Set(expectedPackageHashes.map((hash) => `${hash}.json`));
  if (expected.size !== expectedPackageHashes.length) {
    throw new Error("receipt fixture package hashes must be unique");
  }
  mkdirSync(outputDir, { recursive: true });
  for (const entry of readdirSync(outputDir, { withFileTypes: true }).sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      throw new Error(`receipt fixture directory contains unsupported entry '${entry.name}'`);
    }
    if (!expected.has(entry.name)) rmSync(join(outputDir, entry.name));
  }
  for (const fileName of [...expected].sort()) {
    if (!existsSync(join(outputDir, fileName))) {
      throw new Error(`receipt fixture '${fileName}' is missing`);
    }
  }
}

function historicalDeclaration(input: {
  authority: "module_sync" | "tools_only";
  releaseTier: "production" | "development_fixture";
  delivery: "poll" | "push" | "none";
  pollIntervalSecs: number | null;
  serverInfoName: string;
  serverInfoVersion: string;
  runtimeKind: "connector_sdk" | "custom" | "external_wrapped";
  runtimeVersion: string;
  advertisedTools: readonly string[];
  callableOperations: readonly string[];
  accountInput: SourceAccountCompatibilityInput;
}): SourceCertificationDeclaration {
  return {
    disposition: "admissible",
    protocol: "magnis.source/1",
    authority: input.authority,
    releaseTier: input.releaseTier,
    delivery: input.delivery,
    pollIntervalSecs: input.pollIntervalSecs,
    serverInfoName: input.serverInfoName,
    serverInfoVersion: input.serverInfoVersion,
    runtimeKind: input.runtimeKind,
    runtimeVersion: input.runtimeVersion,
    advertisedTools: input.advertisedTools,
    callableOperations: input.callableOperations,
    scenarioIds: ["tst_cat_src_legacy_001"],
    accountCompatibility: {
      hash: accountCompatibilityHash(input.accountInput),
      migratesFrom: [],
      input: input.accountInput,
    },
  };
}

/** Exact historical contracts for the nine already-selected package trees.
 * Nothing is copied from the current manifest: each declaration is bound next
 * to its immutable old package/definition hashes and describes observed old
 * initialize/tools/call behavior. */
export const SELECTED_CHANNEL_SOURCE_MATRIX = [
  {
    id: "anysite",
    packageHash: "sha256:9ecf326ed1ac159d3b90042309c45c4a41fc8c9c6b4dbf3738be91aae9600eec",
    definitionHash: "sha256:8862b50d0094696a28082b4e560b9f753448e4c1e0c2a25289c5c48ea195ca5d",
    declaration: historicalDeclaration({
      authority: "module_sync", releaseTier: "production", delivery: "poll", pollIntervalSecs: 600,
      serverInfoName: "anysite", serverInfoVersion: "0.1.0",
      runtimeKind: "connector_sdk", runtimeVersion: "0.1.0",
      advertisedTools: ["magnis.sync.fetch"],
      callableOperations: ["initialize", "magnis.auth.probe", "magnis.sync.fetch", "tools/list"],
      accountInput: {
        auth: "shared_provider", identityRule: "verified_provider_subject",
        credentialKeys: ["api_key"], mintedCredentialKeys: [],
        surfaces: [{
          name: "linkedin", cursorTerminalNull: "retain",
          progress: { target: "forward_and_backfill", continuation: "opaque_cursor", forwardCheckpoint: "opaque_cursor", coverage: "tracked_identity_set", liveFence: "none" },
          receiverInterfaceHash: v1ReceiverInterfaceHash("linkedin"),
        }],
      },
    }),
  },
  {
    id: "google",
    packageHash: "sha256:c37f10f70bc5cb0693f4d13cc870d3df891b41d5338bcf514b00468bec5e0938",
    definitionHash: "sha256:53cda0e75af3636a11dfb23ae18b34e3f81af9881852641e7272434a4ef565a4",
    declaration: historicalDeclaration({
      authority: "module_sync", releaseTier: "production", delivery: "poll", pollIntervalSecs: 30,
      serverInfoName: "magnis-google", serverInfoVersion: "1.0.0",
      runtimeKind: "connector_sdk", runtimeVersion: "0.1.0",
      advertisedTools: ["magnis.sync.fetch"],
      callableOperations: ["initialize", "magnis.auth.exchange", "magnis.auth.revoke", "magnis.execute:download_file", "magnis.execute:send_message", "magnis.sync.fetch", "tools/list"],
      accountInput: {
        auth: "oauth2", identityRule: "verified_google_subject",
        credentialKeys: ["client_id", "client_secret", "refresh_token"], mintedCredentialKeys: ["refresh_token"],
        surfaces: [
          { name: "contacts", cursorTerminalNull: "clear", progress: { target: "full_snapshot", continuation: "opaque_cursor", forwardCheckpoint: "opaque_cursor", coverage: "snapshot", liveFence: "none" }, receiverInterfaceHash: v1ReceiverInterfaceHash("contacts") },
          { name: "email", cursorTerminalNull: "retain", progress: { target: "forward_and_backfill", continuation: "opaque_cursor", forwardCheckpoint: "opaque_cursor", coverage: "range", liveFence: "none" }, receiverInterfaceHash: v1ReceiverInterfaceHash("email") },
          { name: "meetings", cursorTerminalNull: "clear", progress: { target: "bounded_window", continuation: "opaque_cursor", forwardCheckpoint: "opaque_cursor", coverage: "range", liveFence: "none" }, receiverInterfaceHash: v1ReceiverInterfaceHash("meetings") },
        ],
      },
    }),
  },
  {
    id: "local",
    packageHash: "sha256:a0af80600dfe74dab5ef5e8ee68f8fab4fa944eb8f7bd6bda1384ea81dac4b52",
    definitionHash: "sha256:c1c14b32bed15d1e12a573450cf0afe085ff77c47eb42c373a0accbdeaa9df9c",
    declaration: historicalDeclaration({
      authority: "module_sync", releaseTier: "development_fixture", delivery: "poll", pollIntervalSecs: 60,
      serverInfoName: "magnis-local", serverInfoVersion: "0.1.0",
      runtimeKind: "connector_sdk", runtimeVersion: "0.1.0",
      advertisedTools: ["magnis.sync.fetch"], callableOperations: ["initialize", "magnis.sync.fetch", "tools/list"],
      accountInput: {
        auth: null, identityRule: "local_storage_root", credentialKeys: [], mintedCredentialKeys: [],
        surfaces: [{ name: "notes", cursorTerminalNull: "retain", progress: { target: "forward_and_backfill", continuation: "opaque_cursor", forwardCheckpoint: "opaque_cursor", coverage: "range", liveFence: "none" }, receiverInterfaceHash: v1ReceiverInterfaceHash("notes") }],
      },
    }),
  },
  {
    id: "mock-gmail",
    packageHash: "sha256:f3e0077a1d9c8e0d2b4052786e3673dcb1275d06b3c8ca5a6059ffdb27542058",
    definitionHash: "sha256:78ce540f88ab3e2538b348b1c644be8cec8285df4e3b525e35a59d8f6d613655",
    declaration: historicalDeclaration({
      authority: "module_sync", releaseTier: "development_fixture", delivery: "poll", pollIntervalSecs: 5,
      serverInfoName: "magnis-mock-gmail", serverInfoVersion: "0.1.0",
      runtimeKind: "connector_sdk", runtimeVersion: "0.1.0",
      advertisedTools: ["magnis.sync.fetch"], callableOperations: ["initialize", "magnis.sync.fetch", "tools/list"],
      accountInput: {
        auth: null, identityRule: "manifest_account_subject", credentialKeys: [], mintedCredentialKeys: [],
        surfaces: [
          { name: "email", cursorTerminalNull: "retain", progress: { target: "forward_and_backfill", continuation: "opaque_cursor", forwardCheckpoint: "opaque_cursor", coverage: "range", liveFence: "none" }, receiverInterfaceHash: v1ReceiverInterfaceHash("email") },
          { name: "meetings", cursorTerminalNull: "clear", progress: { target: "bounded_window", continuation: "opaque_cursor", forwardCheckpoint: "opaque_cursor", coverage: "range", liveFence: "none" }, receiverInterfaceHash: v1ReceiverInterfaceHash("meetings") },
        ],
      },
    }),
  },
  {
    id: "mock-linkedin",
    packageHash: "sha256:408f1d7873e621a01e0fac9bac055c87e16fe38e5642bc1255380ec601d5cd86",
    definitionHash: "sha256:92edc85ac60a6013a2841008fb91af69d249a49b515bdfd542f11e23fbb1c283",
    declaration: historicalDeclaration({
      authority: "module_sync", releaseTier: "development_fixture", delivery: "poll", pollIntervalSecs: 5,
      serverInfoName: "mock-linkedin", serverInfoVersion: "0.1.0",
      runtimeKind: "connector_sdk", runtimeVersion: "0.1.0",
      advertisedTools: ["magnis.sync.fetch"], callableOperations: ["initialize", "magnis.auth.probe", "magnis.sync.fetch", "tools/list"],
      accountInput: {
        auth: null, identityRule: "manifest_account_subject", credentialKeys: [], mintedCredentialKeys: [],
        surfaces: [{ name: "linkedin", cursorTerminalNull: "retain", progress: { target: "forward_and_backfill", continuation: "opaque_cursor", forwardCheckpoint: "opaque_cursor", coverage: "tracked_identity_set", liveFence: "none" }, receiverInterfaceHash: v1ReceiverInterfaceHash("linkedin") }],
      },
    }),
  },
  {
    id: "mock-telegram",
    packageHash: "sha256:b8e372686672abb0450101e0275926d3f8d9f085d66fc98d3ed2b0f934281a85",
    definitionHash: "sha256:777a46188e110ba44abe96d971ca76b6c886a1cebe60f201f2d03016339d2d0c",
    declaration: historicalDeclaration({
      authority: "module_sync", releaseTier: "development_fixture", delivery: "poll", pollIntervalSecs: 2,
      serverInfoName: "magnis-mock-telegram", serverInfoVersion: "0.1.0",
      runtimeKind: "connector_sdk", runtimeVersion: "0.1.0",
      advertisedTools: ["magnis.sync.fetch"], callableOperations: ["initialize", "magnis.sync.fetch", "tools/list"],
      accountInput: {
        auth: null, identityRule: "manifest_account_subject", credentialKeys: [], mintedCredentialKeys: [],
        surfaces: [{ name: "telegram", cursorTerminalNull: "retain", progress: { target: "per_identity_history", continuation: "opaque_cursor", forwardCheckpoint: "opaque_cursor", coverage: "per_identity_range", liveFence: "none" }, receiverInterfaceHash: v1ReceiverInterfaceHash("telegram") }],
      },
    }),
  },
  {
    id: "mock-x",
    packageHash: "sha256:af53b579b2faaad14ad2ed79e027722fa218c5f51bd4bbe232fecffbe5072f1a",
    definitionHash: "sha256:e32d296f1abe0f850fac4dfff97394456ebdbb1deb3893ac10d3fa092467f11c",
    declaration: historicalDeclaration({
      authority: "module_sync", releaseTier: "development_fixture", delivery: "poll", pollIntervalSecs: 5,
      serverInfoName: "mock-x", serverInfoVersion: "0.1.0",
      runtimeKind: "connector_sdk", runtimeVersion: "0.1.0",
      advertisedTools: ["magnis.sync.fetch"], callableOperations: ["initialize", "magnis.auth.probe", "magnis.sync.fetch", "tools/list"],
      accountInput: {
        auth: null, identityRule: "manifest_account_subject", credentialKeys: [], mintedCredentialKeys: [],
        surfaces: [{ name: "x", cursorTerminalNull: "retain", progress: { target: "forward_and_backfill", continuation: "opaque_cursor", forwardCheckpoint: "opaque_cursor", coverage: "tracked_identity_set", liveFence: "none" }, receiverInterfaceHash: v1ReceiverInterfaceHash("x") }],
      },
    }),
  },
  {
    id: "telegram",
    packageHash: "sha256:7857f6d70f85f899b196fcdc978e6ec1ba4836384c66e920ca0791b9fe20249b",
    definitionHash: "sha256:6b62c010d11c85212c6eeb772bc21a8e06827224871d9fd01018facd460c4f77",
    declaration: historicalDeclaration({
      authority: "module_sync", releaseTier: "production", delivery: "push", pollIntervalSecs: null,
      serverInfoName: "magnis-telegram", serverInfoVersion: "1.0.0",
      runtimeKind: "custom", runtimeVersion: "1.0.0", advertisedTools: [],
      callableOperations: ["initialize", "listen_start", "listen_stop", "magnis.auth.begin", "magnis.auth.revoke", "magnis.auth.step", "magnis.execute", "magnis.sync.fetch", "magnis.sync.listen", "tools/list"],
      accountInput: {
        auth: "phone_code", identityRule: "verified_telegram_user_id",
        credentialKeys: ["api_hash", "api_id", "session"], mintedCredentialKeys: ["session"],
        surfaces: [{ name: "telegram", cursorTerminalNull: "retain", progress: { target: "per_identity_history", continuation: "opaque_cursor", forwardCheckpoint: "opaque_cursor", coverage: "per_identity_range", liveFence: "subscription_ack" }, receiverInterfaceHash: v1ReceiverInterfaceHash("telegram") }],
      },
    }),
  },
  {
    id: "x",
    packageHash: "sha256:bc7bf25b35d7e857ca7cc07559ac6f97ef16d25d45fd909a5e03a2a3695e5c99",
    definitionHash: "sha256:b5d90a3901e020b6d993cb7aedfdcb5c87913c0fef65fd31128369bea14ed35a",
    declaration: historicalDeclaration({
      authority: "module_sync", releaseTier: "production", delivery: "poll", pollIntervalSecs: 300,
      serverInfoName: "x", serverInfoVersion: "0.1.0",
      runtimeKind: "connector_sdk", runtimeVersion: "0.1.0",
      advertisedTools: ["magnis.sync.fetch"], callableOperations: ["initialize", "magnis.auth.probe", "magnis.sync.fetch", "tools/list"],
      accountInput: {
        auth: "api_key", identityRule: "verified_provider_subject", credentialKeys: ["bearer_token"], mintedCredentialKeys: [],
        surfaces: [
          { name: "contacts", cursorTerminalNull: "retain", progress: { target: "forward_and_backfill", continuation: "opaque_cursor", forwardCheckpoint: "opaque_cursor", coverage: "tracked_identity_set", liveFence: "none" }, receiverInterfaceHash: v1ReceiverInterfaceHash("contacts") },
          { name: "x", cursorTerminalNull: "retain", progress: { target: "forward_and_backfill", continuation: "opaque_cursor", forwardCheckpoint: "opaque_cursor", coverage: "tracked_identity_set", liveFence: "none" }, receiverInterfaceHash: v1ReceiverInterfaceHash("x") },
        ],
      },
    }),
  },
] as const;

/** Re-certify only the nine exact package identities already present in the
 * selected channel. Fixed hashes prevent an id/version lookalike from adopting
 * old accounts. The old mock dataset packages keep their observed fetch-only
 * wire instead of inheriting new dataset operations from current manifests. */
export async function writeSelectedChannelSourceReceipts(options: {
  selectedSourcesRoot: string;
  outputDir: string;
}): Promise<readonly SourceCertificationReceipt[]> {
  const entries = SELECTED_CHANNEL_SOURCE_MATRIX.map((expected) => {
    const entry = inspectRetroactiveSourceArtifact(
      join(options.selectedSourcesRoot, expected.id),
      expected.declaration,
    );
    if (entry.packageHash !== expected.packageHash) {
      throw new Error(`selected-channel Source '${expected.id}' package hash mismatch`);
    }
    if (entry.definitionHash !== expected.definitionHash) {
      throw new Error(`selected-channel Source '${expected.id}' definition hash mismatch`);
    }
    return entry;
  });
  return writeSourceCertificationReceipts(entries, options.outputDir);
}

function legacyPackage(entry: StagedCatalogPackage): LegacyCatalogPackage {
  return {
    kind: entry.kind,
    id: entry.id,
    version: entry.version,
    title: entry.title,
    summary: entry.summary,
    publisher: entry.publisher,
    dev: entry.dev,
    files: entry.files,
  };
}

function assertReceiptMatchesDeclaration(
  entry: StagedCatalogPackage,
  receipt: ReturnType<typeof decodeSourceCertificationReceipt>,
): void {
  const declaration = entry.certification;
  if (declaration === null) throw new Error(`source '${entry.id}' has no certification declaration`);
  if (receipt.sourceId !== entry.id) throw new Error(`source '${entry.id}' receipt sourceId mismatch`);
  if (receipt.protocol !== declaration.protocol) throw new Error(`source '${entry.id}' receipt protocol mismatch`);
  if (receipt.authority !== declaration.authority) throw new Error(`source '${entry.id}' receipt authority mismatch`);
  if (receipt.releaseTier !== declaration.releaseTier) throw new Error(`source '${entry.id}' receipt releaseTier mismatch`);
  if (receipt.delivery !== declaration.delivery) throw new Error(`source '${entry.id}' receipt delivery mismatch`);
  if (receipt.initialize.serverInfoVersion !== declaration.serverInfoVersion) {
    throw new Error(`source '${entry.id}' receipt serverInfoVersion mismatch`);
  }
  if (receipt.initialize.serverInfoName !== declaration.serverInfoName) {
    throw new Error(`source '${entry.id}' receipt serverInfoName mismatch`);
  }
  if (receipt.runtime.kind !== declaration.runtimeKind) {
    throw new Error(`source '${entry.id}' receipt runtime kind mismatch`);
  }
  if (receipt.runtime.version !== declaration.runtimeVersion) {
    throw new Error(`source '${entry.id}' receipt runtime version mismatch`);
  }
  const implementationHash = prefixedSha256(readFileSync(join(entry.root, "dist", "main.js")));
  if (receipt.runtime.implementationHash !== implementationHash) {
    throw new Error(`source '${entry.id}' receipt implementation hash mismatch`);
  }
  if (receipt.auth !== declaration.accountCompatibility.input.auth) {
    throw new Error(`source '${entry.id}' receipt auth mismatch`);
  }
  if (JSON.stringify(receipt.surfaces) !== JSON.stringify(declaration.accountCompatibility.input.surfaces.map(({ name }) => name))) {
    throw new Error(`source '${entry.id}' receipt surfaces mismatch`);
  }
  if (JSON.stringify(receipt.advertisedTools) !== JSON.stringify(declaration.advertisedTools)) {
    throw new Error(`source '${entry.id}' receipt advertisedTools mismatch`);
  }
  if (JSON.stringify(receipt.callableOperations) !== JSON.stringify(declaration.callableOperations)) {
    throw new Error(`source '${entry.id}' receipt callableOperations mismatch`);
  }
  if (JSON.stringify(receipt.scenarioIds) !== JSON.stringify(declaration.scenarioIds)) {
    throw new Error(`source '${entry.id}' receipt scenarioIds mismatch`);
  }
  if (receipt.accountCompatibility.hash !== declaration.accountCompatibility.hash) {
    throw new Error(`source '${entry.id}' receipt accountCompatibility hash mismatch`);
  }
  if (JSON.stringify(receipt.accountCompatibility.migratesFrom) !== JSON.stringify(declaration.accountCompatibility.migratesFrom)) {
    throw new Error(`source '${entry.id}' receipt accountCompatibility migrations mismatch`);
  }
  const interfaceHashes = declaration.accountCompatibility.input.surfaces.map(
    ({ receiverInterfaceHash }) => receiverInterfaceHash,
  ).sort();
  if (JSON.stringify(receipt.interfaceHashes) !== JSON.stringify(interfaceHashes)) {
    throw new Error(`source '${entry.id}' receipt interfaceHashes mismatch`);
  }
}

/** Validate every Source receipt against its exact staged bytes, emit external
 * sidecars, and write legacy/strict indexes from one discovery snapshot. A
 * missing or mismatched receipt aborts publication; callers never retry v1.
 *
 * @tested-by: tst_cat_src_cert_001
 * @invariant: an uncertified Source cannot enter either release publication.
 */
export async function writeCertifiedCatalogIndexes(
  options: WriteCertifiedCatalogIndexesOptions,
): Promise<CertifiedCatalogResult> {
  const discovered = options.discovered ?? discoverStagedCatalog(options.catalogOut);
  const legacyPackages = discovered.map(legacyPackage);
  const strictPackages: (LegacyCatalogPackage | StrictSourceCatalogPackage)[] = [];
  const sidecars: { path: string; bytes: string }[] = [];

  for (const entry of discovered) {
    const legacy = legacyPackage(entry);
    if (entry.kind === "module") {
      strictPackages.push(legacy);
      continue;
    }
    if (!HASH_PATTERN.test(entry.packageHash)) {
      throw new Error(`source '${entry.id}' has an invalid staged package hash`);
    }
    const inputPath = join(options.receiptInputDir, `${entry.packageHash}.json`);
    if (!existsSync(inputPath)) {
      throw new Error(`source '${entry.id}' has no receipt for staged package ${entry.packageHash}`);
    }
    const receipt = decodeSourceCertificationReceipt(readFileSync(inputPath, "utf8"), {
      packageHash: entry.packageHash,
      definitionHash: entry.definitionHash,
    });
    assertReceiptMatchesDeclaration(entry, receipt);
    const observedReceipt = await mintSourceCertificationReceipt(entry);
    if (encodeSourceCertificationReceipt(receipt) !== encodeSourceCertificationReceipt(observedReceipt)) {
      throw new Error(`source '${entry.id}' receipt does not match executable evidence`);
    }
    const bytes = encodeSourceCertificationReceipt(receipt);
    const reference = certificationReference(receipt);
    strictPackages.push({
      ...legacy,
      package_hash: entry.packageHash,
      certification: reference,
    });
    sidecars.push({ path: reference.path, bytes });
  }

  const indexV1: CatalogIndexV1 = {
    schema_version: 1,
    generated_from: options.generatedFrom,
    packages: legacyPackages,
  };
  const indexV2: CatalogIndexV2 = {
    schema_version: 2,
    generated_from: options.generatedFrom,
    packages: strictPackages,
  };

  for (const sidecar of sidecars) {
    const path = join(options.catalogOut, sidecar.path);
    mkdirSync(join(options.catalogOut, "receipts"), { recursive: true });
    writeFileSync(path, sidecar.bytes);
  }
  writeFileSync(join(options.catalogOut, "index.json"), `${JSON.stringify(indexV1, null, 2)}\n`);
  writeFileSync(join(options.catalogOut, "index.v2.json"), `${JSON.stringify(indexV2, null, 2)}\n`);

  return { discovered, indexV1, indexV2 };
}

if (import.meta.main) {
  const repoRoot = join(import.meta.dir, "..");
  const catalogOut = process.env.CATALOG_OUT ?? join(repoRoot, "catalog");
  const receiptInputDir = process.env.SOURCE_RECEIPTS_IN ?? join(repoRoot, "dist", "receipts");
  const result = await writeCertifiedCatalogIndexes({
    catalogOut,
    receiptInputDir,
    generatedFrom: process.env.GITHUB_SHA ?? "local",
  });
  console.log(
    `certified catalog: ${String(result.discovered.length)} packages -> ${catalogOut}`,
  );
}
