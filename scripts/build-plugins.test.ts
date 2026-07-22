// tst_build_bundle_001 (INV-1, DEC-15): build:plugins bundles a plugin UI into
// ONE file whose only imports are host-shim URLs (relatives inlined), with the
// PRODUCTION JSX runtime (no jsxDEV / no vite dep paths). Run: `bun test scripts/`.
import { test, expect, beforeAll } from "bun:test";
import { buildPlugin } from "./build-plugins.ts";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const REPO = join(import.meta.dir, "..");
const DIST = join(REPO, "plugins_dist");

let bundleRel: string;

beforeAll(async () => {
  const res = await buildPlugin("file", {
    pluginsDir: join(REPO, "plugins"),
    distDir: DIST,
  });
  bundleRel = res.bundleFile; // e.g. "index.<hash>.js"
});

// tst_build_icon_001 (INV-1, plugin-icon-standard, manifest v3): a plugin
// shipping icon.svg at the package root gets it copied into the dist package
// root and recorded in bundle.json.assets with a content hash.
test("tst_build_icon_001: icon.svg → dist copy + bundle.json.assets", async () => {
  // x ships plugins/x/icon.svg (the brand glyph, package root).
  await buildPlugin("x", { pluginsDir: join(REPO, "plugins"), distDir: DIST });
  const svg = readFileSync(join(DIST, "modules", "x", "icon.svg"), "utf8");
  expect(svg).toContain("<svg");
  const bj = JSON.parse(readFileSync(join(DIST, "modules", "x", "bundle.json"), "utf8"));
  expect(bj.assets["icon.svg"]).toMatch(/^[0-9a-f]{16}$/);

  // file ships an icon too since the plugin-icon-standard (PR #73) — its
  // assets map records it (pre-existing drift: this test predated the icons).
  const bjFile = JSON.parse(readFileSync(join(DIST, "modules", "file", "bundle.json"), "utf8"));
  expect(bjFile.assets["icon.svg"]).toMatch(/^[0-9a-f]{16}$/);
});

test("tst_build_bundle_001: file ui → one bundle, externals→shim, relatives inlined, prod jsx", () => {
  const uiDir = join(DIST, "modules", "file", "ui");
  const jsFiles = readdirSync(uiDir).filter((f) => f.endsWith(".js"));
  // exactly one hashed bundle
  expect(jsFiles.length).toBe(1);
  expect(jsFiles[0]).toMatch(/^index\.[0-9a-f]{8,}\.js$/);
  expect(jsFiles[0]).toBe(bundleRel);

  const js = readFileSync(join(uiDir, jsFiles[0]), "utf8");

  // externals are rewritten to the host-shim endpoint (baked at build time)
  expect(js).toContain("/api/plugins/__host-shim.js?m=ui");
  expect(js).toContain("/api/plugins/__host-shim.js?m=react-jsx-runtime");

  // relative imports are inlined — no `from "./..."` survives
  expect(js).not.toMatch(/from\s*["']\.\.?\//);

  // PRODUCTION jsx runtime only (DEC-15)
  expect(js).not.toContain("jsx-dev-runtime");
  expect(js).not.toContain("jsxDEV");
  expect(js).not.toContain("/node_modules/.vite/");

  // bundle.json maps the entry → the hashed file
  const bj = JSON.parse(readFileSync(join(DIST, "modules", "file", "bundle.json"), "utf8"));
  expect(bj.ui["index.tsx"]).toBe(jsFiles[0]);
  expect(typeof bj.uiHash).toBe("string");
});
