/** tst_pub_toolcall_contract_001 — every tool-call renderer delegates its
 * badge and state logic to the host's `BaseToolCallCard`.
 *
 * Moved here from the host's `frontend/src/modules/_base/__tests__/BaseToolCallCard.test.ts`
 * (its "INV-7: No duplicated state logic" half), which asserted it by reading
 * three renderer files out of a submodule checkout — and named exactly three,
 * so a fourth renderer added here was never checked at all. Discovery replaces
 * the hard-coded list.
 *
 * The host keeps the other half: that `BaseToolCallCard` itself resolves a
 * failed result rather than reporting every approval as done, and that its
 * default action bar wires Deny through a handler that surfaces a rejection.
 * Those are assertions about host source and stay with it.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const MODULES = join(import.meta.dir, "..", "plugins", "modules");

function renderers(): readonly { readonly id: string; readonly path: string }[] {
  const found: { id: string; path: string }[] = [];
  for (const moduleId of readdirSync(MODULES)) {
    const uiDir = join(MODULES, moduleId, "ui");
    let entries: string[];
    try {
      entries = readdirSync(uiDir);
    } catch {
      continue;
    }
    for (const file of entries) {
      if (file.endsWith("ToolCallRenderer.tsx")) {
        found.push({ id: `${moduleId}/${file}`, path: join(uiDir, file) });
      }
    }
  }
  return found;
}

describe("tst_pub_toolcall_contract_001", () => {
  const all = renderers();

  test("the catalog ships tool-call renderers at all", () => {
    // Without this the suite below would pass over an empty list — the exact
    // failure mode the hard-coded three were protecting against.
    expect(all.length).toBeGreaterThanOrEqual(3);
  });

  for (const renderer of all) {
    test(`${renderer.id} reuses BaseToolCallCard`, () => {
      expect(readFileSync(renderer.path, "utf8")).toContain("BaseToolCallCard");
    });

    test(`${renderer.id} computes no badge colours of its own`, () => {
      // A renderer that paints its own status colours drifts from every other
      // card the moment the host's palette moves.
      const content = readFileSync(renderer.path, "utf8");
      expect(content).not.toContain("bg-emerald");
      expect(content).not.toContain("bg-red-500/20");
    });
  }
});
