/**
 * @test-id: tst_fe_notes_browser_002
 * @scenario: scn_notes_browser_delete_001
 * @covers: plugins/modules/notes/ui/NoteDetail.tsx::NoteDetail
 * @deterministic: yes
 * @fixtures: inline note detail
 *
 * Test environment: vitest happy-dom plugin UI lane
 * Clients: Testing Library
 * Mocks: note query and mutation hooks
 * Data: fixed selected note
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { NoteDetail } from "../NoteDetail";
import type { NoteDetailView } from "../types";

const deleteSpy = vi.fn();
const note: NoteDetailView = {
  id: "note-1",
  title: "Delete me",
  body: "Body",
  pinned: false,
  created_at: "2026-08-26T00:00:00Z",
  updated_at: "2026-08-26T00:00:00Z",
  path: null,
} as unknown as NoteDetailView;

vi.mock("../queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../queries")>()),
  useNoteDetailQuery: () => ({ data: note, isLoading: false }),
}));

vi.mock("../mutations", () => ({
  useUpdateNoteMutation: () => ({ mutate: vi.fn() }),
  useDeleteNoteMutation: () => ({ mutate: deleteSpy }),
}));

describe("tst_fe_notes_browser_002 browser note deletion", () => {
  it("exposes a labeled control that invokes notes.delete for the selected note", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { readonly children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const view = render(<NoteDetail noteId="note-1" />, { wrapper });

    const deleteButton = await view.findByRole("button", { name: "Delete note" });
    fireEvent.click(deleteButton);

    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith({ id: "note-1" }));
  });
});
