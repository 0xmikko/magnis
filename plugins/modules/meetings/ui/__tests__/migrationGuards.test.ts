/** Meetings keeps selection and search in the module framework, not in
 * component state.
 *
 * Moved here from the host's `frontend/src/modules/__tests__/storeAndTransportMigration.test.ts`
 * (its "W1: MeetingsModule uses data hooks" section), which read this file
 * out of a submodule checkout. The host keeps its own W1/W2 sections —
 * settings, and the host modules that lost their bespoke `*Module.tsx`.
 *
 * Structural, like its telegram sibling next door: what it pins is that a
 * finished migration stays finished. A component that goes back to
 * `useState` for `selectedId` has a second source of truth for the selection,
 * and the module store and the pane immediately disagree about what is open.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const MEETINGS_MODULE = join(import.meta.dirname, "..", "MeetingsModule.tsx");

function source(): string {
  return readFileSync(MEETINGS_MODULE, "utf8");
}

describe("meetings module store migration", () => {
  it("takes its list from a data hook", () => {
    const src = source();
    expect(src.includes("useMeetingsData") || src.includes("useModuleList")).toBe(true);
  });

  it("keeps neither selection nor search in component state", () => {
    const src = source();
    expect(src).not.toMatch(/useState.*selectedId/);
    expect(src).not.toMatch(/useState.*searchQuery/);
  });
});
