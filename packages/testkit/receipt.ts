import { createHash } from "node:crypto";

import type {
  SourceAuthKind,
  SourceCertificationReceipt,
} from "@magnis/connector-sdk";

type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export interface SourceAccountCompatibilitySurface {
  name: string;
  cursorTerminalNull: "retain" | "clear";
  progress: V1ProgressContract;
  receiverInterfaceHash: string;
}

export type V1ProgressTarget =
  | "bounded_window"
  | "forward_and_backfill"
  | "full_snapshot"
  | "per_identity_history"
  | "programmable_fixture";

export type V1CoverageModel =
  | "per_identity_range"
  | "range"
  | "snapshot"
  | "tracked_identity_set"
  | "unknown";

/** Durable v1 sync meaning. Provider cursors remain opaque; this contract says
 * what work the cursor continues and what Magnis can prove independently. */
export interface V1ProgressContract {
  target: V1ProgressTarget;
  continuation: "opaque_cursor";
  forwardCheckpoint: "opaque_cursor";
  coverage: V1CoverageModel;
  liveFence: "none" | "subscription_ack";
}

export interface V1ReceiverInterfaceContract {
  envelope: "magnis.source/1";
  receiver: string;
  version: "1";
}

export interface SourceAccountCompatibilityInput {
  auth: SourceAuthKind | null;
  identityRule: string;
  credentialKeys: readonly string[];
  mintedCredentialKeys: readonly string[];
  surfaces: readonly SourceAccountCompatibilitySurface[];
}

export interface ReceiptBinding {
  packageHash?: string;
  definitionHash?: string;
}

export interface CertificationReference {
  path: string;
  sha256: string;
}

const RECEIPT_KEYS = [
  "accountCompatibility",
  "advertisedTools",
  "auth",
  "authority",
  "callableOperations",
  "certifierVersion",
  "definitionHash",
  "delivery",
  "initialize",
  "interfaceHashes",
  "matrixVersion",
  "packageHash",
  "protocol",
  "releaseTier",
  "runtime",
  "scenarioIds",
  "sourceId",
  "surfaces",
  "testkitVersion",
] as const;

const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const SOURCE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} has invalid keys`);
  }
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function requireHash(value: unknown, label: string): string {
  const hash = requireString(value, label);
  if (!HASH_PATTERN.test(hash)) throw new Error(`${label} must be a canonical sha256 hash`);
  return hash;
}

function requireOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`${label} has an unsupported value`);
  }
  return value as T;
}

function requireSortedStrings(
  value: unknown,
  label: string,
  options: { allowEmpty: boolean; hashes?: boolean } = { allowEmpty: false },
): readonly string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.length === 0)) {
    throw new Error(`${label} must be an array of non-empty strings`);
  }
  const strings = value as string[];
  if (!options.allowEmpty && strings.length === 0) throw new Error(`${label} must not be empty`);
  if (new Set(strings).size !== strings.length) throw new Error(`${label} must not contain duplicates`);
  for (let index = 1; index < strings.length; index += 1) {
    const previous = strings[index - 1];
    const current = strings[index];
    if (previous === undefined || current === undefined || current < previous) {
      throw new Error(`${label} must be sorted`);
    }
  }
  if (options.hashes && strings.some((entry) => !HASH_PATTERN.test(entry))) {
    throw new Error(`${label} must contain canonical sha256 hashes`);
  }
  return strings;
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
      if (entry === undefined) throw new Error(`canonical JSON key '${key}' is undefined`);
      return `${JSON.stringify(key)}:${canonicalJson(entry)}`;
    })
    .join(",")}}`;
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function validateReceipt(value: unknown): SourceCertificationReceipt {
  if (!isRecord(value)) throw new Error("receipt must be an object");
  assertExactKeys(value, RECEIPT_KEYS, "receipt");

  const accountCompatibility = value.accountCompatibility;
  if (!isRecord(accountCompatibility)) throw new Error("receipt accountCompatibility must be an object");
  assertExactKeys(accountCompatibility, ["hash", "migratesFrom"], "receipt accountCompatibility");

  const initialize = value.initialize;
  if (!isRecord(initialize)) throw new Error("receipt initialize must be an object");
  assertExactKeys(
    initialize,
    ["capabilitiesHash", "mcpProtocolVersion", "serverInfoName", "serverInfoVersion"],
    "receipt initialize",
  );

  const runtime = value.runtime;
  if (!isRecord(runtime)) throw new Error("receipt runtime must be an object");
  assertExactKeys(runtime, ["implementationHash", "kind", "version"], "receipt runtime");

  const authority = requireOneOf(value.authority, ["module_sync", "tools_only"], "receipt authority");
  const delivery = requireOneOf(value.delivery, ["poll", "push", "none"], "receipt delivery");
  const releaseTier = requireOneOf(
    value.releaseTier,
    ["production", "development_fixture"],
    "receipt releaseTier",
  );
  const auth = value.auth === null
    ? null
    : requireOneOf(
        value.auth,
        ["api_key", "oauth2", "phone_code", "shared_provider"],
        "receipt auth",
      );
  const surfaces = requireSortedStrings(value.surfaces, "receipt surfaces", {
    allowEmpty: authority === "tools_only",
  });

  if (authority === "tools_only" && (auth !== null || delivery !== "none" || surfaces.length !== 0)) {
    throw new Error("tools_only receipt must declare auth=null, delivery=none and no surfaces");
  }
  if (authority === "module_sync" && (delivery === "none" || surfaces.length === 0)) {
    throw new Error("module_sync receipt must declare poll or push delivery and at least one surface");
  }
  if (authority === "module_sync" && releaseTier === "production" && auth === null) {
    throw new Error("production module_sync receipt must declare auth");
  }

  const sourceId = requireString(value.sourceId, "receipt sourceId");
  if (!SOURCE_ID_PATTERN.test(sourceId)) throw new Error("receipt sourceId is invalid");

  return {
    packageHash: requireHash(value.packageHash, "receipt packageHash"),
    sourceId,
    protocol: requireOneOf(
      value.protocol,
      ["magnis.source/1", "magnis.source/2"],
      "receipt protocol",
    ),
    definitionHash: requireHash(value.definitionHash, "receipt definitionHash"),
    accountCompatibility: {
      hash: requireHash(accountCompatibility.hash, "receipt accountCompatibility.hash"),
      migratesFrom: requireSortedStrings(
        accountCompatibility.migratesFrom,
        "receipt accountCompatibility.migratesFrom",
        { allowEmpty: true, hashes: true },
      ),
    },
    authority,
    releaseTier,
    delivery,
    auth,
    surfaces,
    advertisedTools: requireSortedStrings(value.advertisedTools, "receipt advertisedTools", {
      allowEmpty: true,
    }),
    callableOperations: requireSortedStrings(
      value.callableOperations,
      "receipt callableOperations",
      { allowEmpty: false },
    ),
    initialize: {
      mcpProtocolVersion: requireString(
        initialize.mcpProtocolVersion,
        "receipt initialize.mcpProtocolVersion",
      ),
      serverInfoName: requireString(initialize.serverInfoName, "receipt initialize.serverInfoName"),
      serverInfoVersion: requireString(
        initialize.serverInfoVersion,
        "receipt initialize.serverInfoVersion",
      ),
      capabilitiesHash: requireHash(
        initialize.capabilitiesHash,
        "receipt initialize.capabilitiesHash",
      ),
    },
    interfaceHashes: requireSortedStrings(value.interfaceHashes, "receipt interfaceHashes", {
      allowEmpty: true,
      hashes: true,
    }),
    runtime: {
      kind: requireOneOf(
        runtime.kind,
        ["connector_sdk", "custom", "external_wrapped"],
        "receipt runtime.kind",
      ),
      implementationHash: requireHash(
        runtime.implementationHash,
        "receipt runtime.implementationHash",
      ),
      version: requireString(runtime.version, "receipt runtime.version"),
    },
    scenarioIds: requireSortedStrings(value.scenarioIds, "receipt scenarioIds"),
    certifierVersion: requireString(value.certifierVersion, "receipt certifierVersion"),
    testkitVersion: requireString(value.testkitVersion, "receipt testkitVersion"),
    matrixVersion: requireString(value.matrixVersion, "receipt matrixVersion"),
  };
}

/** Decode one external receipt without accepting aliases, unknown keys or
 * partial declarations. Optional expected hashes bind it to staged bytes. */
export function decodeSourceCertificationReceipt(
  bytes: string,
  expected: ReceiptBinding = {},
): SourceCertificationReceipt {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes) as unknown;
  } catch (error: unknown) {
    throw new Error(
      `receipt is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  const receipt = validateReceipt(parsed);
  if (expected.packageHash !== undefined && receipt.packageHash !== expected.packageHash) {
    throw new Error("receipt packageHash does not match staged package");
  }
  if (expected.definitionHash !== undefined && receipt.definitionHash !== expected.definitionHash) {
    throw new Error("receipt definitionHash does not match staged definition");
  }
  return receipt;
}

/** Emit deterministic JSON bytes after applying the same strict validation as
 * the consumer. The trailing newline is part of the sidecar hash. */
export function encodeSourceCertificationReceipt(receipt: SourceCertificationReceipt): string {
  const validated = validateReceipt(receipt);
  return `${canonicalJson(validated as unknown as JsonValue)}\n`;
}

/** Build the v2 index pointer for a receipt that remains outside package
 * bytes, avoiding a self-referential package hash. */
export function certificationReference(receipt: SourceCertificationReceipt): CertificationReference {
  const bytes = encodeSourceCertificationReceipt(receipt);
  return {
    path: `receipts/${receipt.packageHash}.json`,
    sha256: sha256(bytes),
  };
}

/** Hash exactly the durable account meaning. Input ordering is normalized;
 * adding/removing a key, changing identity, cursor policy or receiver changes
 * the result. */
export function accountCompatibilityHash(input: SourceAccountCompatibilityInput): string {
  const credentialKeys = [...input.credentialKeys].sort();
  const mintedCredentialKeys = [...input.mintedCredentialKeys].sort();
  const surfaces = [...input.surfaces]
    .map((surface) => ({ ...surface }))
    .sort((left, right) => left.name.localeCompare(right.name));

  requireString(input.identityRule, "account compatibility identityRule");
  requireSortedStrings(credentialKeys, "account compatibility credentialKeys", { allowEmpty: true });
  requireSortedStrings(mintedCredentialKeys, "account compatibility mintedCredentialKeys", {
    allowEmpty: true,
  });
  if (mintedCredentialKeys.some((key) => !credentialKeys.includes(key))) {
    throw new Error("account compatibility mintedCredentialKeys must be credential keys");
  }
  if (new Set(surfaces.map((surface) => surface.name)).size !== surfaces.length) {
    throw new Error("account compatibility surfaces must not contain duplicate names");
  }
  for (const surface of surfaces) {
    requireString(surface.name, "account compatibility surface name");
    validateV1ProgressContract(surface.progress, `account compatibility surface '${surface.name}' progress`);
    requireHash(surface.receiverInterfaceHash, "account compatibility receiverInterfaceHash");
    requireOneOf(
      surface.cursorTerminalNull,
      ["retain", "clear"],
      "account compatibility cursorTerminalNull",
    );
  }

  return sha256(
    canonicalJson({
      auth: input.auth,
      credentialKeys,
      identityRule: input.identityRule,
      mintedCredentialKeys,
      surfaces: surfaces.map((surface) => ({
        name: surface.name,
        cursorTerminalNull: surface.cursorTerminalNull,
        progress: {
          target: surface.progress.target,
          continuation: surface.progress.continuation,
          forwardCheckpoint: surface.progress.forwardCheckpoint,
          coverage: surface.progress.coverage,
          liveFence: surface.progress.liveFence,
        },
        receiverInterfaceHash: surface.receiverInterfaceHash,
      })),
    }),
  );
}

export function validateV1ProgressContract(
  progress: V1ProgressContract,
  label = "v1 progress contract",
): V1ProgressContract {
  if (!isRecord(progress)) throw new Error(`${label} must be an object`);
  assertExactKeys(
    progress,
    ["continuation", "coverage", "forwardCheckpoint", "liveFence", "target"],
    label,
  );
  return {
    target: requireOneOf(
      progress.target,
      [
        "bounded_window",
        "forward_and_backfill",
        "full_snapshot",
        "per_identity_history",
        "programmable_fixture",
      ] as const,
      `${label}.target`,
    ),
    continuation: requireOneOf(
      progress.continuation,
      ["opaque_cursor"] as const,
      `${label}.continuation`,
    ),
    forwardCheckpoint: requireOneOf(
      progress.forwardCheckpoint,
      ["opaque_cursor"] as const,
      `${label}.forwardCheckpoint`,
    ),
    coverage: requireOneOf(
      progress.coverage,
      ["per_identity_range", "range", "snapshot", "tracked_identity_set", "unknown"] as const,
      `${label}.coverage`,
    ),
    liveFence: requireOneOf(
      progress.liveFence,
      ["none", "subscription_ack"] as const,
      `${label}.liveFence`,
    ),
  };
}

/** Canonical v1 receiver interface identity shared by catalog declarations and
 * receiver owners. The surface is part of the interface name; envelope/profile
 * version changes mint a different hash.
 */
export function v1ReceiverInterfaceContract(surface: string): V1ReceiverInterfaceContract {
  requireString(surface, "receiver interface surface");
  return {
    envelope: "magnis.source/1",
    receiver: `magnis.sync.receiver/${surface}`,
    version: "1",
  };
}

export function v1ReceiverInterfaceHash(surface: string): string {
  const contract = v1ReceiverInterfaceContract(surface);
  return sha256(canonicalJson({
    envelope: contract.envelope,
    receiver: contract.receiver,
    version: contract.version,
  }));
}
