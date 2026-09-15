/** tst_pub_query_migration_001 — module data hooks read through TanStack
 * Query, not through a hand-rolled WebSocket + useState pair.
 *
 * The catalog's half of the host's `frontend/src/modules/__tests__/queryMigration.test.ts`,
 * which asserted it by reading these files out of a submodule checkout. The
 * host keeps its own half (episodes, agent chat, the retired
 * `AppStoreProvider`); these are facts about THESE modules and change when
 * they change.
 *
 * Structural, and deliberately so: the migration is finished, and what these
 * pin is that it stays finished — a module that reintroduces `useWebSocket`
 * or its own realtime hook gets two live data paths that disagree, which is
 * the bug the migration removed.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const MODULES = join(import.meta.dir, "..", "plugins", "modules");

function read(relativePath: string): string {
  return readFileSync(join(MODULES, relativePath), "utf8");
}

function exists(relativePath: string): boolean {
  return existsSync(join(MODULES, relativePath));
}

describe("tst_pub_query_migration_001", () => {
  test("contacts is a defineModule module with no bespoke data hook", () => {
    expect(read("contacts/ui/index.tsx")).toContain("defineModule");
    expect(exists("contacts/ui/hooks/useContactsData.ts")).toBe(false);
  });

  test("companies is a defineModule module with no bespoke data hook", () => {
    expect(read("companies/ui/index.tsx")).toContain("defineModule");
    expect(exists("companies/ui/hooks/useCompaniesData.ts")).toBe(false);
  });

  test("companies queries carry the typed paginated envelope", () => {
    const src = read("companies/ui/queries.ts");
    expect(src).toContain("PaginatedResponse");
    expect(src).toContain("CompanyListItem");
  });

  test("email is a defineModule module, gating included, with no realtime hook", () => {
    expect(read("email/ui/index.tsx")).toContain("defineModule");
    expect(exists("email/ui/hooks/useEmailsModuleData.ts")).toBe(false);
    expect(exists("email/ui/hooks/useEmailsRealtime.ts")).toBe(false);
  });

  test("email reads the canonical source status, not the retired integrations call", () => {
    const src = read("email/ui/queries.ts");
    expect(src).toContain("useGoogleSourceConnectedQuery");
    expect(src).toContain('"source.status.list"');
    // `integrations.status` is gone from the host; a module still calling it
    // would show a connection state nothing updates.
    expect(src).not.toContain("integrations.status");
  });

  test("meetings data comes from queries, with no manual invalidation", () => {
    const src = read("meetings/ui/hooks/useMeetingsData.ts");
    expect(src).not.toContain("useWebSocket");
    expect(src).toContain("useMeetingsListQuery");
    expect(src).not.toContain("onSchemaEvent");
    expect(src).not.toContain("setVersion");
  });

  test("meetings queries carry the typed paginated envelope", () => {
    const src = read("meetings/ui/queries.ts");
    expect(src).toContain("PaginatedResponse");
    expect(src).toContain("MeetingListItem");
  });
});
