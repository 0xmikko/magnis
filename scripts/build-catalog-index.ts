// build-catalog-index — assemble the CATALOG artifact the Magnis app installs
// from. Output (default ./catalog):
//   catalog/index.json                 { schema_version, generated_from, packages[] }
//   catalog/onboarding.json            { schema_version, capabilities[], derived }
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

const ROOT = join(import.meta.dir, "..");
const OUT = process.env.CATALOG_OUT ?? join(ROOT, "catalog");

interface Entry {
  kind: "module" | "source";
  id: string;
  version: string;
  title: string;
  summary: string;
  publisher: string;
  dev: boolean;
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
  const work = join(OUT, ".stage", `${kind}__${id}`);
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
  const iconUrl = icon === undefined ? undefined : repoFileUrl(`plugins/${half}/${id}/${icon}`, true);
  const detailsUrl = repoFileUrl(
    `plugins/${half}/${id}/README.md`,
    existsSync(join(src, "README.md")),
  );
  return {
    ...(iconUrl === undefined ? {} : { icon_url: iconUrl }),
    ...(detailsUrl === undefined ? {} : { details_url: detailsUrl }),
  };
}

// -- the curation document ---------------------------------------------------

/** One offer on the first screen, as `plugins/onboarding.toml` writes it. */
interface CapabilityDecl {
  id?: string;
  title?: string;
  modules?: string[];
  source?: string;
  people?: boolean;
  local?: boolean;
}

/** What a module manifest says about its place in the graph.
 *
 * The rule is the backend's, not a second one invented here
 * (`services/extensions/deps.ts`): a HARD dependency is a `permissions.call`
 * (rpc) or `permissions.create` (cross-owner write), because those are what
 * leave an unmet requirement when the owner is missing. `permissions.read`
 * is SOFT — it never blocks enabling — but it still says "that module's
 * records should exist first", so it counts for ORDER and not for the
 * closure. Keeping the two apart is the whole reason this is derived rather
 * than transcribed: the frontend's hand-written table merged them, and so
 * pulled in packages nothing actually required. */
interface ModuleFacts {
  system: boolean;
  hard: string[];
  soft: string[];
}

/** Owner namespace of a dotted reference: `contacts.person` is `contacts`. */
function ownerNs(reference: string): string {
  const dot = reference.indexOf(".");
  return dot === -1 ? reference : reference.slice(0, dot);
}

interface ManifestFacts {
  tier?: string;
  permissions?: Record<string, unknown>;
}

function moduleFacts(id: string, raw: ManifestFacts): ModuleFacts {
  const permissions = raw.permissions ?? {};
  const list = (key: string): string[] => {
    const value = permissions[key];
    return Array.isArray(value) ? (value as string[]) : [];
  };
  const owners = (refs: string[]): string[] =>
    [...new Set(refs.map(ownerNs))].filter((owner) => owner !== id).sort();
  return {
    system: raw.tier === "system",
    hard: owners([...list("call"), ...list("create")]),
    soft: owners(list("read")),
  };
}

/** A dependency-safe order over every module, from the derived edges.
 *
 * Ordered by HARD edges only, and this is the important part: soft reads
 * are NOT a partial order. `contacts` reads `companies.company` while
 * `companies` reads `contacts.person` — a genuine mutual read between two
 * modules that describe the same world from two sides. Sorting over both
 * kinds of edge therefore finds a cycle in a perfectly healthy catalog and
 * refuses to build it. (Measured, not reasoned: this builder did exactly
 * that on the first run over the real manifests.)
 *
 * Soft reads still say something worth honouring, so they break TIES: when
 * several modules are equally ready, one whose soft dependencies are
 * already placed goes first. A preference cannot deadlock, which is the
 * whole reason it is expressed as one.
 *
 * A cycle among HARD edges is a different matter and refuses the build: it
 * means no install order exists at all, and a wizard discovering that
 * halfway through someone's first five minutes is the worst place to.
 * Ties fall back to alphabetical so the same catalog produces the same
 * order on every machine. */
function installOrder(known: ReadonlyMap<string, ModuleFacts>): string[] {
  const ids = [...known.keys()].sort();
  const hardBefore = new Map<string, Set<string>>(ids.map((id) => [id, new Set<string>()]));
  for (const id of ids) {
    for (const dep of known.get(id)?.hard ?? []) {
      if (known.has(dep)) hardBefore.get(id)?.add(dep);
    }
  }
  const out: string[] = [];
  const placed = new Set<string>();
  while (out.length < ids.length) {
    const ready = ids.filter(
      (id) => !placed.has(id) && [...(hardBefore.get(id) ?? [])].every((dep) => placed.has(dep)),
    );
    if (ready.length === 0) {
      const stuck = ids.filter((id) => !placed.has(id));
      console.error(`hard dependency cycle among modules: ${stuck.join(", ")} — refusing`);
      process.exit(1);
    }
    // System-tier first among equals: it is what everything else assumes.
    // Then whoever is soft-satisfied. Then alphabetical.
    const softSatisfied = (id: string): boolean =>
      (known.get(id)?.soft ?? []).every((dep) => !known.has(dep) || placed.has(dep));
    const first = ready[0];
    if (first === undefined) break;
    const next =
      ready.find((id) => known.get(id)?.system === true) ?? ready.find(softSatisfied) ?? first;
    out.push(next);
    placed.add(next);
  }
  return out;
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const packages: Entry[] = [];
const facts = new Map<string, ModuleFacts>();

// ── modules: prebuilt dist (self-contained manifest v3 packages) ─────────────
const distModules = join(ROOT, "plugins_dist", "modules");
if (!existsSync(distModules)) {
  console.error("plugins_dist missing — run `bun scripts/build-plugins.ts` first");
  process.exit(1);
}
for (const id of readdirSync(distModules).sort()) {
  const src = join(ROOT, "plugins", "modules", id);
  // Manifest v3: the catalog card (title/summary/publisher) lives top-level.
  const manifestRaw = parseToml(readFileSync(join(src, "manifest.toml"), "utf8")) as Card &
    ManifestFacts;
  const manifest: Card = manifestRaw;
  facts.set(id, moduleFacts(id, manifestRaw));
  if (!manifest.version) {
    console.error(`module '${id}': manifest.toml has no version — refusing`);
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
  });
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
function manifestForBundledSource(text: string): string {
  if (/^\s*\[spawn\]/m.test(text)) {
    // An existing [spawn] keeps its shape and its flags; only the script it
    // runs moves to where the bundle actually is. An external bridge (npx)
    // names no script and is left untouched.
    return text.replace(/(["'])src\/main\.ts\1/g, '"dist/main.js"');
  }
  return (
    text.trimEnd() +
    "\n\n" +
    "# Added by scripts/build-catalog-index.ts: the archive carries the\n" +
    "# dependency-closed bundle, not the TypeScript source the convention\n" +
    "# looks for.\n" +
    "[spawn]\n" +
    'command = "bun"\n' +
    'args = ["run", "dist/main.js"]\n'
  );
}

// ── sources ──────────────────────────────────────────────────────────────────
const sourcesRoot = join(ROOT, "plugins", "sources");
for (const id of readdirSync(sourcesRoot).sort()) {
  if (id.startsWith("_")) continue;
  const dir = join(sourcesRoot, id);
  const manifestPath = join(dir, "manifest.toml");
  if (!existsSync(manifestPath)) continue;
  // Manifest v3: the catalog card (title/summary/publisher) lives top-level.
  const manifest = parseToml(readFileSync(manifestPath, "utf8")) as Card;
  const version = manifest.version;
  if (!version) {
    console.error(`source '${id}': manifest.toml has no version — refusing`);
    process.exit(1);
  }
  const isTs = existsSync(join(dir, "src", "main.ts"));
  const manifestText = readFileSync(manifestPath, "utf8");
  const archive = stagePackage("source", id, (dst) => {
    writeFileSync(
      join(dst, "manifest.toml"),
      isTs ? manifestForBundledSource(manifestText) : manifestText,
    );
    // A manifest that REFERENCES a file needs that file in the package.
    // `[[dataset.actions]].schema` paths live under schemas/, and leaving
    // them out made the manifest fail to load before spawn was reached.
    if (existsSync(join(dir, "schemas"))) {
      cpSync(join(dir, "schemas"), join(dst, "schemas"), { recursive: true });
    }
    if (existsSync(join(dir, "config.default.toml"))) cpSync(join(dir, "config.default.toml"), join(dst, "config.default.toml"));
    if (existsSync(join(dir, "auth"))) cpSync(join(dir, "auth"), join(dst, "auth"), { recursive: true });
    // v3 package card assets: the markdown detail page + optional icon.
    if (existsSync(join(dir, "README.md"))) cpSync(join(dir, "README.md"), join(dst, "README.md"));
    for (const icon of ["icon.svg", "icon.png"]) {
      if (existsSync(join(dir, icon))) cpSync(join(dir, icon), join(dst, icon));
    }
    if (isTs) {
      // dependency-closed single-file bundle (../../_sdk can't resolve in a store)
      const r = Bun.spawnSync(["bun", "build", join(dir, "src", "main.ts"), "--target=bun", "--outfile", join(dst, "dist", "main.js")]);
      if (r.exitCode !== 0) {
        console.error(`bun build failed for source '${id}':\n${r.stderr.toString("utf8")}`);
        process.exit(1);
      }
    }
  });
  packages.push({
    kind: "source", id, version,
    title: manifest.title ?? id,
    summary: manifest.summary ?? "",
    publisher: manifest.publisher ?? "",
    dev: manifest.dev === true,
    archive,
    ...cardLinks("sources", id, dir),
  });
}

rmSync(join(OUT, ".stage"), { recursive: true, force: true });
writeFileSync(join(OUT, "index.json"), JSON.stringify({
  schema_version: 1,
  generated_from: GENERATED_FROM,
  packages,
}, null, 2));

// -- onboarding.json: what to RECOMMEND, beside what EXISTS -------------------
// A second document rather than a field on the first: they answer different
// questions, change for different reasons, and at ~5000 packages the index is
// large while this stays small. Only the capabilities are hand-written; the
// rest is read back out of the manifests above.
const curationPath = join(ROOT, "plugins", "onboarding.toml");
if (existsSync(curationPath)) {
  const declared =
    (parseToml(readFileSync(curationPath, "utf8")) as { capabilities?: CapabilityDecl[] })
      .capabilities ?? [];
  const known = new Set(packages.map((entry) => entry.id));
  const capabilities = declared.map((capability) => {
    const id = capability.id;
    const title = capability.title;
    if (id === undefined || title === undefined) {
      console.error("onboarding.toml: a capability is missing id or title — refusing");
      process.exit(1);
    }
    const modules = capability.modules ?? [];
    // A capability naming a package this catalog does not carry would put a
    // tickable box in front of someone that installs nothing when ticked.
    const named = capability.source === undefined ? modules : [...modules, capability.source];
    for (const packageId of named) {
      if (!known.has(packageId)) {
        console.error(
          `onboarding.toml: capability '${id}' names '${packageId}', which this catalog does not carry — refusing`,
        );
        process.exit(1);
      }
    }
    return {
      id,
      title,
      modules,
      source: capability.source ?? null,
      people: capability.people === true,
      local: capability.local === true,
    };
  });
  // Only MODULES: a call may name a host namespace rather than a package —
  // `x` calls `source.sync.bootstrap`, and `source` is the host, not
  // something to install. Publishing it would send the wizard looking for a
  // module nobody wrote, and the failure would surface as a named install
  // failure on someone's first screen.
  const hard_deps: Record<string, string[]> = {};
  for (const [id, entry] of facts) {
    const deps = entry.hard.filter((dep) => facts.has(dep));
    if (deps.length > 0) hard_deps[id] = deps;
  }
  writeFileSync(
    join(OUT, "onboarding.json"),
    JSON.stringify(
      {
        schema_version: 1,
        capabilities,
        always: [...facts]
          .filter(([, entry]) => entry.system)
          .map(([id]) => id)
          .sort(),
        hard_deps,
        install_order: installOrder(facts),
      },
      null,
      2,
    ),
  );
}
console.log(`catalog: ${String(packages.length)} packages → ${OUT}`);
