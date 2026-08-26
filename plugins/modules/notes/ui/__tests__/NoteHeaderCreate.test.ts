/**
 * @test-id: tst_fe_notes_browser_001
 * @scenario: scn_notes_browser_create_001
 * @covers: plugins/modules/notes/ui/index.tsx::createNoteFromHeader
 * @deterministic: yes
 * @fixtures: inline RPC double
 *
 * Test environment: vitest happy-dom plugin UI lane
 * Clients: direct calls
 * Mocks: AppRuntime transport
 * Data: fixed created note id
 */
import { describe, expect, it, vi } from "vitest";
import type { AppRuntime } from "@magnis/host/runtime";
import { createNoteFromHeader } from "../index";

describe("tst_fe_notes_browser_001 browser note creation", () => {
  it("sends a nonblank body and selects the created note", async () => {
    const rpc = vi.fn().mockResolvedValue({ id: "note-created" });
    const onCreated = vi.fn();
    const runtime = { transport: { rpc } } as unknown as AppRuntime;

    await createNoteFromHeader(runtime, onCreated);

    expect(rpc).toHaveBeenCalledWith(
      "notes.create",
      expect.objectContaining({ title: "New Note", body: expect.stringMatching(/\S/) }),
    );
    expect(onCreated).toHaveBeenCalledWith("note-created");
  });
});
