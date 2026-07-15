import { useCallback, useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { EditableTitle, Icon, IconButton } from "@magnis/host/ui";
import { DetailPane } from "@magnis/host/layout";
import { MarkdownEditor } from "@magnis/host/markdown";
import { useEditorMentionSuggestion } from "@magnis/host/markdown";
import { noteKeys, useNoteDetailQuery } from "./queries";
import { useUpdateNoteMutation, useDeleteNoteMutation } from "./mutations";
import type { NoteDetailView } from "./types";

export interface NoteDetailProps {
  readonly noteId: string;
}

function formatLastUpdated(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Strip a leading `# <title>` markdown heading from the body when it
 * duplicates the note's title (which is already shown in the panel
 * header). Both the agent and `notes.create` historically wrote
 * `# {title}\n` into the body for empty notes — that made the title
 * render twice on the surface.
 *
 * Only the FIRST heading is considered, and only when its trimmed text
 * matches the title (case-insensitive). User-typed headings deeper in
 * the body are left alone.
 */
function stripDuplicatedTitleHeading(body: string, title: string | null | undefined): string {
  const trimmedTitle = title?.trim();
  if (!trimmedTitle) return body;
  const escaped = trimmedTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^\\s*#\\s+${escaped}\\s*\\n+`, "i");
  return body.replace(pattern, "");
}

export function NoteDetail({ noteId }: NoteDetailProps): JSX.Element {
  const queryClient = useQueryClient();
  const { data: note, isLoading } = useNoteDetailQuery(noteId);
  const updateMutation = useUpdateNoteMutation();
  const deleteMutation = useDeleteNoteMutation();
  // Note: setSelectedNoteId was from old notes store. With BaseModule,
  // selection is managed by BaseModuleComponent via router.
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const setSelectedNoteId = useCallback((_id: string | undefined) => {}, []);

  // --- State: only valid AFTER init effect confirms data for this noteId ---
  const [localBody, setLocalBody] = useState("");
  const [editorKey, setEditorKey] = useState(0);
  const [mode, setMode] = useState<"wysiwyg" | "markdown">("wysiwyg");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- @-mention suggestion (driven by MarkdownEditor's mentionPlugin) ---
  const mentionSuggestion = useEditorMentionSuggestion();

  // --- Refs ---
  const serverBodyRef = useRef("");
  const dirtyRef = useRef(false);
  const localBodyRef = useRef(localBody);
  localBodyRef.current = localBody;

  // Which noteId the editor is confirmed initialized for.
  // This is the GATE: editor renders ONLY when readyId === noteId.
  const [readyId, setReadyId] = useState<string | null>(null);

  // Synchronously block rendering when noteId changes.
  // This runs during render, BEFORE any effects or Milkdown callbacks.
  const prevNoteIdRef = useRef(noteId);
  if (prevNoteIdRef.current !== noteId) {
    prevNoteIdRef.current = noteId;
    // Force loading state — editor unmounts immediately, no stale callbacks possible
    if (readyId !== null) setReadyId(null);
  }

  // --- Effect 1: Flush on noteId change or unmount ---
  // Must be declared BEFORE init effect so cleanup runs first.
  useEffect(() => {
    const id = noteId;
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (dirtyRef.current) {
        const body = localBodyRef.current;
        void queryClient.cancelQueries({ queryKey: noteKeys.detail(id) });
        queryClient.setQueryData<NoteDetailView>(
          noteKeys.detail(id),
          (old) => (old ? { ...old, body } : old),
        );
        updateMutation.mutate({ id, body });
        dirtyRef.current = false;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  // --- Effect 2: Init editor once query returns data for this noteId ---
  useEffect(() => {
    if (note?.id === noteId && readyId !== noteId) {
      const body = stripDuplicatedTitleHeading(note.body ?? "", note.title);
      serverBodyRef.current = body;
      dirtyRef.current = false;
      setLocalBody(body);
      setEditorKey((k) => k + 1);
      setMode("wysiwyg");
      // GATE OPEN: this triggers re-render where editor will mount
      setReadyId(noteId);
    }
  }, [noteId, note, readyId]);

  // --- Effect 3: Reload editor when server data changed externally (e.g. agent update) ---
  useEffect(() => {
    if (
      readyId === noteId &&
      note?.id === noteId &&
      !dirtyRef.current
    ) {
      const serverBody = stripDuplicatedTitleHeading(note.body ?? "", note.title);
      if (serverBody !== serverBodyRef.current) {
        serverBodyRef.current = serverBody;
        setLocalBody(serverBody);
        setEditorKey((k) => k + 1);
      }
    }
  }, [readyId, noteId, note]);

  // --- Handlers (only called when editor is mounted, i.e. readyId === noteId) ---

  const handleBodyChange = useCallback(
    (markdown: string) => {
      // Extra safety: ignore callbacks from wrong noteId
      if (readyId !== noteId) return;

      setLocalBody(markdown);

      // Milkdown fires markdownUpdated on init with the same content — skip save
      if (markdown === serverBodyRef.current) return;

      dirtyRef.current = true;
      void queryClient.cancelQueries({ queryKey: noteKeys.detail(noteId) });
      queryClient.setQueryData<NoteDetailView>(
        noteKeys.detail(noteId),
        (old) => (old ? { ...old, body: markdown } : old),
      );
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        updateMutation.mutate({ id: noteId, body: markdown });
        serverBodyRef.current = markdown;
      }, 800);
    },
    [noteId, readyId, updateMutation, queryClient],
  );

  const handleRawChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (readyId !== noteId) return;
      const value = e.target.value;
      setLocalBody(value);
      dirtyRef.current = value !== serverBodyRef.current;
      if (dirtyRef.current) {
        void queryClient.cancelQueries({ queryKey: noteKeys.detail(noteId) });
        queryClient.setQueryData<NoteDetailView>(
          noteKeys.detail(noteId),
          (old) => (old ? { ...old, body: value } : old),
        );
      }
    },
    [noteId, readyId, queryClient],
  );

  const flushAndSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (dirtyRef.current) {
      updateMutation.mutate({ id: noteId, body: localBody });
      serverBodyRef.current = localBody;
      dirtyRef.current = false;
    }
  }, [noteId, localBody, updateMutation]);

  // Wired to the context menu in Phase 5 — kept referenced until then.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleDelete = useCallback(() => {
    deleteMutation.mutate({ id: noteId });
    setSelectedNoteId(undefined);
  }, [noteId, deleteMutation, setSelectedNoteId]);
  void handleDelete;

  const handleTitleCommit = useCallback((newTitle: string) => {
    if (newTitle !== note?.title) {
      queryClient.setQueryData<NoteDetailView>(
        noteKeys.detail(noteId),
        (old) => (old ? { ...old, title: newTitle } : old),
      );
      updateMutation.mutate({ id: noteId, title: newTitle });
    }
  }, [note?.title, noteId, updateMutation, queryClient]);

  const toggleMode = useCallback(() => {
    if (mode === "markdown") {
      updateMutation.mutate({ id: noteId, body: localBody });
      serverBodyRef.current = localBody;
      dirtyRef.current = false;
      setEditorKey((k) => k + 1);
    }
    setMode((m) => (m === "wysiwyg" ? "markdown" : "wysiwyg"));
  }, [mode, noteId, localBody, updateMutation]);

  // --- GATE: editor only renders when readyId === noteId ---
  // This means: query returned data AND init effect processed it AND localBody is set.
  // No editor = no Milkdown = no stale callbacks = no race condition.
  if (isLoading || note?.id !== noteId || readyId !== noteId) {
    return (
      <DetailPane>
        <div className="flex items-center justify-center h-full text-content-tertiary text-base">
          Loading...
        </div>
      </DetailPane>
    );
  }

  const lastUpdated = formatLastUpdated(note.updated_at ?? note.created_at);

  return (
    <DetailPane contentClassName="bg-surface flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-edge shrink-0">
        <div className="flex-1 min-w-0 mr-3">
          <EditableTitle
            value={note.title}
            onCommit={handleTitleCommit}
            className="text-lg"
          />
          <div className="text-xs text-content-tertiary mt-0.5">
            {lastUpdated}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <IconButton
            variant="ghost"
            onClick={toggleMode}
            label={mode === "wysiwyg" ? "Markdown" : "Editor"}
          >
            <Icon name={mode === "wysiwyg" ? "code" : "edit"} size={15} />
          </IconButton>
          {note.pinned && (
            <Icon name="pin" size={14} className="text-accent" />
          )}
          <IconButton variant="ghost">
            <Icon name="ellipsis-vertical" size={15} />
          </IconButton>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0">
        {mode === "wysiwyg" ? (
          <MarkdownEditor
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            key={`note-${noteId}-${editorKey}`}
            initialValue={localBody}
            onChange={handleBodyChange}
            placeholder="Start writing..."
            autoFocus
            mentionSuggestion={mentionSuggestion}
          />
        ) : (
          <textarea
            className="w-full h-full bg-transparent text-content text-sm font-mono p-4 outline-none resize-none"
            value={localBody}
            onChange={handleRawChange}
            onBlur={flushAndSave}
            spellCheck={false}
            autoFocus
          />
        )}
      </div>
    </DetailPane>
  );
}
