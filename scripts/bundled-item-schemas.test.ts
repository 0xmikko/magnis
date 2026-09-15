/** tst_pub_item_schemas_001 — every syncing module declares the schema
 * its surface carries.
 *
 * Moved here from the host's `tst_bts_prt_manifest_v3.test.ts`
 * (`tst_pr_manifest_017`), which asserted it by reading this repository
 * through a submodule checkout. The rule it pins is about THESE PACKAGES:
 * that `telegram`'s `telegram` surface carries `telegram.message` is a
 * fact about the telegram module, and it changes when the telegram module
 * changes — which is the test for where an assertion belongs.
 *
 * What stayed in the host is the rule that is the HOST's: that a manifest
 * declaring a sync surface must name an item schema at all, asserted over
 * its own fixture package. This is the other half — that the packages
 * shipped here satisfy it.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";
import { parse as parseToml } from "smol-toml";

const MODULES = join(import.meta.dir, "..", "plugins", "modules");

interface SurfaceDecl {
  item?: string;
  reconciliation?: {
    mode?: string;
  };
}

interface ModuleManifest {
  id?: string;
  surfaces?: Record<string, SurfaceDecl>;
}

function manifest(moduleId: string): ModuleManifest {
  const path = join(MODULES, moduleId, "manifest.toml");
  expect(existsSync(path), `${moduleId}/manifest.toml`).toBe(true);
  return parseToml(readFileSync(path, "utf8")) as ModuleManifest;
}

describe("tst_pub_item_schemas_001", () => {
  // The four syncing modules and the schema each surface carries. A
  // module that starts syncing joins this list; one that stops leaves it.
  const expected: readonly (readonly [string, string, string])[] = [
    ["telegram", "telegram", "telegram.message"],
    ["email", "email", "email.message"],
    ["meetings", "meetings", "meetings.calendar_event"],
    ["contacts", "contacts", "contacts.person"],
  ];

  for (const [moduleId, surface, schema] of expected) {
    test(`${moduleId} declares ${surface} -> ${schema}`, () => {
      expect(manifest(moduleId).surfaces?.[surface]?.item).toBe(schema);
    });
  }

  test("no syncing module declares a surface without an item schema", () => {
    // The generalisation of the rows above: whatever the list holds, a
    // declared surface without an item schema is a package that cannot
    // tell the host what it syncs.
    for (const [moduleId] of expected) {
      const surfaces = manifest(moduleId).surfaces ?? {};
      for (const [name, decl] of Object.entries(surfaces)) {
        expect(typeof decl.item, `${moduleId}: surface '${name}'`).toBe("string");
      }
    }
  });

  test("every syncing surface declares its host reconciliation policy", () => {
    for (const [moduleId] of expected) {
      const surfaces = manifest(moduleId).surfaces ?? {};
      for (const [name, decl] of Object.entries(surfaces)) {
        expect(decl.reconciliation, `${moduleId}: surface '${name}'`).toEqual({ mode: "none" });
      }
    }
  });
});
