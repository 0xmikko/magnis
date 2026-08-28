// build-catalog-index — assemble the CATALOG artifact the Magnis app installs
// from. Output (default ./catalog):
//   catalog/index.json                 { schema_version, generated_from, packages[] }
//   catalog/packages/<kind>/<id>/**    the installable payload (files listed
//                                      in the index with per-file sha256)
// Payloads are DEPENDENCY-CLOSED:
//   module        → plugins_dist/modules/<id> (prebuilt bundle + manifest.toml +
//                   schemas/ + README.md + icon — manifest v3 package)
//   source (ts)   → dist/main.js (bun build, SDK inlined) + manifest.toml
//   source (rust) → manifest.toml only in v1 (the binary ships with the app;
//                   per-platform release binaries are planned)
//   source (manifest-only) → manifest.toml (external spawn must be version-pinned)
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";

import {
  discoverStagedCatalog,
  discoverSourceReleaseManifests,
  reconcileSourceReceiptFixtures,
  SELECTED_CHANNEL_SOURCE_MATRIX,
  sourceManifestReferencedFiles,
  writeCertifiedCatalogIndexes,
  writeSourceCertificationReceipts,
  type AdmissibleSourceReleaseManifest,
  type CertifiedCatalogResult,
} from "./certify-sources";

const ROOT = join(import.meta.dir, "..");
const OUT = process.env.CATALOG_OUT ?? join(ROOT, "catalog");

function stagePackage(
  catalogOut: string,
  kind: string,
  id: string,
  stage: (dst: string) => void,
): void {
  const dst = join(catalogOut, "packages", kind, id);
  mkdirSync(dst, { recursive: true });
  stage(dst);
}
/** The v3 package card — top-level manifest fields (modules and sources alike). */
interface Card {
  version?: string;
  dev?: boolean;
  title?: string;
  summary?: string;
  publisher?: string;
}

export interface BuildCatalogOptions {
  repoRoot: string;
  catalogOut: string;
  generatedFrom: string;
  receiptInputDir: string;
  includeModules?: boolean;
}

/** Stage one admitted Source from its authored manifest snapshot. Every path
 * referenced by the manifest is copied verbatim before the dependency-closed
 * executable is built.
 *
 * @tested-by: tst_cat_src_cert_001
 * @invariant: the package contains every manifest reference under the same
 * root-relative path the immutable manifest declares.
 */
export function stageSourcePackage(
  release: AdmissibleSourceReleaseManifest,
  destination: string,
): void {
  const { id, root: sourceRoot, manifestPath, manifest } = release;
  mkdirSync(destination, { recursive: true });
  cpSync(manifestPath, join(destination, "manifest.toml"));
  if (existsSync(join(sourceRoot, "config.default.toml"))) {
    cpSync(join(sourceRoot, "config.default.toml"), join(destination, "config.default.toml"));
  }
  if (existsSync(join(sourceRoot, "auth"))) {
    cpSync(join(sourceRoot, "auth"), join(destination, "auth"), { recursive: true });
  }
  for (const reference of sourceManifestReferencedFiles(id, manifest)) {
    const source = join(sourceRoot, ...reference.split("/"));
    const target = join(destination, ...reference.split("/"));
    mkdirSync(join(target, ".."), { recursive: true });
    cpSync(source, target);
  }
    // v3 package card assets: the markdown detail page + optional icon.
  if (existsSync(join(sourceRoot, "README.md"))) {
    cpSync(join(sourceRoot, "README.md"), join(destination, "README.md"));
  }
  for (const icon of ["icon.svg", "icon.png"]) {
    if (existsSync(join(sourceRoot, icon))) {
      cpSync(join(sourceRoot, icon), join(destination, icon));
    }
  }
  const entry = join(sourceRoot, "src", "main.ts");
  if (!existsSync(entry)) {
    throw new Error(`source '${id}' has no root-local src/main.ts to bundle`);
  }
  const result = Bun.spawnSync([
    "bun",
    "build",
    entry,
    "--target=bun",
    "--outfile",
    join(destination, "dist", "main.js"),
  ]);
  if (result.exitCode !== 0) {
    throw new Error(`bun build failed for source '${id}':\n${result.stderr.toString("utf8")}`);
  }
}

/** Assemble the exact release snapshot. Source discovery happens once and its
 * sorted result drives staging; explicit inadmissible entries are reported and
 * never appear in either index.
 */
export async function buildCatalog(options: BuildCatalogOptions): Promise<CertifiedCatalogResult> {
  const includeModules = options.includeModules ?? true;
  rmSync(options.catalogOut, { recursive: true, force: true });
  mkdirSync(join(options.catalogOut, "packages"), { recursive: true });

  if (includeModules) {
    const distModules = join(options.repoRoot, "plugins_dist", "modules");
    if (!existsSync(distModules)) {
      throw new Error("plugins_dist missing — run `bun scripts/build-plugins.ts` first");
    }
    for (const id of readdirSync(distModules).sort()) {
      const sourceRoot = join(options.repoRoot, "plugins", "modules", id);
      const manifest = parseToml(
        readFileSync(join(sourceRoot, "manifest.toml"), "utf8"),
      ) as Card;
      if (!manifest.version) throw new Error(`module '${id}': manifest.toml has no version`);
      stagePackage(options.catalogOut, "module", id, (destination) => {
        cpSync(join(distModules, id), destination, { recursive: true });
      });
    }
  }

  const sourceSnapshot = discoverSourceReleaseManifests(
    join(options.repoRoot, "plugins", "sources"),
  );
  for (const release of sourceSnapshot) {
    if (release.disposition === "inadmissible") {
      console.warn(`catalog: source '${release.id}' inadmissible: ${release.reason}`);
      continue;
    }
    stagePackage(options.catalogOut, "source", release.id, (destination) => {
      stageSourcePackage(release, destination);
    });
  }

  const discovered = discoverStagedCatalog(options.catalogOut);
  const currentReceipts = await writeSourceCertificationReceipts(discovered, options.receiptInputDir);
  reconcileSourceReceiptFixtures(options.receiptInputDir, [
    ...currentReceipts.map(({ packageHash }) => packageHash),
    ...SELECTED_CHANNEL_SOURCE_MATRIX.map(({ packageHash }) => packageHash),
  ]);
  return writeCertifiedCatalogIndexes({
    catalogOut: options.catalogOut,
    generatedFrom: options.generatedFrom,
    receiptInputDir: options.receiptInputDir,
    discovered,
  });
}

if (import.meta.main) {
  const result = await buildCatalog({
    repoRoot: ROOT,
    catalogOut: OUT,
    generatedFrom: process.env.GITHUB_SHA ?? "local",
    receiptInputDir: process.env.SOURCE_RECEIPTS_IN ?? join(ROOT, "dist", "receipts"),
  });
  console.log(`catalog: ${String(result.discovered.length)} certified packages → ${OUT}`);
}
