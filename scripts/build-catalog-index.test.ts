/** The catalog artifact the app installs from.
 *
 * Driven as a subprocess rather than imported: the builder is a script
 * that runs on import, so there is nothing to unit-test in isolation —
 * and what matters here is the ARTIFACT, which only a real run produces.
 *
 * @test-id: tst_pub_catalog_index_001
 * @deterministic: yes — the builder is required to be, and one of these
 *   tests is that claim.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const ROOT = join(import.meta.dir, "..");
const SHA = "0123456789abcdef0123456789abcdef01234567";
const SLUG = "owner/repo";
const CI_WORKFLOW = join(ROOT, ".github", "workflows", "ci.yml");

interface Entry {
  kind: string;
  id: string;
  version: string;
  archive: { name: string; sha256: string };
  files?: unknown;
  icon_url?: string;
  details_url?: string;
}

interface Index {
  schema_version: number;
  generated_from: string;
  packages: Entry[];
}

interface Curation {
  schema_version: number;
  capabilities: {
    id: string;
    title: string;
    modules: string[];
    source: string | null;
    people: boolean;
    local: boolean;
  }[];
  always: string[];
  hard_deps: Record<string, string[]>;
  install_order: string[];
}

const outputs: string[] = [];

function build(): { out: string; index: Index } {
  const out = mkdtempSync(join(tmpdir(), "pub-catalog-"));
  outputs.push(out);
  const run = Bun.spawnSync(["bun", "scripts/build-catalog-index.ts"], {
    cwd: ROOT,
    env: {
      ...process.env,
      CATALOG_OUT: out,
      GITHUB_SHA: SHA,
      GITHUB_REPOSITORY: SLUG,
    },
  });
  if (run.exitCode !== 0) {
    throw new Error(`builder failed: ${run.stderr.toString("utf8")}`);
  }
  return { out, index: JSON.parse(readFileSync(join(out, "index.json"), "utf8")) as Index };
}

let first: { out: string; index: Index };

beforeAll(() => {
  // The builder refuses without `plugins_dist`, and refusing is right — it
  // will not silently publish a catalog built from stale bundles. But that
  // makes the bundles this test's PRECONDITION, not something to inherit
  // from whatever command ran before it. Locally `plugins_dist` was left
  // over from an earlier build and this passed; CI runs the tooling tests
  // without building plugins first, and it failed there for exactly that
  // reason.
  const bundles = Bun.spawnSync(["bun", "scripts/build-plugins.ts"], { cwd: ROOT });
  if (bundles.exitCode !== 0) {
    throw new Error(`build-plugins failed: ${bundles.stderr.toString("utf8")}`);
  }
  first = build();
}, 600_000);

afterAll(() => {
  for (const dir of outputs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("tst_pub_catalog_index_001", () => {
  test("every package is ONE flat asset named after its kind and id", () => {
    expect(first.index.packages.length).toBeGreaterThan(0);
    for (const pkg of first.index.packages) {
      expect(pkg.archive.name).toBe(`${pkg.kind}__${pkg.id}.tgz`);
      // Flat: a release asset name cannot carry a path separator, so a
      // name with one would 404 for every client.
      expect(pkg.archive.name).not.toContain("/");
      expect(existsSync(join(first.out, pkg.archive.name))).toBe(true);
    }
  });

  test("the recorded hash is the hash of the asset on disk", () => {
    for (const pkg of first.index.packages) {
      const bytes = readFileSync(join(first.out, pkg.archive.name));
      expect(pkg.archive.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    }
  });

  test("no package carries the retired per-file payload", () => {
    for (const pkg of first.index.packages) {
      expect(pkg.files).toBeUndefined();
    }
  });

  test("card links are pinned to the generated commit, never to a branch", () => {
    const linked = first.index.packages.filter((pkg) => pkg.icon_url !== undefined);
    // The catalog ships icons; a run that produced none would pass the
    // loop below vacuously and hide a broken link builder.
    expect(linked.length).toBeGreaterThan(0);
    for (const pkg of linked) {
      expect(pkg.icon_url).toContain(`/${SHA}/`);
      expect(pkg.icon_url).toContain(SLUG);
      // A branch name here would keep resolving while silently meaning
      // different bytes after every push — the property being bought.
      expect(pkg.icon_url).not.toContain("/main/");
      expect(pkg.icon_url).not.toContain("/staging/");
    }
    expect(first.index.generated_from).toBe(SHA);
  });

  test("the staging scratch directory is not published", () => {
    expect(readdirSync(first.out)).not.toContain(".stage");
  });

  test("the curation names capabilities the catalog can actually install", () => {
    const curation = JSON.parse(
      readFileSync(join(first.out, "onboarding.json"), "utf8"),
    ) as Curation;
    const carried = new Set(first.index.packages.map((entry) => entry.id));
    expect(curation.capabilities.length).toBeGreaterThan(0);
    for (const capability of curation.capabilities) {
      for (const id of capability.modules) {
        expect(carried.has(id), `capability '${capability.id}' names module '${id}'`).toBe(true);
      }
      if (capability.source !== null) {
        expect(
          carried.has(capability.source),
          `capability '${capability.id}' names source '${capability.source}'`,
        ).toBe(true);
      }
    }
  });

  test("the always-installed set is DERIVED from tier, not restated", () => {
    // `triggers/manifest.toml` says `tier = "system"`. The application used
    // to carry `ALWAYS = ["triggers"]` as a literal — a copy of a fact the
    // package already stated, which is exactly the duplicate this document
    // exists to delete rather than relocate.
    const curation = JSON.parse(
      readFileSync(join(first.out, "onboarding.json"), "utf8"),
    ) as Curation;
    expect(curation.always).toContain("triggers");
    const declaresSystem = readFileSync(
      join(ROOT, "plugins", "modules", "triggers", "manifest.toml"),
      "utf8",
    ).includes('tier = "system"');
    expect(declaresSystem).toBe(true);
  });

  test("hard dependencies come from the manifests and name only modules", () => {
    const curation = JSON.parse(
      readFileSync(join(first.out, "onboarding.json"), "utf8"),
    ) as Curation;
    // `contacts` calls `email.ensure_address`, so it hard-depends on email.
    expect(curation.hard_deps["contacts"]).toContain("email");
    // It only READS `companies.company`, which never blocks enabling — a
    // soft edge, and the hand-written table this replaced had them merged.
    expect(curation.hard_deps["contacts"] ?? []).not.toContain("companies");
    // `x` calls `source.sync.bootstrap`; `source` is the HOST, not a
    // package, and publishing it would send the wizard installing a module
    // nobody wrote.
    const modules = new Set(
      first.index.packages.filter((entry) => entry.kind === "module").map((entry) => entry.id),
    );
    for (const deps of Object.values(curation.hard_deps)) {
      for (const dep of deps) {
        expect(modules.has(dep), `hard dependency '${dep}' must be a module`).toBe(true);
      }
    }
  });

  test("the install order puts every hard dependency before its dependent", () => {
    const curation = JSON.parse(
      readFileSync(join(first.out, "onboarding.json"), "utf8"),
    ) as Curation;
    const at = (id: string): number => curation.install_order.indexOf(id);
    for (const [id, deps] of Object.entries(curation.hard_deps)) {
      for (const dep of deps) {
        expect(at(dep), `${dep} must install before ${id}`).toBeLessThan(at(id));
      }
    }
    // Every module the catalog carries has a place in it.
    for (const entry of first.index.packages) {
      if (entry.kind === "module") expect(curation.install_order).toContain(entry.id);
    }
  });

  test("two builds of the same tree produce byte-identical assets", () => {
    // Without this the archives' hashes change every run, so every index
    // differs from the last and every client re-downloads a catalog that
    // did not change. It is why the builder fixes mtimes, sorts entries
    // and gzips with -n rather than trusting tar's defaults.
    const second = build();
    for (const pkg of first.index.packages) {
      const a = readFileSync(join(first.out, pkg.archive.name));
      const b = readFileSync(join(second.out, pkg.archive.name));
      expect(createHash("sha256").update(b).digest("hex")).toBe(
        createHash("sha256").update(a).digest("hex"),
      );
    }
  }, 300_000);
});

/**
 * @test-id: tst_pub_catalog_release_001
 * @scenario: scn_catalog_release_provenance_001
 * @covers: .github/workflows/ci.yml::catalog Publish the channel
 * @deterministic: yes
 * @fixtures: tracked GitHub Actions workflow
 *
 * Test environment: static release workflow inspection.
 * Clients: direct file read.
 * Mocks: none.
 * Data: .github/workflows/ci.yml.
 */
describe("tst_pub_catalog_release_001 catalog release provenance", () => {
  test("serializes each channel and rejects a stale run before destructive publication", () => {
    const workflow = readFileSync(CI_WORKFLOW, "utf8");

    expect(workflow).toContain(
      "    concurrency:\n" +
        "      group: catalog-${{ github.ref }}\n" +
        "      cancel-in-progress: false",
    );
    const remoteGuard = workflow.indexOf(
      'REMOTE_HEAD="$(git ls-remote origin "${GITHUB_REF}" | cut -f1)"',
    );
    const deleteRelease = workflow.indexOf('gh release delete "$TAG" --cleanup-tag --yes');
    expect(remoteGuard).toBeGreaterThanOrEqual(0);
    expect(workflow).toContain(
      'if [ "$REMOTE_HEAD" != "$GITHUB_SHA" ]; then\n' +
        '            echo "refusing stale catalog publication: ${GITHUB_REF} is ${REMOTE_HEAD}, expected ${GITHUB_SHA}" >&2\n' +
        "            exit 1\n" +
        "          fi",
    );
    expect(remoteGuard).toBeLessThan(deleteRelease);
  });

  test("forces the channel tag to the built commit before creating from the verified tag", () => {
    const workflow = readFileSync(CI_WORKFLOW, "utf8");

    expect(workflow).toContain(
      'if gh release view "$TAG" >/dev/null 2>&1; then\n' +
        '            gh release delete "$TAG" --cleanup-tag --yes\n' +
        "          fi",
    );
    expect(workflow).not.toContain('gh release delete "$TAG" --cleanup-tag --yes || true');
    expect(workflow).toContain(
      'git push --force origin "${GITHUB_SHA}:refs/tags/${TAG}"\n' +
        '          gh release create "$TAG" \\\n' +
        "            --verify-tag \\",
    );
    expect(workflow).not.toContain(
      'gh release create "$TAG" \\\n' +
        '            --target "$GITHUB_SHA" \\',
    );
    expect(workflow).toContain("catalog/receipt-*.json catalog/*.tgz");
    expect(workflow).not.toContain("catalog/receipts/*.json");
  });
});
