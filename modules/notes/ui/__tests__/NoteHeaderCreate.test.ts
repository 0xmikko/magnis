/**
 * @test-id: tst_fe_notes_browser_001
 * @scenario: scn_notes_browser_create_001
 * @covers: modules/notes/ui/index.tsx::createNoteFromHeader
 * @deterministic: yes
 * @fixtures: inline RPC double
 *
 * Test environment: vitest happy-dom plugin UI lane
 * Clients: direct calls
 * Mocks: AppRuntime transport
 * Data: fixed created note id
 */
import { createElement } from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { AgentRuntime, AgentRendererProps, ToolCallRendererPayload, AppRuntime } from "@magnis/host/runtime";
import { NoteToolCallRenderer } from "../NoteToolCallRenderer";
import { createNoteFromHeader } from "../index";

describe("tst_fe_notes_browser_001 browser note creation", () => {
  it("sends a nonblank body and selects the created note", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ id: "note-created" })
      .mockResolvedValueOnce({ items: [{ id: "note-created" }] });
    const onCreated = vi.fn();
    const runtime = { transport: { rpc } } as unknown as AppRuntime;

    await createNoteFromHeader(runtime, onCreated);

    expect(rpc).toHaveBeenCalledWith(
      "notes.create",
      expect.objectContaining({ title: "New Note", body: expect.stringMatching(/\S/) }),
    );
    expect(rpc).toHaveBeenCalledWith("notes.list", { limit: 100, offset: 0 });
    expect(onCreated).toHaveBeenCalledWith("note-created");
  });
});

vi.mock("@magnis/host/runtime", async (importOriginal) => ({
  ...await importOriginal<typeof import("@magnis/host/runtime")>(),
  useRouterContext: () => ({ navigate: vi.fn() }),
}));

/** @test-id: tst_fe_note_template_history_001
 * @scenario: scn_compact_legacy_template_001
 * @covers: modules/notes/ui/NoteToolCallRenderer.tsx
 * @deterministic: yes
 * @fixtures: historical template creation
 */
it.each(["notes.template.apply", "notes_template_apply"])("renders %s as note creation", (name) => {
  const props: AgentRendererProps<ToolCallRendererPayload> = {
    payload: { toolCall: { id: "template", name, args: { template: "meeting_prep", title: "Demo" }, status: "approved" },
      toolResult: { id: "template", result: { id: "note", title: "Demo", body: "Agenda" } },
      isAllowlisted: false, onApprove: vi.fn(), onDeny: vi.fn(), onEdit: vi.fn(), onAllowlistToggle: vi.fn() },
    runtime: {} as AppRuntime, agent: {} as AgentRuntime,
  };
  const view = render(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(NoteToolCallRenderer, props)));
  expect(view.getByText("New Note")).toBeTruthy();
  expect(view.queryByText("Update Note")).toBeNull();
});
