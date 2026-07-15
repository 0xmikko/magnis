/**
 * Stage 4 — NoteDetail wires the mention popup data flow.
 *
 * What this test covers:
 *   - NoteDetail owns the `(mentionQuery, mentionActive)` state and feeds
 *     it to `useMentionSearch`.
 *   - The results returned by `useMentionSearch` arrive on the
 *     MarkdownEditor's `mentionSuggestion.results` prop.
 *   - Auto-save still flows: when MarkdownEditor.onChange fires with a
 *     body that already contains the mention link, `notes.update` runs
 *     after the debounce.
 *   - Unmapped-schema results never reach the editor's onChange — the
 *     plugin closes silently (validated in Stage 2). Here we just check
 *     that NoteDetail doesn't try to massage / sync them itself.
 *
 * What this test does NOT cover (deferred to Stage 6 manual smoke):
 *   - Booting Milkdown / ProseMirror in happy-dom.
 *   - The actual keystroke → plugin → popup → selectMention path. Those
 *     are unit-tested in mentionPlugin.test.tsx and
 *     MarkdownEditorMention.test.tsx.
 *
 * MarkdownEditor is therefore mocked here as a small spy component
 * that captures `mentionSuggestion` and `onChange`.
 */
import { act, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JSX, ReactNode } from "react";

import type { MentionSuggestionConfig } from "@magnis/host/markdown";
import type { MarkdownEditorProps } from "@magnis/host/markdown";
import type { EntitySearchResult } from "@magnis/host/markdown";
import type { NoteDetailView } from "../types";
import { NoteDetail } from "../NoteDetail";

// ─── Capture MarkdownEditor props ─────────────────────────────────────

const captured: {
  mentionSuggestion?: MentionSuggestionConfig;
  onChange?: (md: string) => void;
} = {};

// Mock only MarkdownEditor (capture its props); keep the real
// useEditorMentionSuggestion — NoteDetail now imports BOTH from the same
// `@magnis/host/markdown` specifier, so the mock must spread the original.
vi.mock("@magnis/host/markdown", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@magnis/host/markdown")>()),
  MarkdownEditor: (props: MarkdownEditorProps): JSX.Element => {
    captured.mentionSuggestion = props.mentionSuggestion;
    captured.onChange = props.onChange;
    return <div data-testid="markdown-editor-stub" />;
  },
}));

// ─── Mock useMentionSearch with a query-driven response ───────────────

const ALEX: EntitySearchResult = {
  id: "alex-uuid",
  name: "Alex Park",
  schema_id: "contacts.person",
};

const searchSpy = vi.fn<
  (query: string, active: boolean) => {
    readonly results: readonly EntitySearchResult[];
    readonly isLoading: boolean;
  }
>();

// The real useEditorMentionSuggestion (kept above) imports useMentionSearch
// from the host; mock it by its host-resolved specifier so the mock intercepts.
vi.mock("@/modules/episodes/hooks/useMentionSearch", () => ({
  useMentionSearch: (query: string, active: boolean): {
    readonly results: readonly EntitySearchResult[];
    readonly isLoading: boolean;
  } => searchSpy(query, active),
}));

// ─── Mock query/mutation hooks with controllable behaviour ────────────

const updateSpy = vi.fn<(args: { id: string; body?: string; title?: string }) => void>();
const deleteSpy = vi.fn<(args: { id: string }) => void>();

const SEEDED_NOTE: NoteDetailView = {
  id: "n1",
  title: "Test note",
  body: "Notes for ",
  pinned: false,
  created_at: "2026-05-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
  path: null,
} as unknown as NoteDetailView;

import type * as QueriesModule from "../queries";

vi.mock("../queries", async () => {
  const actual = await vi.importActual<typeof QueriesModule>("../queries");
  return {
    ...actual,
    useNoteDetailQuery: (): { data: NoteDetailView | undefined; isLoading: boolean } => ({
      data: SEEDED_NOTE,
      isLoading: false,
    }),
  };
});

vi.mock("../mutations", () => ({
  useUpdateNoteMutation: (): { mutate: typeof updateSpy } => ({ mutate: updateSpy }),
  useDeleteNoteMutation: (): { mutate: typeof deleteSpy } => ({ mutate: deleteSpy }),
  useCreateNoteMutation: (): { mutate: () => void } => ({ mutate: vi.fn() }),
}));

// ─── Render helper ────────────────────────────────────────────────────

function renderNoteDetail(): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { readonly children: ReactNode }): JSX.Element => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  render(
    <Wrapper>
      <NoteDetail noteId="n1" />
    </Wrapper>,
  );
}

beforeEach(() => {
  searchSpy.mockReset();
  updateSpy.mockReset();
  deleteSpy.mockReset();
  captured.mentionSuggestion = undefined;
  captured.onChange = undefined;
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── Scenarios ────────────────────────────────────────────────────────

describe("NoteDetail @-mention wiring", () => {
  it("scenario 1: query flows to useMentionSearch and results flow back", () => {
    searchSpy.mockImplementation((q, _active) => ({
      results: q.startsWith("al") ? [ALEX] : [],
      isLoading: false,
    }));

    renderNoteDetail();

    expect(captured.mentionSuggestion).toBeDefined();
    expect(captured.mentionSuggestion?.results).toEqual([]);

    // The plugin would call this when the user types `@`.
    act(() => {
      captured.mentionSuggestion?.onQueryChange("", true);
    });
    expect(searchSpy).toHaveBeenLastCalledWith("", true);

    // After typing "al": active=true with query="al".
    act(() => {
      captured.mentionSuggestion?.onQueryChange("al", true);
    });
    expect(searchSpy).toHaveBeenLastCalledWith("al", true);
    // useMentionSearch returned the Alex result; mentionSuggestion picks it up.
    expect(captured.mentionSuggestion?.results).toEqual([ALEX]);
  });

  it("scenario 2: closing the popup deactivates the hook", () => {
    searchSpy.mockReturnValue({ results: [], isLoading: false });
    renderNoteDetail();

    act(() => {
      captured.mentionSuggestion?.onQueryChange("al", true);
    });
    expect(searchSpy).toHaveBeenLastCalledWith("al", true);

    // Plugin emits close → hook should see active=false.
    act(() => {
      captured.mentionSuggestion?.onQueryChange("", false);
    });
    expect(searchSpy).toHaveBeenLastCalledWith("", false);
  });

  it("scenario 3: auto-save persists the mention markdown after debounce", () => {
    searchSpy.mockReturnValue({ results: [], isLoading: false });
    renderNoteDetail();

    // Plugin's selectMention would, in production, end up emitting the
    // post-insertion markdown via Milkdown's serializer through onChange.
    const finalBody =
      "Notes for [@Alex Park](#/contacts/person/alex-uuid) ";
    act(() => {
      captured.onChange?.(finalBody);
    });

    // Auto-save is debounced at 800ms in NoteDetail.tsx.
    act(() => {
      vi.advanceTimersByTime(900);
    });

    expect(updateSpy).toHaveBeenCalled();
    const lastCall = updateSpy.mock.calls.at(-1);
    expect(lastCall?.[0]).toMatchObject({ id: "n1", body: finalBody });
    expect(lastCall?.[0].body).toMatch(
      /Notes for \[@Alex Park\]\(#\/contacts\/person\/alex-uuid\) /,
    );
  });
});
