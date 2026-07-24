// tst_build_plugin_new_001 — the scaffolder produces a skeleton that satisfies
// the extension contracts (manifest v3): the folder name equals the manifest
// id, the manifest is a package card (identity, no [schemas]/[capabilities]/
// [surfaces]/[entry]/[lifecycle]/[presentation]), the graph model lives in
// schemas/ by convention (entity file has NO "version"; facet file ALWAYS has
// one), README.md is the catalog description, and a module/__tests__ unit test
// exists (every module ships one). Smoke-level: structure + manifest shape,
// not a full build.
import { test, expect } from "bun:test";
import { existsSync, readFileSync, readdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { parse as tomlParse } from "smol-toml";

import { scaffoldPlugin } from "./plugin-new.ts";

test("tst_build_plugin_new_001: scaffold produces a contract-satisfying v3 skeleton", () => {
  const out = join(tmpdir(), `plugin-new-test-${process.pid}`);
  rmSync(out, { recursive: true, force: true });

  const dir = scaffoldPlugin("acme_crm", out);
  expect(dir).toBe(join(out, "modules", "acme_crm"));

  // Standard layout present (manifest v3 package).
  for (const f of [
    "manifest.toml",
    "README.md",
    "schemas/item.json",
    "schemas/item.details.json",
    "module/index.ts",
    "module/service.ts",
    "module/__tests__/acme_crmRead.test.ts",
    "ui/index.tsx",
    "types/index.ts",
    "package.json",
    "tsconfig.json",
  ]) {
    expect(existsSync(join(dir, f))).toBe(true);
  }

  // Manifest contract: folder name == id; v3 = identity + permissions only.
  const manifest = tomlParse(readFileSync(join(dir, "manifest.toml"), "utf8")) as unknown as Record<
    string,
    unknown
  >;
  expect(manifest.id).toBe("acme_crm");
  expect(manifest.tier).toBe("community");
  expect(typeof manifest.title).toBe("string");
  expect(typeof manifest.summary).toBe("string");
  expect(typeof manifest.publisher).toBe("string");
  // Dead v2 tables must NOT be emitted — schemas/ + convention replaced them.
  for (const dead of [
    "owns",
    "schemas",
    "capabilities",
    "surfaces",
    "entry",
    "lifecycle",
    "presentation",
    "requires_schemas",
  ]) {
    expect(dead in manifest).toBe(false);
  }

  // schemas/ discrimination rule: an entity file NEVER has "version"; a facet
  // file ALWAYS does.
  const entity = JSON.parse(readFileSync(join(dir, "schemas", "item.json"), "utf8")) as Record<
    string,
    unknown
  >;
  expect("version" in entity).toBe(false);
  expect(typeof entity.name).toBe("string");
  expect(typeof entity.description).toBe("string");
  const facet = JSON.parse(
    readFileSync(join(dir, "schemas", "item.details.json"), "utf8"),
  ) as Record<string, unknown>;
  expect(facet.version).toBe(1);
  expect(facet.type).toBe("object");

  // README.md is real markdown (the catalog detail page).
  expect(readFileSync(join(dir, "README.md"), "utf8").startsWith("# ")).toBe(true);

  // No lifecycle/ folder — install is native schema registration (v3).
  expect(existsSync(join(dir, "lifecycle"))).toBe(false);

  // The module unit test (testbar requirement) is a real .ts test file.
  const tests = readdirSync(join(dir, "module", "__tests__"));
  expect(tests.some((t) => t.endsWith(".test.ts"))).toBe(true);

  // tsconfig keeps legacy decorators (the isolate + build contract).
  const tsconfig = readFileSync(join(dir, "tsconfig.json"), "utf8");
  expect(tsconfig).toContain("\"experimentalDecorators\": true");

  // Invalid ids and collisions are refused.
  expect(() => scaffoldPlugin("Bad-Id", out)).toThrow();
  expect(() => scaffoldPlugin("acme_crm", out)).toThrow(); // already exists

  rmSync(out, { recursive: true, force: true });
});
