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
