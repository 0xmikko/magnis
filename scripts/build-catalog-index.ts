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

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "packages"), { recursive: true });
const packages: Entry[] = [];

// ── modules: prebuilt dist (self-contained manifest v3 packages) ─────────────
const distModules = join(ROOT, "plugins_dist", "modules");
if (!existsSync(distModules)) {
  console.error("plugins_dist missing — run `bun scripts/build-plugins.ts` first");
  process.exit(1);
}
for (const id of readdirSync(distModules).sort()) {
  const src = join(ROOT, "plugins", "modules", id);
  // Manifest v3: the catalog card (title/summary/publisher) lives top-level.
  const manifest = parseToml(readFileSync(join(src, "manifest.toml"), "utf8")) as Card;
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
  const archive = stagePackage("source", id, (dst) => {
    cpSync(manifestPath, join(dst, "manifest.toml"));
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
console.log(`catalog: ${String(packages.length)} packages → ${OUT}`);
