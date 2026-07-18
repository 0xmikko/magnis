// build-catalog-index — assemble the CATALOG artifact the Magnis app installs
// from (plugins-public-repo DEC-6). Output (default ./catalog):
//   catalog/index.json                 { schema_version, generated_from, packages[] }
//   catalog/packages/<kind>/<id>/**    the installable payload (files listed
//                                      in the index with per-file sha256)
// Payloads are DEPENDENCY-CLOSED:
//   module        → plugins_dist/modules/<id> (prebuilt bundle) + lifecycle/ sources + manifest.toml
//   source (ts)   → dist/main.js (bun build, SDK inlined) + manifest.toml
//   source (rust) → manifest.toml only in v1 (binary ships with the app — DEC-7;
//                   Stage-4 adds per-platform release binaries)
//   source (manifest-only) → manifest.toml (external spawn must be version-pinned)
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, cpSync } from "node:fs";
import { join, relative } from "node:path";
import { parse as parseToml } from "smol-toml";

const ROOT = join(import.meta.dir, "..");
const OUT = process.env.CATALOG_OUT ?? join(ROOT, "catalog");

type Entry = {
  kind: "module" | "source";
  id: string;
  version: string;
  title: string;
  summary: string;
  publisher: string;
  dev: boolean;
  files: { path: string; sha256: string }[];
};

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
function stagePackage(kind: string, id: string, stage: (dst: string) => void): Entry["files"] {
  const dst = join(OUT, "packages", kind, id);
  mkdirSync(dst, { recursive: true });
  stage(dst);
  return walk(dst).map((p) => ({ path: relative(dst, p), sha256: sha256(readFileSync(p)) }));
}
function tomlField(toml: string, field: string): string | undefined {
  const m = toml.match(new RegExp(`^${field}\\s*=\\s*"([^"]*)"`, "m"));
  return m?.[1];
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "packages"), { recursive: true });
const packages: Entry[] = [];

// ── modules: prebuilt dist + lifecycle sources ────────────────────────────────
const distModules = join(ROOT, "plugins_dist", "modules");
if (!existsSync(distModules)) {
  console.error("plugins_dist missing — run `bun scripts/build-plugins.ts` first");
  process.exit(1);
}
for (const id of readdirSync(distModules).sort()) {
  const src = join(ROOT, "plugins", "modules", id);
  const manifest = parseToml(readFileSync(join(src, "manifest.toml"), "utf8")) as {
    version: string;
    dev?: boolean;
    presentation?: { title?: string; summary?: string; publisher?: string };
  };
  const files = stagePackage("module", id, (dst) => {
    cpSync(join(distModules, id), dst, { recursive: true });
    if (existsSync(join(src, "lifecycle"))) cpSync(join(src, "lifecycle"), join(dst, "lifecycle"), { recursive: true });
  });
  packages.push({
    kind: "module", id, version: manifest.version,
    title: manifest.presentation?.title ?? id,
    summary: manifest.presentation?.summary ?? "",
    publisher: manifest.presentation?.publisher ?? "",
    dev: manifest.dev === true,
    files,
  });
}

// ── sources ──────────────────────────────────────────────────────────────────
const sourcesRoot = join(ROOT, "plugins", "sources");
for (const id of readdirSync(sourcesRoot).sort()) {
  if (id.startsWith("_")) continue;
  const dir = join(sourcesRoot, id);
  const manifestPath = join(dir, "manifest.toml");
  if (!existsSync(manifestPath)) continue;
  const toml = readFileSync(manifestPath, "utf8");
  const version = tomlField(toml, "version");
  if (!version) {
    console.error(`source '${id}': manifest.toml has no version — refusing`);
    process.exit(1);
  }
  const isTs = existsSync(join(dir, "src", "main.ts"));
  const files = stagePackage("source", id, (dst) => {
    cpSync(manifestPath, join(dst, "manifest.toml"));
    if (existsSync(join(dir, "config.default.toml"))) cpSync(join(dir, "config.default.toml"), join(dst, "config.default.toml"));
    if (existsSync(join(dir, "auth"))) cpSync(join(dir, "auth"), join(dst, "auth"), { recursive: true });
    if (isTs) {
      // dependency-closed single-file bundle (../../_sdk can't resolve in a store)
      const r = Bun.spawnSync(["bun", "build", join(dir, "src", "main.ts"), "--target=bun", "--outfile", join(dst, "dist", "main.js")]);
      if (r.exitCode !== 0) {
        console.error(`bun build failed for source '${id}':\n${r.stderr}`);
        process.exit(1);
      }
    }
  });
  packages.push({
    kind: "source", id, version,
    title: tomlField(toml, "title") ?? id,
    summary: tomlField(toml, "summary") ?? "",
    publisher: tomlField(toml, "publisher") ?? "",
    dev: /^dev\s*=\s*true/m.test(toml),
    files,
  });
}

writeFileSync(join(OUT, "index.json"), JSON.stringify({
  schema_version: 1,
  generated_from: process.env.GITHUB_SHA ?? "local",
  packages,
}, null, 2));
console.log(`catalog: ${packages.length} packages → ${OUT}`);
