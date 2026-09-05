/** tst_pub_pkg_source_launchable_001 — a source, as the channel ships it,
 * can actually be launched.
 *
 * Nothing checked this. Every stand that exercised a connector did so from a
 * CHECKOUT, where `src/main.ts` sits next to the manifest and the host's
 * spawn convention finds it. The published archive has no `src/` — the
 * packager bundles it to `dist/main.js` — and copies the manifest verbatim,
 * so the manifest names an entrypoint that is not in the package. The host's
 * loader then refuses it: "no [spawn] and no src/main.ts next to the
 * manifest — the connector cannot be launched".
 *
 * The same blindness covers files a manifest REFERENCES: `mock-gmail`
 * declares two dataset actions by schema path, and those schemas were not
 * packaged either, so its manifest fails to load before spawn is even
 * reached.
 *
 * Both are properties of the ARCHIVE, so they are asserted over the archive:
 * build the catalog, read each source's package back, and check that what
 * the manifest points at is inside it.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeAll, describe, expect, test } from "bun:test";
import { parse as parseToml } from "smol-toml";

const ROOT = join(import.meta.dir, "..");
const CATALOG = join(ROOT, "catalog");

interface SpawnBlock {
  readonly command?: string;
  readonly args?: readonly string[];
}

interface DatasetAction {
  readonly name?: string;
  readonly schema?: string;
}

interface SourceManifest {
  readonly id?: string;
  readonly spawn?: SpawnBlock;
  readonly dataset?: { readonly actions?: readonly DatasetAction[] };
}

let unpacked: string;

/** Unpack every `source__*.tgz` the catalog build produced. */
function unpackSources(dest: string): readonly string[] {
  const ids: string[] = [];
  for (const name of readdirSync(CATALOG)) {
    if (!name.startsWith("source__") || !name.endsWith(".tgz")) continue;
    const id = name.slice("source__".length, -".tgz".length);
    const dir = join(dest, id);
    execFileSync("mkdir", ["-p", dir]);
    execFileSync("tar", ["-xzf", join(CATALOG, name), "-C", dir]);
    ids.push(id);
  }
  return ids.sort();
}

let sourceIds: readonly string[] = [];

beforeAll(() => {
  // The archives under `catalog/` are what CI publishes; build them here so
  // the assertion is about the current packager rather than about whatever
  // was last left on disk.
  execFileSync("bun", [join(ROOT, "scripts", "build-plugins.ts")], {
    cwd: ROOT,
    stdio: "ignore",
  });
  execFileSync("bun", [join(ROOT, "scripts", "build-catalog-index.ts")], {
    cwd: ROOT,
    stdio: "ignore",
  });
  unpacked = mkdtempSync(join(tmpdir(), "magnis-pkg-sources-"));
  sourceIds = unpackSources(unpacked);
});

describe("tst_pub_pkg_source_launchable_001", () => {
  test("the catalog publishes sources at all", () => {
    expect(sourceIds.length).toBeGreaterThan(0);
  });

  test("every published source names an entrypoint that is IN the package", () => {
    const broken: string[] = [];
    for (const id of sourceIds) {
      const dir = join(unpacked, id);
      const manifest = parseToml(readFileSync(join(dir, "manifest.toml"), "utf8")) as SourceManifest;

      // The host's rule, in `backend/src/sources/mcp/manifest-loader.ts`:
      // an explicit [spawn], or `src/main.ts` beside the manifest. Anything
      // else and the connector cannot be launched.
      const spawn = manifest.spawn;
      if (!spawn) {
        if (!existsSync(join(dir, "src", "main.ts"))) {
          broken.push(`${id}: no [spawn] and no src/main.ts in the archive`);
        }
        continue;
      }
      // A [spawn] that names a script must name one that shipped.
      const script = (spawn.args ?? []).find((arg) => /\.(ts|js|mjs)$/.test(arg));
      if (script !== undefined && !existsSync(join(dir, script))) {
        broken.push(`${id}: [spawn] runs ${script}, which is not in the archive`);
      }
    }
    expect(broken, broken.join("\n")).toEqual([]);
  });

  test("every file a source manifest references is IN the package", () => {
    const missing: string[] = [];
    for (const id of sourceIds) {
      const dir = join(unpacked, id);
      const manifest = parseToml(readFileSync(join(dir, "manifest.toml"), "utf8")) as SourceManifest;
      for (const action of manifest.dataset?.actions ?? []) {
        if (action.schema !== undefined && !existsSync(join(dir, action.schema))) {
          missing.push(`${id}: dataset action '${action.name ?? "?"}' schema ${action.schema}`);
        }
      }
    }
    expect(missing, missing.join("\n")).toEqual([]);
  });
});

process.on("exit", () => {
  if (unpacked) rmSync(unpacked, { recursive: true, force: true });
});
