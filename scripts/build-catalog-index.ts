// build-catalog-index — assemble the CATALOG artifact the Magnis app installs
// from. Output (default ./catalog):
//   catalog/index.json                 { schema_version, generated_from, packages[] }
//   catalog/index.v3.json              { schemaVersion, generatedFrom, modules[], sources[] }
//   catalog/onboarding.json            { schemaVersion: 2, modules[] } — the default modules
//   catalog/<kind>__<id>.tgz           the installable payload, one flat asset
//                                      per package with its sha256 in the index
// Payloads are DEPENDENCY-CLOSED:
//   module        → plugins_dist/modules/<id> (prebuilt bundle + manifest.toml +
//                   schemas/ + README.md + icon — manifest v3 package)
//   source (ts)   → dist/main.js (bun build, SDK inlined) + manifest.toml
//   source (rust) → manifest.toml only in v1 (the binary ships with the app;
//                   per-platform release binaries are planned)
//   source (manifest-only) → manifest.toml (external spawn must be version-pinned)
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, cpSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join, relative } from "node:path";
import { parse as parseToml } from "smol-toml";

import {
  discoverStagedCatalog,
  discoverSourceReleaseManifests,
  reconcileSourceReceiptFixtures,
  sourceManifestReferencedFiles,
  writeCertifiedCatalogIndexes,
  writeSourceCertificationReceipts,
} from "./certify-sources";

import type {
  AdmissibleSourceReleaseManifest,
  PublishedCatalogPackage,
} from "./certify-sources";
import {
  loadHostMap,
  resolveExternals,
  rewriteBareImports,
} from "./build-plugins";

const ROOT = join(import.meta.dir, "..");
const OUT = process.env.CATALOG_OUT ?? join(ROOT, "catalog");
const RECEIPTS = process.env.SOURCE_RECEIPTS_IN ?? join(ROOT, "dist", "receipts");

interface Entry extends PublishedCatalogPackage {
  /** The ONE asset that carries the package, and the hash over it.
   * Release assets are a flat namespace — a name cannot contain `/` — so a
   * package travels as `<kind>__<id>.tgz` and the client fetches
   * `<channel base>/<name>`. */
  archive: { name: string; sha256: string };
  /** Where the card's icon and long-form description are read from,
   * pinned to the COMMIT this catalog was generated from. Absolute, so
   * the client is indifferent to who hosts them; sha-pinned, so a
   * published index keeps describing the same bytes forever. Absent when
   * the package publishes none. */
  icon_url?: string;
  details_url?: string;
}

function sha256(buf: Buffer | string): string {
  return createHash("sha256").update(buf).digest("hex");
}
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}
const TAR_BLOCK = 512;

/** A ustar archive of `entries`, written here rather than shelled out to
 * `tar`.
 *
 * The flags that make `tar` deterministic are not portable, and picking a
 * side breaks the other: `--sort/--owner/--group` are GNU, `--uid/--gid`
 * are BSD. This builder ran on macOS with the BSD spelling and failed on
 * the Linux runner with "unrecognized option '--uid'" — a builder that
 * only works where its author sat is not reproducible in any useful
 * sense.
 *
 * Writing the bytes makes determinism structural instead of coaxed:
 * entries arrive sorted, every mode/uid/gid/mtime is a constant here, and
 * gzip is told not to stamp its own header. The same input produces the
 * same archive on every machine, which is what lets a client skip a
 * catalog it already has. */
function tarBytes(root: string, entries: readonly string[]): Buffer {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    const body = readFileSync(join(root, entry));
    blocks.push(tarHeader(entry, body.length), body);
    const padding = body.length % TAR_BLOCK;
    if (padding !== 0) {
      blocks.push(Buffer.alloc(TAR_BLOCK - padding));
    }
  }
  // Two zero blocks close a tar archive.
  blocks.push(Buffer.alloc(TAR_BLOCK * 2));
  return Buffer.concat(blocks);
}

function tarHeader(name: string, size: number): Buffer {
  if (Buffer.byteLength(name) > 99) {
    // Refused rather than truncated or silently switched to a GNU long-name
    // extension: a package whose path does not fit is a packaging problem to
    // fix, not bytes to guess at.
    console.error(`path too long for a ustar header (max 99 bytes): ${name}`);
    process.exit(1);
  }
  const block = Buffer.alloc(TAR_BLOCK);
  block.write(name, 0, 100, "utf8");
  const octal = (value: number, offset: number, length: number): void => {
    block.write(value.toString(8).padStart(length - 1, "0"), offset, length - 1, "ascii");
  };
  octal(0o644, 100, 8); // mode
  octal(0, 108, 8); // uid — a constant, never the building user's
  octal(0, 116, 8); // gid
  octal(size, 124, 12);
  octal(0, 136, 12); // mtime — a constant, never the file's
  block.write("        ", 148, 8, "ascii"); // checksum placeholder
  block.write("0", 156, 1, "ascii"); // regular file
  block.write("ustar\0", 257, 6, "ascii");
  block.write("00", 263, 2, "ascii");
  let checksum = 0;
  for (const byte of block) {
    checksum += byte;
  }
  block.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
  return block;
}

/** Stage a package into a scratch directory, tar+gzip it into ONE flat
 * asset, and return the asset's name and hash.
 *
 * Flat because that is what a release namespace allows: an asset name
 * carries no `/`, so the per-file addressing the branch-served catalog
 * used (`packages/<kind>/<id>/<path>`) cannot exist here. One asset also
 * means one hash: the client verifies the whole payload before opening
 * it, instead of trusting a list of hashes it fetched from the same
 * place as the files.
 *
 * The bytes are a function of the CONTENT alone — see `tarBytes` for how
 * and why. Without that, the archive's hash changes on every build, every
 * index differs from the last, and clients re-download a catalog that did
 * not change. */
function stagePackage(kind: string, id: string, stage: (dst: string) => void): Entry["archive"] {
  const work = join(OUT, ".stage", "packages", kind, id);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  stage(work);

  const entries = walk(work)
    .map((file) => relative(work, file))
    .sort();

  const name = `${kind}__${id}.tgz`;
  const archive = gzipSync(tarBytes(work, entries), { level: 9 });
  writeFileSync(join(OUT, name), archive);
  return { name, sha256: sha256(archive) };
}

/** The commit this catalog describes.
 *
 * Card assets are served from the repository at THIS sha rather than
 * copied into the release: they are already in git, a sha addresses exact
 * content, and an icon is decorative — it needs no hash of its own
 * because the commit is one. A branch name here would silently start
 * meaning different bytes on the next push, which is the whole property
 * being bought. */
const GENERATED_FROM = process.env.GITHUB_SHA ?? "local";
const REPO_SLUG = process.env.GITHUB_REPOSITORY ?? null;

/** Absolute url of a file that lives in the repository, at the generated
 * sha — or undefined when the file is absent or the slug is unknown (a
 * local build has no repository to point at). */
function repoFileUrl(relPath: string, exists: boolean): string | undefined {
  if (!exists || REPO_SLUG === null || GENERATED_FROM === "local") {
    return undefined;
  }
  return `https://raw.githubusercontent.com/${REPO_SLUG}/${GENERATED_FROM}/${relPath}`;
}
/** The v3 package card — top-level manifest fields (modules and sources alike). */
interface Card {
  version?: string;
  dev?: boolean;
  title?: string;
  summary?: string;
  publisher?: string;
}

/** The card's icon and README, as absolute urls into the repository at
 * the generated sha. Only what a store card needs BEFORE installing —
 * everything else travels inside the archive. */
function cardLinks(
  half: string,
  id: string,
  src: string,
): { icon_url?: string; details_url?: string } {
  const icon = ["icon.svg", "icon.png"].find((file) => existsSync(join(src, file)));
  const iconUrl = icon === undefined ? undefined : repoFileUrl(`${half}/${id}/${icon}`, true);
  const detailsUrl = repoFileUrl(
    `${half}/${id}/README.md`,
    existsSync(join(src, "README.md")),
  );
  return {
    ...(iconUrl === undefined ? {} : { icon_url: iconUrl }),
    ...(detailsUrl === undefined ? {} : { details_url: detailsUrl }),
  };
}

// -- the dependency graph -----------------------------------------------------

/** What a manifest says about its place in the graph: the modules it names in
 * `dependsOn`, and, for a module, what it references and the surfaces it
 * declares. `call` and `read` are not read: they make no dependency. */
interface ManifestFacts {
  tier?: string;
  dependsOn?: string[];
  links?: { from?: string; to?: string }[];
  permissions?: { create?: string[] };
  surfaces?: Record<string, unknown>;
}

/** A source manifest's place in the graph: its `dependsOn` and the surfaces
 * it feeds. */
interface SourceFacts {
  dependsOn?: string[];
  surfaces?: string[];
}

/** Owner namespace of a dotted reference: `contacts.person` is `contacts`. */
function ownerNs(reference: string): string {
  const dot = reference.indexOf(".");
  return dot === -1 ? reference : reference.slice(0, dot);
}

/** Refuse a graph the host could not install, naming what is wrong. Every
 * `dependsOn` entry is a catalog module; the modules form no cycle; a
 * module's `[[links]]` endpoints and `create` entries owned by another
 * catalog module lie inside its closure; and a source's surfaces belong to
 * modules inside its closure. A surface no module declares is not checked.
 *
 * @tested-by: tst_pub_catalog_index_003
 * @tested-by: tst_pub_catalog_index_004
 * @tested-by: tst_pub_catalog_index_005
 */
export function checkDependencyGraph(
  modules: ReadonlyMap<string, ManifestFacts>,
  sources: ReadonlyMap<string, SourceFacts>,
): void {
  for (const [kind, packages] of [["module", modules], ["source", sources]] as const) {
    for (const [id, facts] of packages) {
      for (const dependency of facts.dependsOn ?? []) {
        if (!modules.has(dependency)) {
          throw new Error(`${kind} '${id}': dependsOn '${dependency}' is not a catalog module`);
        }
      }
    }
  }
  const visited = new Set<string>();
  const visit = (id: string, path: readonly string[]): void => {
    if (path.includes(id)) throw new Error(`dependency cycle: ${[...path, id].join(" -> ")}`);
    if (visited.has(id)) return;
    for (const dependency of modules.get(id)?.dependsOn ?? []) visit(dependency, [...path, id]);
    visited.add(id);
  };
  for (const id of [...modules.keys()].sort()) visit(id, []);

  const closure = (seeds: readonly string[]): Set<string> => {
    const reached = new Set<string>();
    const pending = [...seeds];
    for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
      if (reached.has(next)) continue;
      reached.add(next);
      pending.push(...(modules.get(next)?.dependsOn ?? []));
    }
    return reached;
  };
  for (const [id, facts] of modules) {
    const inside = closure([id]);
    const references = [
      ...(facts.links ?? []).flatMap((link) => [link.from, link.to]),
      ...(facts.permissions?.create ?? []),
    ].filter((reference): reference is string => reference !== undefined);
    for (const reference of references) {
      const owner = ownerNs(reference);
      if (modules.has(owner) && !inside.has(owner)) {
        throw new Error(`module '${id}': '${reference}' belongs to module '${owner}', outside its dependsOn closure`);
      }
    }
  }
  const surfaceOwner = new Map(
    [...modules].flatMap(([id, facts]) => Object.keys(facts.surfaces ?? {}).map((surface) => [surface, id] as const)),
  );
  for (const [id, facts] of sources) {
    const inside = closure(facts.dependsOn ?? []);
    for (const surface of facts.surfaces ?? []) {
      const owner = surfaceOwner.get(surface);
      if (owner !== undefined && !inside.has(owner)) {
        throw new Error(`source '${id}': surface '${surface}' belongs to module '${owner}', outside its dependsOn closure`);
      }
    }
  }
}

/** Stage one admitted Source from its authored manifest snapshot. Every path
 * referenced by the manifest is copied before the dependency-closed executable
 * is built, so certification observes the exact tree later archived.
 *
 * @tested-by: tst_cat_src_cert_001
 */
const CANONICAL_BUNDLE_BUILD_ROOT = "/__magnis_catalog_build__/";

/** Remove the checkout identity Bun embeds for CommonJS `__dirname` and
 * `__filename`. An installed dependency-closed artifact cannot use its build
 * checkout, so those exact prefixes must have one portable identity.
 *
 * @tested-by: tst_cat_src_cert_001
 */
export function canonicalizeBundledSourceBuildRoot(
  bundle: string,
  buildRoot: string = ROOT,
): string {
  const normalizedRoot = buildRoot.replaceAll("\\", "/").replace(/\/+$/, "");
  const buildRootPrefix = `${normalizedRoot}/`;
  const canonical = bundle.replaceAll(buildRootPrefix, CANONICAL_BUNDLE_BUILD_ROOT);
  if (canonical.includes(buildRootPrefix)) {
    throw new Error(`bundled Source retains build checkout prefix '${buildRootPrefix}'`);
  }
  return canonical;
}

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
  const result = Bun.spawnSync(
    [
      "bun",
      "build",
      entry,
      "--target=bun",
      "--outfile",
      join(destination, "dist", "main.js"),
    ],
    { cwd: ROOT },
  );
  if (result.exitCode !== 0) {
    throw new Error(`bun build failed for source '${id}':\n${result.stderr.toString("utf8")}`);
  }
  const bundlePath = join(destination, "dist", "main.js");
  writeFileSync(
    bundlePath,
    canonicalizeBundledSourceBuildRoot(readFileSync(bundlePath, "utf8")),
  );
}

/** Point a bundled source's manifest at the file the ARCHIVE contains.
 *
 * The package has no `src/` — the bundle is `dist/main.js` — so a manifest
 * copied verbatim names an entrypoint that is not there. The host's loader
 * takes an explicit `[spawn]` or `src/main.ts` beside the manifest and
 * nothing else, so it refused every published TS source: "the connector
 * cannot be launched". Nothing caught it because every stand that ever
 * launched a connector did so from a checkout.
 *
 * Rewriting the TEXT rather than re-emitting parsed TOML keeps the manifest's
 * comments, which carry the reasoning for the [spawn] blocks that already
 * exist (the statemachine mocks pass CLI flags; x-mcp is an npx bridge).
 *
 * @tested-by: tst_pub_pkg_source_launchable_001
 */
function manifestForBundledSource(text: string, hasAuthScreen: boolean): string {
  let published = text;
  if (hasAuthScreen) {
    const authHeader = /^\s*\[auth\]\s*$/m.exec(published);
    if (authHeader === null) {
      throw new Error("source auth/index.tsx requires an [auth] manifest section");
    }
    const sectionStart = authHeader.index + authHeader[0].length;
    const nextSectionOffset = published.slice(sectionStart).search(/^\s*\[/m);
    const sectionEnd = nextSectionOffset < 0
      ? published.length
      : sectionStart + nextSectionOffset;
    const authSection = published.slice(sectionStart, sectionEnd);
    const declaredUi = /^\s*ui\s*=\s*["']([^"']+)["']\s*$/m.exec(authSection)?.[1];
    if (declaredUi !== undefined && declaredUi !== "auth/screen.js") {
      throw new Error(`source auth UI must publish as auth/screen.js, got '${declaredUi}'`);
    }
    if (declaredUi === undefined) {
      published = `${published.slice(0, sectionStart)}\nui = "auth/screen.js"${published.slice(sectionStart)}`;
    }
  }
  if (/^\s*\[spawn\]/m.test(text)) {
    // An existing [spawn] keeps its shape and its flags; only the script it
    // runs moves to where the bundle actually is. An external bridge (npx)
    // names no script and is left untouched.
    return published.replace(/(["'])src\/main\.ts\1/g, '"dist/main.js"');
  }
  return (
    published.trimEnd() +
    "\n\n" +
    "# Added by scripts/build-catalog-index.ts: the archive carries the\n" +
    "# dependency-closed bundle, not the TypeScript source the convention\n" +
    "# looks for.\n" +
    "[spawn]\n" +
    'command = "bun"\n' +
    'args = ["run", "dist/main.js"]\n'
  );
}

/** Bundle a Source-owned auth screen as browser ESM against the same curated
 * host shims as module UI. The published package carries executable JS only;
 * the application never transpiles catalog TypeScript at runtime.
 *
 * @tested-by: tst_statemock_phone_cert_001
 */
function buildSourceAuthScreen(
  sourceId: string,
  sourceRoot: string,
  destination: string,
): boolean {
  const entry = join(sourceRoot, "auth", "index.tsx");
  if (!existsSync(entry)) return false;

  const output = join(destination, "auth", "screen.js");
  mkdirSync(join(destination, "auth"), { recursive: true });
  const externals = resolveExternals({}, loadHostMap());
  const args = [
    "bun",
    "build",
    entry,
    "--format=esm",
    "--target=browser",
    "--outfile",
    output,
  ];
  for (const specifier of externals.keys()) args.push("--external", specifier);
  const result = Bun.spawnSync(args, {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: "production" },
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `bun build failed for source '${sourceId}' auth screen:\n${result.stderr.toString("utf8")}`,
    );
  }
  writeFileSync(output, rewriteBareImports(readFileSync(output, "utf8"), externals));
  rmSync(join(destination, "auth", "index.tsx"));
  return true;
}

/** Stage the exact Source tree that enters the archive, including the
 * publication-time fixed spawn declaration.
 *
 * @tested-by: tst_gts_fx_001
 */
export function stageBundledSourcePackage(
  release: AdmissibleSourceReleaseManifest,
  destination: string,
): void {
  stageSourcePackage(release, destination);
  const hasAuthScreen = buildSourceAuthScreen(release.id, release.root, destination);
  const manifestPath = join(destination, "manifest.toml");
  writeFileSync(
    manifestPath,
    manifestForBundledSource(readFileSync(manifestPath, "utf8"), hasAuthScreen),
  );
}

async function buildCatalog(): Promise<void> {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const packages: Entry[] = [];
  const moduleGraph = new Map<string, ManifestFacts>();
  const sourceGraph = new Map<string, SourceFacts>();

// ── modules: prebuilt dist (self-contained manifest v3 packages) ─────────────
const distModules = join(ROOT, "plugins_dist", "modules");
if (!existsSync(distModules)) {
  console.error("plugins_dist missing — run `bun scripts/build-plugins.ts` first");
  process.exit(1);
}
for (const id of readdirSync(distModules).sort()) {
  const src = join(ROOT, "modules", id);
  // Manifest v3: the catalog card (title/summary/publisher) lives top-level.
  const manifestRaw = parseToml(readFileSync(join(src, "manifest.toml"), "utf8")) as Card &
    ManifestFacts;
  const manifest: Card = manifestRaw;
  moduleGraph.set(id, manifestRaw);
  if (!manifest.version) {
    console.error(`module '${id}': manifest.toml has no version — refusing`);
    process.exit(1);
  }
  // An absent tier is community, as the host's manifest parser reads it.
  const tier = manifestRaw.tier ?? "community";
  if (tier !== "system" && tier !== "community") {
    console.error(`module '${id}': manifest.toml tier '${tier}' is neither system nor community — refusing`);
    process.exit(1);
  }
  const archive = stagePackage("module", id, (dst) => {
    cpSync(join(distModules, id), dst, { recursive: true });
  });
  packages.push({
    kind: "module", id, version: manifest.version,
    title: manifest.title ?? id,
    summary: manifest.summary ?? "",
    publisher: manifest.publisher ?? "",
    dev: manifest.dev === true,
    archive,
    ...cardLinks("modules", id, src),
    dependsOn: manifestRaw.dependsOn ?? [],
    tier,
  });
}


// ── sources ──────────────────────────────────────────────────────────────────
const sourcesRoot = join(ROOT, "sources");
for (const release of discoverSourceReleaseManifests(sourcesRoot)) {
  if (release.disposition === "inadmissible") {
    console.warn(`catalog: source '${release.id}' inadmissible: ${release.reason}`);
    continue;
  }
  const id = release.id;
  const dir = release.root;
  const manifest = release.manifest as Card & SourceFacts;
  sourceGraph.set(id, manifest);
  const version = manifest.version;
  if (!version) {
    console.error(`source '${id}': manifest.toml has no version — refusing`);
    process.exit(1);
  }
  const archive = stagePackage("source", id, (dst) => {
    stageBundledSourcePackage(release, dst);
  });
  packages.push({
    kind: "source", id, version,
    title: manifest.title ?? id,
    summary: manifest.summary ?? "",
    publisher: manifest.publisher ?? "",
    dev: manifest.dev === true,
    archive,
    ...cardLinks("sources", id, dir),
    dependsOn: manifest.dependsOn ?? [],
  });
}
checkDependencyGraph(moduleGraph, sourceGraph);

const stagedRoot = join(OUT, ".stage");
const discovered = discoverStagedCatalog(stagedRoot);
const currentReceipts = await writeSourceCertificationReceipts(
  discovered,
  RECEIPTS,
);
reconcileSourceReceiptFixtures(RECEIPTS, currentReceipts.map(({ packageHash }) => packageHash));
await writeCertifiedCatalogIndexes({
  catalogOut: OUT,
  generatedFrom: GENERATED_FROM,
  receiptInputDir: RECEIPTS,
  discovered,
  publishedPackages: packages,
});
rmSync(stagedRoot, { recursive: true, force: true });

// -- onboarding.json: the default modules, beside what EXISTS -----------------
// A second document rather than a field on the first: the index says what
// exists and what each package needs; this names the modules every new
// workspace installs by default. Which modules a picked source brings is its
// own dependsOn, never a list here.
const curationPath = join(ROOT, "plugins", "onboarding.toml");
const defaults = (parseToml(readFileSync(curationPath, "utf8")) as { modules?: string[] }).modules;
if (defaults === undefined) {
  console.error("onboarding.toml: no modules list — refusing");
  process.exit(1);
}
for (const id of defaults) {
  if (!moduleGraph.has(id)) {
    console.error(`onboarding.toml: default module '${id}' is not a catalog module — refusing`);
    process.exit(1);
  }
}
writeFileSync(
  join(OUT, "onboarding.json"),
  JSON.stringify({ schemaVersion: 2, modules: defaults }, null, 2),
);
console.log(`catalog: ${String(packages.length)} packages → ${OUT}`);
}

if (import.meta.main) {
  await buildCatalog();
}
