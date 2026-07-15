// tst_build_plugin_new_001 — the scaffolder produces a skeleton that satisfies
// the extension contracts: folder == manifest.id (INV-11), manifest declares
// owns/schemas/surfaces within the owned namespace, a module/__tests__ unit
// test exists (the testbar bar, DEC-14/INV-5), and the standard files are
// present. Smoke-level: structure + manifest shape, not a full build.
import { test, expect } from "bun:test";
import { existsSync, readFileSync, readdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import { scaffoldPlugin } from "./plugin-new.ts";

test("tst_build_plugin_new_001: scaffold produces a contract-satisfying skeleton", () => {
  const out = join(tmpdir(), `plugin-new-test-${process.pid}`);
  rmSync(out, { recursive: true, force: true });

  const dir = scaffoldPlugin("acme_crm", out);
  expect(dir).toBe(join(out, "modules", "acme_crm"));

  // Standard layout present.
  for (const f of [
    "manifest.json",
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

  // Manifest contract: folder == id (INV-11); namespace discipline.
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as {
    id: string;
    owns: string[];
    tier: string;
    schemas: { entities: { id: string }[]; facets: { id: string; entity_schema: string }[] };
    surfaces: { rpc_handlers: string[]; tools: string[] };
    capabilities: { facet_write_prefixes: string[] };
  };
  expect(manifest.id).toBe("acme_crm");
  expect(manifest.owns).toEqual(["acme_crm.*"]);
  expect(manifest.tier).toBe("community");
  for (const e of manifest.schemas.entities) {
    expect(e.id.startsWith("acme_crm.")).toBe(true);
  }
  for (const f of manifest.schemas.facets) {
    expect(f.id.startsWith("acme_crm.")).toBe(true);
  }
  for (const h of [...manifest.surfaces.rpc_handlers, ...manifest.surfaces.tools]) {
    expect(h.startsWith("acme_crm.")).toBe(true);
  }

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
