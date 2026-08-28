import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import type { SourceCertificationReceipt } from "@magnis/connector-sdk";
import {
  accountCompatibilityHash,
  encodeSourceCertificationReceipt,
  v1ReceiverInterfaceHash,
} from "../packages/testkit/receipt";

import {
  discoverSourceReleaseManifests,
  discoverStagedCatalog,
  hashStagedPackage,
  mintSourceCertificationReceipt,
  reconcileSourceReceiptFixtures,
  writeCertifiedCatalogIndexes,
} from "./certify-sources";
import { stageSourcePackage } from "./build-catalog-index";

const roots: string[] = [];

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "magnis-certifier-"));
  roots.push(root);
  return root;
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function sourceManifest(id: string): string {
  const receiverInterfaceHash = v1ReceiverInterfaceHash("email");
  return [
    `id = "${id}"`,
    'version = "1.0.0"',
    `title = "${id}"`,
    'summary = "fixture"',
    'publisher = "ai.magnis"',
    'surfaces = ["email"]',
    '',
    '[auth]',
    'type = "oauth2"',
    '',
    '[sync]',
    'mode = "poll"',
    'interval_secs = 30',
    '',
    '[certification]',
    'disposition = "admissible"',
    'protocol = "magnis.source/1"',
    'authority = "module_sync"',
    'release_tier = "production"',
    'delivery = "poll"',
    'poll_interval_secs = 30',
    `server_info_name = "${id}"`,
    'server_info_version = "1.0.0"',
    'runtime_kind = "connector_sdk"',
    'runtime_version = "0.1.0"',
    'advertised_tools = ["magnis.sync.fetch"]',
    'callable_operations = ["initialize", "magnis.sync.fetch", "tools/list"]',
    `scenario_ids = ["scn_src_v1_${id.replaceAll("-", "_")}_001"]`,
    '',
    '[certification.account_compatibility]',
    'auth = "oauth2"',
    'identity_rule = "verified_fixture_subject"',
    'credential_keys = ["refresh_token"]',
    'minted_credential_keys = ["refresh_token"]',
    'migrates_from = []',
    '',
    '[[certification.account_compatibility.surfaces]]',
    'name = "email"',
    'cursor_terminal_null = "retain"',
    'progress = { target = "forward_and_backfill", continuation = "opaque_cursor", forward_checkpoint = "opaque_cursor", coverage = "range", live_fence = "none" }',
    `receiver_interface_hash = "${receiverInterfaceHash}"`,
    '',
  ].join("\n");
}

function stageSource(root: string, id: string): string {
  const packageRoot = join(root, "packages", "source", id);
  mkdirSync(join(packageRoot, "dist"), { recursive: true });
  writeFileSync(join(packageRoot, "manifest.toml"), sourceManifest(id));
  writeFileSync(
    join(packageRoot, "dist", "main.js"),
    `import { createInterface } from "node:readline";
const rl = createInterface({ input: process.stdin });
for await (const line of rl) {
  const request = JSON.parse(line);
  let result;
  let error;
  if (request.method === "initialize") result = {
    protocolVersion: "2025-06-18",
    capabilities: { tools: {}, experimental: { magnis: { sync: { surfaces: ["email"], mode: "poll", interval_secs: 30 } } } },
    serverInfo: { name: ${JSON.stringify(id)}, version: "1.0.0" },
  };
  else if (request.method === "tools/list") result = { tools: [{ name: "magnis.sync.fetch" }] };
  else if (request.params?.name === "magnis.sync.fetch") error = { code: -32602, message: "surface required" };
  else error = { code: -32601, message: "unknown tool" };
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, ...(error ? { error } : { result }) }) + "\\n");
}
`,
  );
  return packageRoot;
}

function stageModule(root: string, id: string): void {
  const packageRoot = join(root, "packages", "module", id);
  mkdirSync(packageRoot, { recursive: true });
  writeFileSync(
    join(packageRoot, "manifest.toml"),
    `id = ${JSON.stringify(id)}\nversion = "1.0.0"\ntitle = ${JSON.stringify(id)}\nsummary = "fixture"\npublisher = "ai.magnis"\n`,
  );
  writeFileSync(join(packageRoot, "bundle.json"), "{}\n");
}

function receipt(
  sourceId: string,
  packageHash: string,
  definitionHash: string,
): SourceCertificationReceipt {
  const receiverInterfaceHash = v1ReceiverInterfaceHash("email");
  return {
    packageHash,
    sourceId,
    protocol: "magnis.source/1",
    definitionHash,
    accountCompatibility: {
      hash: accountCompatibilityHash({
        auth: "oauth2",
        identityRule: "verified_fixture_subject",
        credentialKeys: ["refresh_token"],
        mintedCredentialKeys: ["refresh_token"],
        surfaces: [
          {
            name: "email",
            cursorTerminalNull: "retain",
            progress: {
              target: "forward_and_backfill",
              continuation: "opaque_cursor",
              forwardCheckpoint: "opaque_cursor",
              coverage: "range",
              liveFence: "none",
            },
            receiverInterfaceHash,
          },
        ],
      }),
      migratesFrom: [],
    },
    authority: "module_sync",
    releaseTier: "production",
    delivery: "poll",
    auth: "oauth2",
    surfaces: ["email"],
    advertisedTools: ["magnis.sync.fetch"],
    callableOperations: ["initialize", "magnis.sync.fetch", "tools/list"],
    initialize: {
      mcpProtocolVersion: "2025-06-18",
      serverInfoName: sourceId,
      serverInfoVersion: "1.0.0",
      capabilitiesHash: sha256(`capabilities:${sourceId}`),
    },
    interfaceHashes: [receiverInterfaceHash],
    runtime: {
      kind: "connector_sdk",
      implementationHash: sha256(`runtime:${sourceId}`),
      version: "0.1.0",
    },
    scenarioIds: [`scn_src_v1_${sourceId.replaceAll("-", "_")}_001`],
    certifierVersion: "1",
    testkitVersion: "1",
    matrixVersion: "v1",
  };
}

function writeReceiptInput(
  root: string,
  sourceId: string,
  packageHash: string,
  definitionHash: string,
): void {
  const receipts = join(root, "receipt-input");
  mkdirSync(receipts, { recursive: true });
  writeFileSync(
    join(receipts, `${packageHash}.json`),
    encodeSourceCertificationReceipt(receipt(sourceId, packageHash, definitionHash)),
  );
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/**
 * @test-id: tst_cat_src_cert_001
 * @scenario: scn_src_certification_001
 * @covers: scripts/certify-sources.ts::discoverStagedCatalog
 * @deterministic: yes
 * @fixtures: temporary staged catalog tree
 *
 * Test environment: staged catalog packages in a test-owned temporary directory.
 * Clients: direct calls.
 * Mocks: none.
 * Data: two Source packages intentionally created in reverse lexical order.
 */
describe("tst_cat_src_cert_001 staged Source certification", () => {
  test("discovers one sorted staged set and binds hashes to exact package bytes", () => {
    const root = temporaryRoot();
    const zetaRoot = stageSource(root, "zeta");
    stageModule(root, "contacts");
    const alphaRoot = stageSource(root, "alpha");

    const discovered = discoverStagedCatalog(root);
    expect(discovered.map((entry) => `${entry.kind}:${entry.id}`)).toEqual([
      "module:contacts",
      "source:alpha",
      "source:zeta",
    ]);
    expect(discovered.find((entry) => entry.id === "alpha")?.packageHash).toBe(
      hashStagedPackage(alphaRoot),
    );

    const before = hashStagedPackage(zetaRoot);
    writeFileSync(join(zetaRoot, "dist", "main.js"), "export const id = 'changed';\n");
    expect(hashStagedPackage(zetaRoot)).not.toBe(before);
  });

  test("uses the app Source contract for definition identity, not certification metadata", () => {
    const root = temporaryRoot();
    const packageRoot = stageSource(root, "alpha");
    const manifestPath = join(packageRoot, "manifest.toml");
    const original = discoverStagedCatalog(root).find(({ id }) => id === "alpha");
    if (original === undefined) throw new Error("fixture Source was not discovered");

    writeFileSync(
      manifestPath,
      readFileSync(manifestPath, "utf8").replace(
        'server_info_version = "1.0.0"',
        'server_info_version = "1.0.1"',
      ),
    );
    const recertified = discoverStagedCatalog(root).find(({ id }) => id === "alpha");
    if (recertified === undefined) throw new Error("recertified Source was not discovered");
    expect(recertified.definitionHash).toBe(original.definitionHash);
    expect(recertified.packageHash).not.toBe(original.packageHash);

    writeFileSync(
      manifestPath,
      readFileSync(manifestPath, "utf8").replace(
        'version = "1.0.0"',
        'version = "2.0.0"',
      ),
    );
    const upgraded = discoverStagedCatalog(root).find(({ id }) => id === "alpha");
    if (upgraded === undefined) throw new Error("upgraded Source was not discovered");
    expect(upgraded.definitionHash).not.toBe(original.definitionHash);
  });

  test("emits external receipts and both indexes from the same discovered set", async () => {
    const root = temporaryRoot();
    stageSource(root, "zeta");
    stageModule(root, "contacts");
    stageSource(root, "alpha");

    const discovered = discoverStagedCatalog(root);
    for (const entry of discovered) {
      if (entry.kind === "source") {
        const exact = await mintSourceCertificationReceipt(entry);
        const receipts = join(root, "receipt-input");
        mkdirSync(receipts, { recursive: true });
        writeFileSync(join(receipts, `${entry.packageHash}.json`), encodeSourceCertificationReceipt(exact));
      }
    }

    const result = await writeCertifiedCatalogIndexes({
      catalogOut: root,
      generatedFrom: "fixture-sha",
      receiptInputDir: join(root, "receipt-input"),
      discovered,
    });
    const legacy = JSON.parse(readFileSync(join(root, "index.json"), "utf8")) as {
      schema_version: number;
      packages: Array<{ kind: string; id: string }>;
    };
    const strict = JSON.parse(readFileSync(join(root, "index.v2.json"), "utf8")) as {
      schema_version: number;
      packages: Array<{
        kind: string;
        id: string;
        package_hash?: string;
        certification?: { path: string; sha256: string };
      }>;
    };

    expect(legacy.schema_version).toBe(1);
    expect(strict.schema_version).toBe(2);
    expect(legacy.packages.map(({ kind, id }) => `${kind}:${id}`)).toEqual(
      strict.packages.map(({ kind, id }) => `${kind}:${id}`),
    );
    expect(result.discovered).toBe(discovered);
    for (const entry of strict.packages) {
      if (entry.kind !== "source") continue;
      expect(entry.package_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(entry.certification?.path).toBe(`receipts/${entry.package_hash}.json`);
      expect(entry.certification?.sha256).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(readFileSync(join(root, entry.certification?.path ?? ""), "utf8")).toContain(
        `"packageHash":"${entry.package_hash}"`,
      );
    }
  });

  test("fails closed when a Source has no exact receipt instead of publishing a v1 fallback", async () => {
    const root = temporaryRoot();
    stageSource(root, "alpha");
    const discovered = discoverStagedCatalog(root);

    await expect(
      writeCertifiedCatalogIndexes({
        catalogOut: root,
        generatedFrom: "fixture-sha",
        receiptInputDir: join(root, "receipt-input"),
        discovered,
      }),
    ).rejects.toThrow("source 'alpha' has no receipt for staged package");

    const source = discovered.find((entry) => entry.kind === "source");
    if (source === undefined) throw new Error("fixture source was not discovered");
    writeReceiptInput(root, source.id, source.packageHash, sha256("wrong-definition"));
    await expect(
      writeCertifiedCatalogIndexes({
        catalogOut: root,
        generatedFrom: "fixture-sha",
        receiptInputDir: join(root, "receipt-input"),
        discovered,
      }),
    ).rejects.toThrow("receipt definitionHash does not match staged definition");
  });

  test("reconciles generated receipt fixtures to one exact package-hash set", () => {
    const root = temporaryRoot();
    const receipts = join(root, "receipts");
    mkdirSync(receipts, { recursive: true });
    const keep = `sha256:${"1".repeat(64)}`;
    const stale = `sha256:${"2".repeat(64)}`;
    writeFileSync(join(receipts, `${keep}.json`), "{}\n");
    writeFileSync(join(receipts, `${stale}.json`), "{}\n");

    reconcileSourceReceiptFixtures(receipts, [keep]);
    expect(readdirSync(receipts)).toEqual([`${keep}.json`]);

    rmSync(join(receipts, `${keep}.json`));
    expect(() => reconcileSourceReceiptFixtures(receipts, [keep])).toThrow(
      `receipt fixture '${keep}.json' is missing`,
    );
  });

  test("rejects a Source whose manifest omits an authored T1 declaration", () => {
    const root = temporaryRoot();
    const packageRoot = stageSource(root, "alpha");
    writeFileSync(
      join(packageRoot, "manifest.toml"),
      sourceManifest("alpha").replace('protocol = "magnis.source/1"\n', ""),
    );

    expect(() => discoverStagedCatalog(root)).toThrow(
      "source 'alpha' certification.protocol must be magnis.source/1",
    );
  });

  test("discovers every release manifest once and requires an explicit disposition", () => {
    const root = temporaryRoot();
    const sourcesRoot = join(root, "sources");
    const admittedRoot = join(sourcesRoot, "alpha");
    const blockedRoot = join(sourcesRoot, "zeta");
    mkdirSync(admittedRoot, { recursive: true });
    mkdirSync(blockedRoot, { recursive: true });
    writeFileSync(join(admittedRoot, "manifest.toml"), sourceManifest("alpha"));
    writeFileSync(
      join(blockedRoot, "manifest.toml"),
      [
        'id = "zeta"',
        'version = "1.0.0"',
        '',
        '[certification]',
        'disposition = "inadmissible"',
        'reason = "external command is not dependency-closed"',
        '',
      ].join("\n"),
    );

    expect(discoverSourceReleaseManifests(sourcesRoot).map((entry) => ({
      id: entry.id,
      disposition: entry.disposition,
    }))).toEqual([
      { id: "alpha", disposition: "admissible" },
      { id: "zeta", disposition: "inadmissible" },
    ]);

    const unlistedRoot = join(sourcesRoot, "unlisted");
    mkdirSync(unlistedRoot, { recursive: true });
    writeFileSync(
      join(unlistedRoot, "manifest.toml"),
      'id = "unlisted"\nversion = "1.0.0"\n',
    );
    expect(() => discoverSourceReleaseManifests(sourcesRoot)).toThrow(
      "source 'unlisted' has no explicit certification disposition",
    );
  });

  test("packages every manifest-referenced schema and rejects an incomplete artifact", () => {
    const root = temporaryRoot();
    const sourceRoot = join(root, "sources", "alpha");
    const stagedRoot = join(root, "staged", "alpha");
    mkdirSync(join(sourceRoot, "src"), { recursive: true });
    mkdirSync(join(sourceRoot, "schemas", "dataset-actions"), { recursive: true });
    writeFileSync(join(sourceRoot, "src", "main.ts"), "process.stdin.resume();\n");
    writeFileSync(
      join(sourceRoot, "schemas", "dataset-actions", "emit.json"),
      '{"type":"object"}\n',
    );
    writeFileSync(
      join(sourceRoot, "manifest.toml"),
      sourceManifest("alpha").replace(
        "\n[certification]\n",
        '\n[dataset]\n\n[[dataset.actions]]\nname = "emit"\nschema = "schemas/dataset-actions/emit.json"\n\n[certification]\n',
      ),
    );

    const [release] = discoverSourceReleaseManifests(join(root, "sources"));
    if (release === undefined || release.disposition !== "admissible") {
      throw new Error("admissible fixture Source was not discovered");
    }
    stageSourcePackage(release, stagedRoot);
    expect(readFileSync(join(stagedRoot, "schemas", "dataset-actions", "emit.json"), "utf8"))
      .toBe('{"type":"object"}\n');

    rmSync(join(stagedRoot, "schemas"), { recursive: true, force: true });
    const catalogRoot = join(root, "catalog");
    mkdirSync(join(catalogRoot, "packages", "source"), { recursive: true });
    renameSync(stagedRoot, join(catalogRoot, "packages", "source", "alpha"));
    expect(() => discoverStagedCatalog(catalogRoot)).toThrow(
      "source 'alpha' referenced file 'schemas/dataset-actions/emit.json' is missing",
    );
  });

  test("rejects a staged Source that delegates execution to an external command", () => {
    const root = temporaryRoot();
    const packageRoot = stageSource(root, "alpha");
    writeFileSync(
      join(packageRoot, "manifest.toml"),
      `${sourceManifest("alpha")}\n[spawn]\ncommand = "npx"\nargs = ["-y", "remote-package"]\n`,
    );

    expect(() => discoverStagedCatalog(root)).toThrow(
      "source 'alpha' spawn must execute root-local dist/main.js",
    );
  });
});
