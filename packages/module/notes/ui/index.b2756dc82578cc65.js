// plugins/modules/notes/ui/index.tsx
import { Icon as Icon2 } from "/api/plugins/__host-shim.js?m=ui";
import { defineModule } from "/api/plugins/__host-shim.js?m=base";

// plugins/modules/notes/ui/EntityCards.tsx
import { useContext, useState } from "/api/plugins/__host-shim.js?m=react";
import { BaseEntityCard } from "/api/plugins/__host-shim.js?m=base";
import { ActionPrefix } from "/api/plugins/__host-shim.js?m=base";
import { ExpansionContext } from "/api/plugins/__host-shim.js?m=agent";
import { jsx, jsxs } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
var CLAMP_LINES = 20;
function noteBody(data) {
  if (typeof data.body !== "string" || data.body.length === 0)
    return;
  const title = typeof data.title === "string" ? data.title : typeof data.name === "string" ? data.name : "";
  return stripDuplicatedTitleHeading(data.body, title);
}
function stripDuplicatedTitleHeading(body, title) {
  const trimmedTitle = title.trim();
  if (trimmedTitle.length === 0)
    return body;
  const escaped = trimmedTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^\\s*#\\s+${escaped}\\s*\\n+`, "i");
  return body.replace(pattern, "");
}
function noteHasMore(data) {
  return noteBody(data) !== undefined;
}
function NoteCard(props) {
  const { data, action } = props;
  const title = data.title ?? data.name;
  const body = noteBody(data);
  const preview = body ? body.slice(0, 80).replace(/\n/g, " ") : undefined;
  const { expanded } = useContext(ExpansionContext);
  const [showAll, setShowAll] = useState(false);
  const lines = body?.split(`
`) ?? [];
  const clamped = body !== undefined && lines.length > CLAMP_LINES && !showAll;
  const visible = body === undefined ? undefined : clamped ? lines.slice(0, CLAMP_LINES).join(`
`) : body;
  return /* @__PURE__ */ jsx(BaseEntityCard, {
    ...props,
    children: /* @__PURE__ */ jsxs("div", {
      className: "min-w-0 flex-1",
      children: [
        /* @__PURE__ */ jsxs("span", {
          className: "block truncate text-[12px] font-medium text-content",
          children: [
            /* @__PURE__ */ jsx(ActionPrefix, {
              action
            }),
            title ?? "Untitled note"
          ]
        }),
        !expanded && preview && /* @__PURE__ */ jsx("span", {
          className: "block truncate text-[11px] text-content-tertiary",
          children: preview
        }),
        expanded && visible !== undefined && /* @__PURE__ */ jsxs("div", {
          className: "mt-1",
          children: [
            /* @__PURE__ */ jsxs("div", {
              className: "whitespace-pre-wrap break-words text-[11px] text-content",
              children: [
                visible,
                clamped && "…"
              ]
            }),
            lines.length > CLAMP_LINES && /* @__PURE__ */ jsx("button", {
              type: "button",
              onClick: (e) => {
                e.stopPropagation();
                e.preventDefault();
                setShowAll((v) => !v);
              },
              className: "mt-1 text-[11px] text-content-tertiary hover:text-content",
              children: showAll ? "Show less" : `Show all ${String(lines.length)} lines`
            })
          ]
        })
      ]
    })
  });
}

// plugins/modules/notes/ui/NoteDetail.tsx
import { useCallback, useEffect, useRef, useState as useState2 } from "/api/plugins/__host-shim.js?m=react";
import { useQueryClient as useQueryClient2 } from "/api/plugins/__host-shim.js?m=react-query";
import { EditableTitle, Icon, IconButton } from "/api/plugins/__host-shim.js?m=ui";
import { DetailPane } from "/api/plugins/__host-shim.js?m=layout";
import { MarkdownEditor } from "/api/plugins/__host-shim.js?m=markdown";
import { useEditorMentionSuggestion } from "/api/plugins/__host-shim.js?m=markdown";

// plugins/modules/notes/ui/queries.ts
import { useQuery } from "/api/plugins/__host-shim.js?m=react-query";
import { useAppRuntime } from "/api/plugins/__host-shim.js?m=runtime";
var noteKeys = {
  all: ["notes"],
  list: (params) => [...noteKeys.all, "list", params],
  detail: (id) => [...noteKeys.all, "detail", id]
};
function useNoteDetailQuery(id) {
  const runtime = useAppRuntime();
  return useQuery({
    queryKey: noteKeys.detail(id),
    queryFn: () => runtime.transport.rpc("notes.get", { id }),
    enabled: !!id,
    staleTime: 5000
  });
}

// plugins/modules/notes/ui/mutations.ts
import { useMutation, useQueryClient } from "/api/plugins/__host-shim.js?m=react-query";
import { useAppRuntime as useAppRuntime2 } from "/api/plugins/__host-shim.js?m=runtime";
function useUpdateNoteMutation() {
  const runtime = useAppRuntime2();
  const queryClient = useQueryClient();
  const hostQueryClient = runtime.queryClient;
  return useMutation({
    mutationFn: (params) => runtime.transport.rpc("notes.update", { ...params }),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({
        queryKey: noteKeys.detail(variables.id)
      });
      const previous = queryClient.getQueryData(noteKeys.detail(variables.id));
      queryClient.setQueryData(noteKeys.detail(variables.id), (old) => old ? { ...old, ...variables } : old);
      let previousLists = [];
      if (variables.title !== undefined) {
        const newTitle = variables.title;
        const listKey = [...noteKeys.all, "list"];
        const selectedKey = [
          ...noteKeys.detail(variables.id),
          "selected-list-item"
        ];
        await hostQueryClient.cancelQueries({ queryKey: listKey });
        await hostQueryClient.cancelQueries({ queryKey: selectedKey });
        previousLists = [
          ...hostQueryClient.getQueriesData({ queryKey: listKey }),
          ...hostQueryClient.getQueriesData({ queryKey: selectedKey })
        ];
        hostQueryClient.setQueriesData({ queryKey: listKey }, (old) => old ? {
          ...old,
          items: old.items.map((it) => it.id === variables.id ? { ...it, title: newTitle } : it)
        } : old);
        hostQueryClient.setQueryData(selectedKey, (old) => old ? { ...old, title: newTitle } : old);
      }
      return { previous, id: variables.id, previousLists };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(noteKeys.detail(context.id), context.previous);
      }
      for (const [key, data] of context?.previousLists ?? []) {
        hostQueryClient.setQueryData(key, data);
      }
    },
    onSettled: (_data, _err, variables) => {
      hostQueryClient.invalidateQueries({ queryKey: noteKeys.all });
      queryClient.invalidateQueries({ queryKey: noteKeys.all });
      queryClient.invalidateQueries({
        queryKey: noteKeys.detail(variables.id)
      });
    }
  });
}
function useDeleteNoteMutation() {
  const runtime = useAppRuntime2();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params) => runtime.transport.rpc("notes.delete", { ...params }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: noteKeys.all });
    }
  });
}

// plugins/modules/notes/ui/NoteDetail.tsx
import { jsx as jsx2, jsxs as jsxs2 } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
function formatLastUpdated(dateStr) {
  if (!dateStr)
    return "";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}
function stripDuplicatedTitleHeading2(body, title) {
  const trimmedTitle = title?.trim();
  if (!trimmedTitle)
    return body;
  const escaped = trimmedTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^\\s*#\\s+${escaped}\\s*\\n+`, "i");
  return body.replace(pattern, "");
}
function NoteDetail({ noteId }) {
  const queryClient = useQueryClient2();
  const { data: note, isLoading } = useNoteDetailQuery(noteId);
  const updateMutation = useUpdateNoteMutation();
  const deleteMutation = useDeleteNoteMutation();
  const setSelectedNoteId = useCallback((_id) => {}, []);
  const [localBody, setLocalBody] = useState2("");
  const [editorKey, setEditorKey] = useState2(0);
  const [mode, setMode] = useState2("wysiwyg");
  const saveTimerRef = useRef(null);
  const mentionSuggestion = useEditorMentionSuggestion();
  const serverBodyRef = useRef("");
  const dirtyRef = useRef(false);
  const localBodyRef = useRef(localBody);
  localBodyRef.current = localBody;
  const [readyId, setReadyId] = useState2(null);
  const prevNoteIdRef = useRef(noteId);
  if (prevNoteIdRef.current !== noteId) {
    prevNoteIdRef.current = noteId;
    if (readyId !== null)
      setReadyId(null);
  }
  useEffect(() => {
    const id = noteId;
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (dirtyRef.current) {
        const body = localBodyRef.current;
        queryClient.cancelQueries({ queryKey: noteKeys.detail(id) });
        queryClient.setQueryData(noteKeys.detail(id), (old) => old ? { ...old, body } : old);
        updateMutation.mutate({ id, body });
        dirtyRef.current = false;
      }
    };
  }, [noteId]);
  useEffect(() => {
    if (note?.id === noteId && readyId !== noteId) {
      const body = stripDuplicatedTitleHeading2(note.body ?? "", note.title);
      serverBodyRef.current = body;
      dirtyRef.current = false;
      setLocalBody(body);
      setEditorKey((k) => k + 1);
      setMode("wysiwyg");
      setReadyId(noteId);
    }
  }, [noteId, note, readyId]);
  useEffect(() => {
    if (readyId === noteId && note?.id === noteId && !dirtyRef.current) {
      const serverBody = stripDuplicatedTitleHeading2(note.body ?? "", note.title);
      if (serverBody !== serverBodyRef.current) {
        serverBodyRef.current = serverBody;
        setLocalBody(serverBody);
        setEditorKey((k) => k + 1);
      }
    }
  }, [readyId, noteId, note]);
  const handleBodyChange = useCallback((markdown) => {
    if (readyId !== noteId)
      return;
    setLocalBody(markdown);
    if (markdown === serverBodyRef.current)
      return;
    dirtyRef.current = true;
    queryClient.cancelQueries({ queryKey: noteKeys.detail(noteId) });
    queryClient.setQueryData(noteKeys.detail(noteId), (old) => old ? { ...old, body: markdown } : old);
    if (saveTimerRef.current)
      clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      updateMutation.mutate({ id: noteId, body: markdown });
      serverBodyRef.current = markdown;
    }, 800);
  }, [noteId, readyId, updateMutation, queryClient]);
  const handleRawChange = useCallback((e) => {
    if (readyId !== noteId)
      return;
    const value = e.target.value;
    setLocalBody(value);
    dirtyRef.current = value !== serverBodyRef.current;
    if (dirtyRef.current) {
      queryClient.cancelQueries({ queryKey: noteKeys.detail(noteId) });
      queryClient.setQueryData(noteKeys.detail(noteId), (old) => old ? { ...old, body: value } : old);
    }
  }, [noteId, readyId, queryClient]);
  const flushAndSave = useCallback(() => {
    if (saveTimerRef.current)
      clearTimeout(saveTimerRef.current);
    if (dirtyRef.current) {
      updateMutation.mutate({ id: noteId, body: localBody });
      serverBodyRef.current = localBody;
      dirtyRef.current = false;
    }
  }, [noteId, localBody, updateMutation]);
  const handleDelete = useCallback(() => {
    deleteMutation.mutate({ id: noteId });
    setSelectedNoteId(undefined);
  }, [noteId, deleteMutation, setSelectedNoteId]);
  const handleTitleCommit = useCallback((newTitle) => {
    if (newTitle !== note?.title) {
      queryClient.setQueryData(noteKeys.detail(noteId), (old) => old ? { ...old, title: newTitle } : old);
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
    setMode((m) => m === "wysiwyg" ? "markdown" : "wysiwyg");
  }, [mode, noteId, localBody, updateMutation]);
  if (isLoading || note?.id !== noteId || readyId !== noteId) {
    return /* @__PURE__ */ jsx2(DetailPane, {
      children: /* @__PURE__ */ jsx2("div", {
        className: "flex items-center justify-center h-full text-content-tertiary text-base",
        children: "Loading..."
      })
    });
  }
  const lastUpdated = formatLastUpdated(note.updated_at ?? note.created_at);
  return /* @__PURE__ */ jsxs2(DetailPane, {
    contentClassName: "bg-surface flex flex-col",
    children: [
      /* @__PURE__ */ jsxs2("div", {
        className: "flex items-center justify-between px-4 py-2 border-b border-edge shrink-0",
        children: [
          /* @__PURE__ */ jsxs2("div", {
            className: "flex-1 min-w-0 mr-3",
            children: [
              /* @__PURE__ */ jsx2(EditableTitle, {
                value: note.title,
                onCommit: handleTitleCommit,
                className: "text-lg"
              }),
              /* @__PURE__ */ jsx2("div", {
                className: "text-xs text-content-tertiary mt-0.5",
                children: lastUpdated
              })
            ]
          }),
          /* @__PURE__ */ jsxs2("div", {
            className: "flex items-center gap-1 shrink-0",
            children: [
              /* @__PURE__ */ jsx2(IconButton, {
                variant: "ghost",
                onClick: toggleMode,
                label: mode === "wysiwyg" ? "Markdown" : "Editor",
                children: /* @__PURE__ */ jsx2(Icon, {
                  name: mode === "wysiwyg" ? "code" : "edit",
                  size: 15
                })
              }),
              note.pinned && /* @__PURE__ */ jsx2(Icon, {
                name: "pin",
                size: 14,
                className: "text-accent"
              }),
              /* @__PURE__ */ jsx2(IconButton, {
                variant: "ghost",
                children: /* @__PURE__ */ jsx2(Icon, {
                  name: "ellipsis-vertical",
                  size: 15
                })
              })
            ]
          })
        ]
      }),
      /* @__PURE__ */ jsx2("div", {
        className: "flex-1 min-h-0",
        children: mode === "wysiwyg" ? /* @__PURE__ */ jsx2(MarkdownEditor, {
          initialValue: localBody,
          onChange: handleBodyChange,
          placeholder: "Start writing...",
          autoFocus: true,
          mentionSuggestion
        }, `note-${noteId}-${String(editorKey)}`) : /* @__PURE__ */ jsx2("textarea", {
          className: "w-full h-full bg-transparent text-content text-sm font-mono p-4 outline-none resize-none",
          value: localBody,
          onChange: handleRawChange,
          onBlur: flushAndSave,
          spellCheck: false,
          autoFocus: true
        })
      })
    ]
  });
}

// plugins/modules/notes/ui/NoteDetailPanel.tsx
import { jsx as jsx3 } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
function NoteDetailPanel({ entityId }) {
  return /* @__PURE__ */ jsx3(NoteDetail, {
    noteId: entityId
  });
}

// plugins/modules/notes/ui/NoteToolCallRenderer.tsx
import { useState as useState3 } from "/api/plugins/__host-shim.js?m=react";
import { MarkdownText } from "/api/plugins/__host-shim.js?m=agent";
import { useQueryClient as useQueryClient3 } from "/api/plugins/__host-shim.js?m=react-query";
import { useRouterContext } from "/api/plugins/__host-shim.js?m=runtime";
import { BaseToolCallCard } from "/api/plugins/__host-shim.js?m=base";
import { jsx as jsx4, jsxs as jsxs3 } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
function NoteToolCallRenderer({
  payload,
  runtime
}) {
  const {
    toolCall: tc,
    toolResult,
    superseded,
    isAllowlisted,
    onApprove,
    onDeny,
    onAllowlistToggle
  } = payload;
  const queryClient = useQueryClient3();
  const rt = runtime;
  const router = useRouterContext();
  const args = tc.args;
  const isCreate = tc.name === "notes.create" || tc.name === "notes_create";
  const title = args.title;
  const body = typeof args.body === "string" ? args.body : typeof args.text === "string" ? args.text : "";
  const [noteId, setNoteId] = useState3(args.id);
  const handleApply = async () => {
    await onApprove();
    if (isCreate) {
      try {
        const list = await rt.transport.rpc("notes.list", { limit: 1, search: args.title });
        const first = list.items.at(0);
        if (first)
          setNoteId(first.id);
      } catch {}
    }
    queryClient.invalidateQueries();
  };
  const handleNavigate = noteId ? () => {
    router.navigate("notes", "note", noteId);
  } : undefined;
  return /* @__PURE__ */ jsxs3(BaseToolCallCard, {
    icon: isCreate ? "plus" : "notebook-pen",
    title: isCreate ? "New Note" : "Update Note",
    variant: "amber",
    status: tc.status,
    toolResult,
    superseded,
    isAllowlisted,
    primaryLabel: isCreate ? "Create" : "Update",
    primaryIcon: "check",
    doneLabel: "Applied",
    onApprove: handleApply,
    onDeny,
    onAllowlistToggle,
    onNavigate: handleNavigate,
    children: [
      title && /* @__PURE__ */ jsxs3("div", {
        className: "mb-2 text-[11px]",
        children: [
          /* @__PURE__ */ jsx4("span", {
            className: "text-amber-400/80",
            children: "Title:"
          }),
          " ",
          /* @__PURE__ */ jsx4("span", {
            className: "font-medium text-amber-100",
            children: title
          })
        ]
      }),
      /* @__PURE__ */ jsx4("div", {
        className: "rounded-lg border border-amber-500/20 bg-amber-950/40 px-3 py-2",
        children: /* @__PURE__ */ jsx4("div", {
          className: "prose-sm prose-invert max-h-64 overflow-y-auto text-[13px] leading-[1.5] text-amber-100/90",
          children: /* @__PURE__ */ jsx4(MarkdownText, {
            text: body
          })
        })
      })
    ]
  });
}

// plugins/modules/notes/ui/index.tsx
import { jsx as jsx5 } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
var NotesModule = defineModule({
  id: "notes",
  title: "Notes",
  icon: /* @__PURE__ */ jsx5(Icon2, {
    name: "notebook-pen",
    size: 26
  }),
  iconName: "notebook-pen",
  themeColor: "green",
  entityTypes: ["note"],
  primaryEntityType: "note",
  rpc: { update: "notes.update" },
  enableListRename: true,
  mapRenameParams: (id, name) => ({ id, title: name }),
  EntityCard: NoteCard,
  hasMore: noteHasMore,
  DetailPanel: NoteDetailPanel,
  detailType: "custom",
  headerActionIcon: "plus",
  onHeaderAction: (runtime, onCreated) => {
    (async () => {
      const clientId = crypto.randomUUID();
      const result = await runtime.transport.rpc("notes.create", { title: "New Note", body: "", client_id: clientId });
      onCreated(result.id);
    })();
  },
  toolCallRenderers: [
    {
      actions: ["update", "create"],
      Render: NoteToolCallRenderer
    }
  ],
  extractAllowlistTarget: (tc) => {
    const n = tc.name;
    if (n !== "notes.update" && n !== "notes.create" && n !== "notes_update" && n !== "notes_create")
      return null;
    const args = tc.args;
    const title = typeof args.title === "string" ? args.title : "note";
    return {
      action: tc.name,
      targetType: "note",
      targetId: title,
      targetLabel: title
    };
  }
});
export {
  NotesModule
};
