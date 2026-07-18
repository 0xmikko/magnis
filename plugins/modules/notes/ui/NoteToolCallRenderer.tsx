import { useState } from "react";
import type { JSX } from "react";
import { MarkdownText } from "@magnis/host/agent";
import { useQueryClient } from "@tanstack/react-query";
import type {
  AgentRendererProps,
  ToolCallRendererPayload,
} from "@magnis/host/runtime";
import { useRouterContext } from "@magnis/host/runtime";
import { BaseToolCallCard } from "@magnis/host/base";

export function NoteToolCallRenderer({
  payload,
  runtime,
}: AgentRendererProps<ToolCallRendererPayload>): JSX.Element {
  const {
    toolCall: tc,
    toolResult,
    superseded,
    isAllowlisted,
    onApprove,
    onDeny,
    onAllowlistToggle,
  } = payload;
  const queryClient = useQueryClient();
  const rt = runtime;
  const router = useRouterContext();
  const args = tc.args as Record<string, unknown>;
  const isCreate = tc.name === "notes.create" || tc.name === "notes_create";
  const title = args.title as string | undefined;
  const body =
    typeof args.body === "string"
      ? args.body
      : typeof args.text === "string"
        ? args.text
        : "";

  const [noteId, setNoteId] = useState<string | undefined>(
    args.id as string | undefined,
  );

  const handleApply = async (): Promise<void> => {
    await onApprove();
    if (isCreate) {
      try {
        const list = await rt.transport.rpc<{ items: { id: string }[] }>(
          "notes.list",
          { limit: 1, search: args.title as string },
        );
        const first = list.items.at(0);
        if (first) setNoteId(first.id);
      } catch {
        /* best effort */
      }
    }
    void queryClient.invalidateQueries();
  };

  const handleNavigate = noteId
    ? (): void => {
        router.navigate("notes", "note", noteId);
      }
    : undefined;

  return (
    <BaseToolCallCard
      icon={isCreate ? "plus" : "notebook-pen"}
      title={isCreate ? "New Note" : "Update Note"}
      variant="amber"
      status={tc.status}
      toolResult={toolResult}
      superseded={superseded}
      isAllowlisted={isAllowlisted}
      primaryLabel={isCreate ? "Create" : "Update"}
      primaryIcon="check"
      doneLabel="Applied"
      onApprove={handleApply}
      onDeny={onDeny}
      onAllowlistToggle={onAllowlistToggle}
      onNavigate={handleNavigate}
    >
      {/* Title */}
      {title && (
        <div className="mb-2 text-[11px]">
          <span className="text-amber-400/80">Title:</span>{" "}
          <span className="font-medium text-amber-100">{title}</span>
        </div>
      )}
      {/* Body — markdown preview */}
      <div className="rounded-lg border border-amber-500/20 bg-amber-950/40 px-3 py-2">
        <div className="prose-sm prose-invert max-h-64 overflow-y-auto text-[13px] leading-[1.5] text-amber-100/90">
          <MarkdownText text={body} />
        </div>
      </div>
    </BaseToolCallCard>
  );
}
