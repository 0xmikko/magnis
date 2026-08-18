// tst_build_bundle_001: build:plugins bundles a plugin UI into ONE file whose
// only imports are host-shim URLs (relatives inlined), with the PRODUCTION JSX
// runtime (no jsxDEV / no vite dep paths). Run: `bun test scripts/`.
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

// tst_build_icon_001 (manifest v3): a plugin shipping icon.svg at the package
// root gets it copied into the dist package root and recorded in
// bundle.json.assets with a content hash.
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

  // PRODUCTION jsx runtime only — the host shim provides no dev runtime
  expect(js).not.toContain("jsx-dev-runtime");
  expect(js).not.toContain("jsxDEV");
  expect(js).not.toContain("/node_modules/.vite/");

  // bundle.json maps the entry → the hashed file
  const bj = JSON.parse(readFileSync(join(DIST, "modules", "file", "bundle.json"), "utf8"));
  expect(bj.ui["index.tsx"]).toBe(jsFiles[0]);
  expect(typeof bj.uiHash).toBe("string");
});

// tst_build_styles_001: a package carries its OWN styles.
//
// Until now the app's Tailwind pass produced every plugin's classes, by
// scanning this repository through an `@source` glob in the host's
// `app.css`. That cannot survive the channel: Tailwind runs at BUILD time
// over source it can see, so a package published AFTER the app was built
// has none of its utilities in the stylesheet — a third-party module
// installed from the channel renders with whatever the app happens to use
// already, and nothing else.
//
// A package carries its own JavaScript; it must carry its own CSS the same
// way. The stylesheet travels INSIDE the bundle the browser already
// imports, so there is no second file to serve and no second fetch to
// fail.
//
// What this pins, and why each half matters:
//   - the utilities the package's own UI uses are present;
//   - they are injected once, under a marker keyed by plugin id, so two
//     views of the same plugin do not stack stylesheets;
//   - NO reset. `@import "tailwindcss"` would drag in Tailwind's base
//     layer, and every plugin would then re-reset the host's page — once
//     per plugin. Measured while planning this: the naive form emits 7.5 KB
//     with a `@layer base`, the correct one 441 bytes with none.
test("tst_build_styles_001: the bundle carries the package's own utilities, and no reset", async () => {
  await buildPlugin("companies", { pluginsDir: join(REPO, "plugins"), distDir: DIST });
  const uiDir = join(DIST, "modules", "companies", "ui");
  const file = readdirSync(uiDir).find((f) => f.endsWith(".js"));
  expect(file, "companies ui bundle").toBeDefined();
  const bundle = readFileSync(join(uiDir, file as string), "utf8");

  // `CompanyOverview.tsx` uses `rounded-2xl`; the class must be defined by
  // the package now, not by whatever the host happened to compile.
  expect(bundle).toContain(".rounded-2xl");
  // Injected once, keyed by the plugin id.
  expect(bundle).toContain('data-plugin="companies"');
  // A themed colour resolves through the host's live variable, so the
  // package follows a theme change (including the light switch) without
  // being rebuilt.
  expect(bundle).toContain("var(--color-surface-secondary");
  // And no base layer: a plugin that resets the page it is embedded in is
  // worse than an unstyled one.
  expect(bundle).not.toContain("@layer base");
});
