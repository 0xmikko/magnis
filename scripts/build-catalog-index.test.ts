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

import { checkDependencyGraph } from "./build-catalog-index";

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
  schemaVersion: number;
  modules: string[];
}

interface IndexV3 {
  modules: { id: string; tier: string; dependsOn: string[] }[];
  sources: { id: string; dependsOn: string[] }[];
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

afterAll(() => {
  for (const dir of outputs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * @test-id: tst_pub_catalog_index_003
 * @test-id: tst_pub_catalog_index_004
 * @test-id: tst_pub_catalog_index_005
 * @scenario: scn_catalog_dependency_graph_001
 * @covers: scripts/build-catalog-index.ts::checkDependencyGraph
 * @deterministic: yes
 * @fixtures: in-memory manifests
 *
 * Every package names its direct dependencies in dependsOn, and the build is
 * the one place that sees every manifest at once, so it refuses a graph the
 * host could not install: a reference to a module outside the closure, a
 * cycle, and a source feeding a module it does not depend on.
 */
describe("tst_pub_catalog_index dependency graph checks", () => {
  const projects = { dependsOn: [] };
  const contacts = { dependsOn: [] };

  test("tst_pub_catalog_index_003 a module linking to a module outside its closure fails the build", () => {
    const meetings = {
      dependsOn: ["contacts"],
      links: [{ from: "meetings.calendar_event", to: "projects.project" }],
    };
    expect(() =>
      checkDependencyGraph(new Map([["meetings", meetings], ["contacts", contacts], ["projects", projects]]), new Map()),
    ).toThrow("module 'meetings': 'projects.project' belongs to module 'projects', outside its dependsOn closure");
    const creating = { dependsOn: [], permissions: { create: ["contacts.person"] } };
    expect(() => checkDependencyGraph(new Map([["addressbook", creating], ["contacts", contacts]]), new Map())).toThrow(
      "module 'addressbook': 'contacts.person' belongs to module 'contacts', outside its dependsOn closure",
    );
    expect(() =>
      checkDependencyGraph(new Map([["email", { dependsOn: ["web"] }]]), new Map()),
    ).toThrow("module 'email': dependsOn 'web' is not a catalog module");
  });

  test("tst_pub_catalog_index_004 a dependency cycle fails the build", () => {
    expect(() =>
      checkDependencyGraph(
        new Map([["email", { dependsOn: ["contacts"] }], ["contacts", { dependsOn: ["email"] }]]),
        new Map(),
      ),
    ).toThrow("dependency cycle: contacts -> email -> contacts");
  });

  test("tst_pub_catalog_index_005 a source feeding a module outside its closure fails the build", () => {
    const modules = new Map([
      ["contacts", contacts],
      ["email", { dependsOn: ["contacts"], surfaces: { email: {} } }],
      ["meetings", { dependsOn: ["email"], surfaces: { meetings: {} } }],
    ]);
    expect(() =>
      checkDependencyGraph(modules, new Map([["google", { dependsOn: ["email"], surfaces: ["email", "meetings"] }]])),
    ).toThrow("source 'google': surface 'meetings' belongs to module 'meetings', outside its dependsOn closure");
    // A surface no module declares is not checked, and a closed graph passes.
    expect(() =>
      checkDependencyGraph(modules, new Map([["google", { dependsOn: ["meetings"], surfaces: ["email", "meetings", "smk"] }]])),
    ).not.toThrow();
  });
});

describe("tst_pub_catalog_index_001", () => {
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

  /**
   * @test-id: tst_cat_layout_002
   * @scenario: scn_google_pull_007
   * @covers: scripts/build-catalog-index.ts
   * @deterministic: yes
   * @fixtures: root Module and Source manifests and a built catalog index
   */
  test("tst_cat_layout_002 publishes Module and Source identities from the root directories", () => {
    expect(first.index.packages.some((entry) => entry.kind === "module")).toBe(true);
    expect(first.index.packages.some((entry) => entry.kind === "source")).toBe(true);
    for (const entry of first.index.packages) {
      const directory = entry.kind === "module" ? "modules" : "sources";
      expect(existsSync(join(ROOT, directory, entry.id, "manifest.toml"))).toBe(true);
    }
  });

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

  /**
   * @test-id: tst_pub_catalog_index_002
   * @scenario: scn_catalog_module_install_001
   * @covers: modules/<module>/manifest.toml sync-surface declarations
   * @deterministic: yes
   * @fixtures: checked-in module manifests
   */
  test("tst_pub_catalog_index_002 every module surface declares reconciliation", () => {
    const modulesRoot = join(ROOT, "modules");
    for (const entry of readdirSync(modulesRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifestPath = join(modulesRoot, entry.name, "manifest.toml");
      if (!existsSync(manifestPath)) continue;
      const manifest = readFileSync(manifestPath, "utf8");
      const surfaceHeaders = [...manifest.matchAll(/^\[surfaces\.([^\n]+)]\s*$/gm)];
      for (const header of surfaceHeaders) {
        const surface = header[1];
        const start = (header.index ?? 0) + header[0].length;
        const tail = manifest.slice(start);
        const nextHeader = tail.search(/^\[/m);
        const body = nextHeader === -1 ? tail : tail.slice(0, nextHeader);
        expect(
          body,
          `${entry.name}:${surface ?? "unknown"} must declare reconciliation`,
        ).toMatch(/^reconciliation\s*=/m);
      }
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

  test("onboarding.json version 2 names default modules the catalog carries", () => {
    const curation = JSON.parse(
      readFileSync(join(first.out, "onboarding.json"), "utf8"),
    ) as Curation;
    expect(curation.schemaVersion).toBe(2);
    expect(curation.modules.length).toBeGreaterThan(0);
    const modules = new Set(
      first.index.packages.filter((entry) => entry.kind === "module").map((entry) => entry.id),
    );
    for (const id of curation.modules) {
      expect(modules.has(id), `default module '${id}'`).toBe(true);
    }
  });

  test("the system tier is read from the manifests, not restated", () => {
    const index = JSON.parse(readFileSync(join(first.out, "index.v3.json"), "utf8")) as IndexV3;
    const system = index.modules.filter((entry) => entry.tier === "system").map((entry) => entry.id);
    for (const id of system) {
      const declaresSystem = readFileSync(
        join(ROOT, "modules", id, "manifest.toml"),
        "utf8",
      ).includes('tier = "system"');
      expect(declaresSystem, `${id} must declare its system lifecycle`).toBe(true);
    }
    expect(system).toContain("file");
    expect(system).toContain("triggers");
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
