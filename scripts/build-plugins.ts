#!/usr/bin/env bun
// build:plugins — bundle each plugin's `ui` surface into ONE ESM file.
//
// Per DEC-1/2/3/5/15: the JS build lives HERE (not in the Rust backend). Each
// plugin's own files are inlined; the host bare specifiers (react, @magnis/host/*,
// @tanstack/react-query, + manifest.ui.extra_bare_imports) stay EXTERNAL and are
// rewritten to the host-shim endpoint at build time. Output:
//   plugins_dist/<id>/ui/index.<hash>.js   (the bundle, prod JSX runtime)
//   plugins_dist/<id>/bundle.json          ({ ui: { "<entry>": "index.<hash>.js" }, uiHash })
//   plugins_dist/<id>/manifest.toml        (copied)
// The backend serves the bundle for the entry URL with ETag=hash (DEC-5).
//
// Single source of truth for the bare→slug map: scripts/plugin-host-imports.json
// (mirrors transpile.rs::BareImportMap — DEC-6).

// Force production JSX (jsx/jsxs, NOT jsxDEV) — DEC-15.
process.env.NODE_ENV = "production";

import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import ts from "typescript";
import { parse as parseToml } from "smol-toml";

const REPO_ROOT = join(import.meta.dir, "..");
const SHIM_URL = (slug: string) => `/api/plugins/__host-shim.js?m=${slug}`;

interface HostMap {
  static: Record<string, string>; // bare specifier → shim slug
}
function loadHostMap(): HostMap {
  return JSON.parse(readFileSync(join(import.meta.dir, "plugin-host-imports.json"), "utf8"));
}

interface Manifest {
  entry?: { ui?: string; module?: string };
  ui?: { extra_bare_imports?: string[] };
}

export interface BuildOpts {
  pluginsDir?: string;
  distDir?: string;
}

export interface BuildResult {
  pluginId: string;
  bundleFile: string; // hashed filename, e.g. "index.<hash>.js"
  hash: string;
}

/** Build the bare specifier → shim-URL map for one plugin (static + extras). */
function resolveExternals(manifest: Manifest, host: HostMap): Map<string, string> {
  const map = new Map<string, string>();
  for (const [spec, slug] of Object.entries(host.static)) map.set(spec, SHIM_URL(slug));
  for (const extra of manifest.ui?.extra_bare_imports ?? []) map.set(extra, SHIM_URL(extra));
  return map;
}

/** Rewrite the externalized bare imports in the bundle to host-shim URLs. */
function rewriteBareImports(js: string, externals: Map<string, string>): string {
  let out = js;
  for (const [spec, url] of externals) {
    // Replace only the exact quoted specifier (import source position). Exact
    // quoting means "react" never matches "react-dom"/"react/jsx-runtime".
    out = out.split(`"${spec}"`).join(`"${url}"`).split(`'${spec}'`).join(`'${url}'`);
  }
  return out;
}

export async function buildPlugin(pluginId: string, opts: BuildOpts = {}): Promise<BuildResult> {
  const pluginsDir = opts.pluginsDir ?? join(REPO_ROOT, "plugins");
  const distDir = opts.distDir ?? join(REPO_ROOT, "plugins_dist");
  const host = loadHostMap();

  const manifestPath = join(pluginsDir, "modules", pluginId, "manifest.toml");
  const manifest: Manifest = parseToml(readFileSync(manifestPath, "utf8")) as Manifest;
  // Entry is always under `ui/`. Manifests are inconsistent: most use
  // "index.tsx", projects uses "ui/index.tsx" — normalize by stripping a
  // leading "ui/" so the on-disk path + the entry key match what the frontend
  // loader requests (`/api/plugins/<id>/ui/index.tsx`).
  const entryUi = (manifest.entry?.ui ?? "index.tsx").replace(/^ui\//, "");
  const entryPath = join(pluginsDir, "modules", pluginId, "ui", entryUi);
  if (!existsSync(entryPath)) {
    throw new Error(`plugin ${pluginId}: ui entry not found at ${entryPath}`);
  }

  const externals = resolveExternals(manifest, host);

  const result = await Bun.build({
    entrypoints: [entryPath],
    format: "esm",
    target: "browser",
    external: [...externals.keys()],
    minify: false,
    define: { "process.env.NODE_ENV": '"production"' },
  });
  if (!result.success) {
    throw new Error(
      `plugin ${pluginId}: bundle failed:\n${result.logs.map((l) => String(l)).join("\n")}`,
    );
  }
  const jsArtifact = result.outputs.find((o) => o.kind === "entry-point") ?? result.outputs[0];
  const raw = await jsArtifact.text();
  const js = rewriteBareImports(raw, externals);

  const hash = createHash("sha256").update(js).digest("hex").slice(0, 16);
  const bundleFile = `index.${hash}.js`;

  // Write the package into plugins_dist/modules/<id>/ (DEC-10: dist mirrors
  // the tree; boot seeding flattens into the id-keyed store).
  const pkgDir = join(distDir, "modules", pluginId);
  const uiDir = join(pkgDir, "ui");
  // Clear any prior ui/*.js so exactly one bundle remains.
  if (existsSync(uiDir)) {
    for (const f of readdirSync(uiDir)) {
      if (f.endsWith(".js")) rmSync(join(uiDir, f));
    }
  }
  mkdirSync(uiDir, { recursive: true });
  writeFileSync(join(uiDir, bundleFile), js);

  // ── module surface (Stage 3): bundle the V8 isolate entry too ─────────────
  // No externals — the SDK (@magnis/plugin-sdk, zero imports, globalThis-based)
  // and relative files inline into ONE self-contained module the isolate loads
  // with no transpile + no resolution. Host ops arrive via injected globals.
  // experimentalDecorators (tsconfig) keeps the @tool/@writeTool legacy
  // decorator semantics the isolate expects.
  const moduleEntry = (manifest.entry?.module ?? "module/index.ts").replace(/^module\//, "");
  const moduleEntryPath = join(pluginsDir, "modules", pluginId, "module", moduleEntry);
  let moduleFile: string | undefined;
  let moduleHash: string | undefined;
  if (existsSync(moduleEntryPath)) {
    // Resolve the one allowed bare specifier deterministically (independent of
    // cwd / tsconfig-paths discovery): @magnis/plugin-sdk →
    // packages/plugin-sdk/index.ts (DEC-11), so it inlines. (Mirrors the
    // isolate loader's explicit sdk_root rule.)
    const sdkPath = join(pluginsDir, "..", "packages", "plugin-sdk", "index.ts");
    // The @tool/@writeTool decorators use LEGACY (experimentalDecorators)
    // semantics — record(target=prototype, methodName, descriptor) — matching the
    // isolate's deno_ast LegacyTypeScript loader. Bun.build ALWAYS lowers
    // decorators to TC39 (ignoring tsconfig experimentalDecorators), which keys
    // the registry by the wrong target → 0 tools register → every plugin breaks.
    // So we transpile each .ts with the TypeScript compiler (legacy decorators)
    // in an onLoad hook and hand Bun pure JS to bundle — Bun never sees decorator
    // syntax, so it can't re-lower it. (Verified by tst_module_decorators_001.)
    const legacyDecoratorTranspile = {
      name: "magnis-plugin-module",
      setup(build: {
        onResolve: (o: { filter: RegExp }, cb: () => { path: string }) => void;
        onLoad: (
          o: { filter: RegExp },
          cb: (a: { path: string }) => { contents: string; loader: "js" },
        ) => void;
      }) {
        build.onResolve({ filter: /^@magnis\/plugin-sdk$/ }, () => ({ path: sdkPath }));
        build.onLoad({ filter: /\.tsx?$/ }, (a) => {
          const out = ts.transpileModule(readFileSync(a.path, "utf8"), {
            compilerOptions: {
              experimentalDecorators: true,
              emitDecoratorMetadata: false,
              target: ts.ScriptTarget.ES2022,
              module: ts.ModuleKind.ESNext,
              jsx: ts.JsxEmit.Preserve,
            },
            fileName: a.path,
          });
          return { contents: out.outputText, loader: "js" };
        });
      },
    };
    const modResult = await Bun.build({
      entrypoints: [moduleEntryPath],
      format: "esm",
      target: "node", // bare V8 isolate (no DOM); node target avoids browser polyfills
      external: [],
      minify: false,
      define: { "process.env.NODE_ENV": '"production"' },
      plugins: [legacyDecoratorTranspile],
    });
    if (!modResult.success) {
      throw new Error(
        `plugin ${pluginId}: module bundle failed:\n${modResult.logs.map((l) => String(l)).join("\n")}`,
      );
    }
    const modArtifact =
      modResult.outputs.find((o) => o.kind === "entry-point") ?? modResult.outputs[0];
    const modJs = await modArtifact.text();
    moduleHash = createHash("sha256").update(modJs).digest("hex").slice(0, 16);
    moduleFile = `index.${moduleHash}.js`;
    const modDir = join(pkgDir, "module", "dist");
    if (existsSync(modDir)) {
      for (const f of readdirSync(modDir)) if (f.endsWith(".js")) rmSync(join(modDir, f));
    }
    mkdirSync(modDir, { recursive: true });
    writeFileSync(join(modDir, moduleFile), modJs);
  }

  // ── static assets (plugin-icon-standard INV-1) ────────────────────────────
  // A plugin may ship ui/icon.svg or ui/icon.png — copied verbatim into the dist
  // ui/ dir and recorded in bundle.json.assets with a content hash so the backend
  // prod path can serve it (correct MIME + ETag). svg/png only.
  const assets: Record<string, string> = {};
  for (const name of ["icon.svg", "icon.png"]) {
    const src = join(pluginsDir, "modules", pluginId, "ui", name);
    if (!existsSync(src)) continue;
    const bytes = readFileSync(src);
    assets[name] = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
    writeFileSync(join(uiDir, name), bytes);
  }

  writeFileSync(
    join(pkgDir, "bundle.json"),
    JSON.stringify(
      {
        ui: { [entryUi]: bundleFile },
        uiHash: hash,
        ...(moduleFile ? { module: { dist: moduleFile }, moduleHash } : {}),
        ...(Object.keys(assets).length ? { assets } : {}),
      },
      null,
      2,
    ),
  );
  writeFileSync(join(pkgDir, "manifest.toml"), readFileSync(manifestPath));

  return { pluginId, bundleFile, hash };
}

/** Discover plugin ids: dirs under plugins/modules/ with manifest.toml AND ui/. */
export function discoverPlugins(pluginsDir: string): string[] {
  const modulesDir = join(pluginsDir, "modules");
  return readdirSync(modulesDir)
    .filter((id) => {
      const dir = join(modulesDir, id);
      try {
        return (
          statSync(dir).isDirectory() &&
          existsSync(join(dir, "manifest.toml")) &&
          existsSync(join(dir, "ui"))
        );
      } catch {
        return false;
      }
    })
    .sort();
}

export async function buildAll(opts: BuildOpts = {}): Promise<BuildResult[]> {
  const pluginsDir = opts.pluginsDir ?? join(REPO_ROOT, "plugins");
  const ids = discoverPlugins(pluginsDir);
  const out: BuildResult[] = [];
  for (const id of ids) out.push(await buildPlugin(id, opts));
  return out;
}

// ── CLI ───────────────────────────────────────────────────────────────────
if (import.meta.main) {
  const args = process.argv.slice(2);
  const watch = args.includes("--watch");
  // `--out <dir>` (or $BUILD_PLUGINS_OUT) overrides the output dir. Dev points
  // it at the runtime store ($STORAGE_DIR/extensions) so a watcher rebuild lands
  // where the backend serves from (hot-reload via ETag change — DEC-9); prod
  // leaves it at plugins_dist and boot seeds dist→store (DEC-13).
  const outIdx = args.indexOf("--out");
  const distDir =
    outIdx >= 0 ? args[outIdx + 1] : process.env.BUILD_PLUGINS_OUT ?? join(REPO_ROOT, "plugins_dist");
  const ids = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--out");
  const pluginsDir = join(REPO_ROOT, "plugins");

  const buildOne = async (id: string) => {
    const r = await buildPlugin(id, { pluginsDir, distDir });
    console.log(`  ✓ ${id} → ${distDir}/modules/${id}/ui/${r.bundleFile}`);
  };
  const buildSet = async () => {
    const set = ids.length ? ids : discoverPlugins(pluginsDir);
    console.log(`build:plugins — ${set.length} plugin(s)`);
    for (const id of set) {
      try {
        await buildOne(id);
      } catch (e) {
        console.error(`  ✗ ${id}: ${(e as Error).message}`);
        if (!watch) process.exitCode = 1;
      }
    }
  };

  await buildSet();

  if (watch) {
    const { watch: fsWatch } = await import("fs");
    console.log("build:plugins --watch — watching plugins/modules/*/ui …");
    const set = ids.length ? ids : discoverPlugins(pluginsDir);
    const debounce = new Map<string, ReturnType<typeof setTimeout>>();
    for (const id of set) {
      const uiDir = join(pluginsDir, "modules", id, "ui");
      if (!existsSync(uiDir)) continue;
      fsWatch(uiDir, { recursive: true }, () => {
        clearTimeout(debounce.get(id));
        debounce.set(
          id,
          setTimeout(() => {
            buildOne(id).catch((e) => { console.error(`  ✗ ${id}: ${(e as Error).message}`); });
          }, 120),
        );
      });
    }
    // Keep the process alive.
    await new Promise(() => {});
  }
}

// quell unused import (dirname kept for potential future nested-entry support)
void dirname;
