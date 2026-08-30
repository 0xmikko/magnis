import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { successfulOperation, withCertifiedFixtureArtifact } from "./certification-harness";

describe("Local exact-artifact certification", () => {
  /**
   * @test-id: tst_local_cert_001
   * @scenario: scn_local_mtime_replay_001
   * @covers: plugins/sources/local/src/surfaces/notes/fetch.ts::fetchLocalNotes
   * @deterministic: yes
   * @fixtures: temporary markdown notes with fixed mtimes
   *
   * Test environment: dependency-closed staged Local artifact over real stdio.
   * Clients: Source host evidence driver.
   * Mocks: none.
   * Data: two fixed note revisions and an opaque last_mtime cursor.
   */
  test("tst_local_cert_001 exact Local artifact advances and replays mtime progress", async () => {
    const notesRoot = mkdtempSync(join(tmpdir(), "magnis-local-notes-"));
    try {
      const older = join(notesRoot, "older.md");
      const newer = join(notesRoot, "nested", "newer.md");
      mkdirSync(join(newer, ".."), { recursive: true });
      writeFileSync(older, "older");
      writeFileSync(newer, "newer");
      utimesSync(older, 1_700_000_100, 1_700_000_100);
      utimesSync(newer, 1_700_000_300, 1_700_000_300);

      await withCertifiedFixtureArtifact(
        "local",
        {
          fixtureEnvironment: { NOTES_DIR: notesRoot },
          operationArguments: {
            "magnis.sync.fetch": {
              surface: "notes",
              direction: "forward",
              cursor: { last_mtime: 1_700_000_200 },
            },
          },
        },
        ({ packageHash, receipt, evidence }) => {
          expect(receipt).toMatchObject({
            packageHash,
            sourceId: "local",
            releaseTier: "development_fixture",
            delivery: "poll",
            scenarioIds: expect.arrayContaining(["tst_local_cert_001"]),
          });
          const page = successfulOperation(evidence, "magnis.sync.fetch");
          expect(page.nextCursor).toEqual({ last_mtime: 1_700_000_300 });
          expect((page.envelopes as Array<{ remote_id: string }>).map(({ remote_id }) => remote_id))
            .toEqual([join("nested", "newer.md")]);
        },
      );
    } finally {
      rmSync(notesRoot, { recursive: true, force: true });
    }
  });
});
