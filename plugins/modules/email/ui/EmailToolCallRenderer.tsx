import { useEffect, useState } from "react";
import type { JSX } from "react";
import { Icon } from "@magnis/host/ui";
import type { AgentRendererProps, AppRuntime, ToolCallRendererPayload } from "@magnis/host/runtime";
import { BaseToolCallCard } from "@magnis/host/base";
import { ExpandableEntityCard } from "@magnis/host/agent";
import { extractEntities } from "@magnis/host/agent";

/** Resolve attachment_ids to filenames. */
function useAttachmentNames(
  attachmentIds: readonly string[] | undefined,
  runtime: AppRuntime,
): readonly string[] {
  const [names, setNames] = useState<readonly string[]>([]);

  useEffect(() => {
    if (!attachmentIds || attachmentIds.length === 0) {
      setNames([]);
      return;
    }
    let cancelled = false;
    Promise.all(
      attachmentIds.map((id) =>
        runtime.transport
          .rpc<Record<string, unknown>>("file.get", { id })
          .then((r) => (r.name as string) ?? "attachment")
          .catch(() => "attachment"),
      ),
    ).then((resolved) => {
      if (!cancelled) setNames(resolved);
    });
    return () => { cancelled = true; };
  }, [attachmentIds, runtime.transport]);

  return names;
}

interface EmailContext {
  readonly from: string;
  readonly to: string;
  readonly toName?: string;
  readonly subject: string;
  readonly previousText?: string;
  readonly previousSender?: string;
  readonly previousDate?: string;
}

function useEmailContext(
  emailId: string | undefined,
  runtime: AppRuntime,
): EmailContext | null {
  const [ctx, setCtx] = useState<EmailContext | null>(null);

  useEffect(() => {
    if (!emailId) return;
    let cancelled = false;
    runtime.transport
      .rpc("email.get", { id: emailId })
      .then((result: unknown) => {
        if (cancelled) return;
        const r = result as Record<string, unknown>;
        const metadata = r.metadata as Record<string, unknown> | undefined;
        const sender = (metadata?.from_address as string) ?? (r.sender as string) ?? "";
        const senderName = (r.sender as string) ?? undefined;
        const myAddress = (metadata?.to_addresses as string) ?? "";
        setCtx({
          from: myAddress,
          to: sender,
          toName: senderName,
          subject: r.subject as string ?? "",
          previousText: r.body as string | undefined,
          previousSender: senderName,
          previousDate: r.timestamp
            ? new Date(r.timestamp as string).toLocaleDateString("en-US", {
                month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
              })
            : undefined,
        });
      })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [emailId, runtime.transport]);

  return ctx;
}

/** Shared email preview content used by single and batch renderers. */
export function EmailPreviewContent({
  subject,
  body,
  attachmentNames,
}: {
  readonly subject?: string;
  readonly body: string;
  readonly attachmentNames: readonly string[];
}): JSX.Element {
  return (
    <>
      {subject && (
        <div className="mb-1 text-[11px]">
          <span className="text-rose-400/80">Subject:</span>{" "}
          <span className="text-agent-text">{subject}</span>
        </div>
      )}
      <p className="mb-2 whitespace-pre-wrap text-[13px] leading-[1.5] text-agent-text">
        {body}
      </p>
      {attachmentNames.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {attachmentNames.map((name, i) => (
            <span key={i} className="flex items-center gap-1 rounded bg-surface-secondary px-2 py-0.5 text-[11px] text-agent-text-muted">
              <Icon name="paperclip" size={10} />
              {name}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

export function EmailToolCallRenderer({
  payload,
  runtime,
}: AgentRendererProps<ToolCallRendererPayload>): JSX.Element {
  const { toolCall: tc, toolResult, isAllowlisted, superseded, onApprove, onDeny, onEdit, onAllowlistToggle } = payload;
  const args = tc.args as Record<string, unknown>;
  const isReply = tc.name.includes("reply");
  const verb = isReply ? "Reply" : "Send";

  const emailId = args.email_id as string | undefined;
  const hasDirectFields = args.to != null || args.subject != null;
  // Pending: fetch the reply context email so we can quote it in the
  // preview. Skipped after approval because we then render the
  // unified EmailCard which carries its own snapshot.
  const emailCtx = useEmailContext(
    tc.status === "pending" && !hasDirectFields ? emailId : undefined,
    runtime,
  );

  const to = (args.to as string | undefined) ?? emailCtx?.to;
  const toName = (args.to_name as string | undefined) ?? emailCtx?.toName;
  const subject = (args.subject as string | undefined) ??
    (emailCtx?.subject ? `Re: ${emailCtx.subject.replace(/^Re:\s*/i, "")}` : undefined);
  const body = args.body != null ? String(args.body) : args.body_text != null ? String(args.body_text) : args.text != null ? String(args.text) : "";
  const attachmentNames = useAttachmentNames(args.attachment_ids as readonly string[] | undefined, runtime);

  const recipientLabel = toName ?? to ?? "recipient";

  // APPROVED — collapsed unified EmailCard with bold "Send:" / "Reply:"
  // prefix. Chevron raskryvает full body / To / Attached внутри той же
  // карточки. Snapshot берётся из toolResult.result (backend кладёт
  // schema_id="email.message" + full row at controller.rs:378-394).
  if (tc.status === "approved" && toolResult) {
    const entity = extractEntities(toolResult.result, { toolName: tc.name })[0];
    if (entity) {
      return (
        <ExpandableEntityCard
          schemaId={entity.schema_id as string}
          data={entity}
          runtime={runtime}
          action={verb}
        />
      );
    }
  }

  return (
    <BaseToolCallCard
      icon={isReply ? "corner-up-left" : "mail"}
      title={isReply ? `Reply to ${recipientLabel}` : `Email to ${recipientLabel}`}
      variant="rose"
      status={tc.status}
      toolResult={toolResult}
      superseded={superseded}
      isAllowlisted={isAllowlisted}
      primaryLabel="Send"
      primaryIcon="send"
      doneLabel="Sent"
      onApprove={onApprove}
      onDeny={onDeny}
      onEdit={onEdit}
      onAllowlistToggle={onAllowlistToggle}
    >
      <EmailPreviewContent subject={subject} body={body} attachmentNames={attachmentNames} />
      {emailCtx?.previousText && (
        <div className="mt-2 border-l-2 border-rose-500/30 pl-2.5">
          <div className="text-[10px] text-agent-text-muted mb-0.5">
            {emailCtx.previousSender}{emailCtx.previousDate ? ` · ${emailCtx.previousDate}` : ""}
          </div>
          <div className="text-[11px] text-agent-text-muted line-clamp-3">
            {emailCtx.previousText}
          </div>
        </div>
      )}
    </BaseToolCallCard>
  );
}
