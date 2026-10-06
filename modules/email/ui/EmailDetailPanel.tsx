import { useRef, useState, type JSX } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAppRuntime } from "@magnis/host/runtime";
import type { SetSyncEnabledResult } from "@magnis/plugin-sdk";
import {
  Avatar,
  ActionButton,
  Row,
  Stack,
  Text,
  TOPBAR_AVATAR_SIZE,
  TopBarHeader,
} from "@magnis/host/ui";
import { DetailPane } from "@magnis/host/layout";
import { PaneFooterBar } from "@magnis/host/layout";
import { EmailReplyComposer } from "./EmailReplyComposer";
import { EmailDetailContent, isRichHtml } from "./EmailDetailContent";
import { mapEmailDetailFromDetailView } from "./helpers";
import { emailKeys, useEmailDetailQuery } from "./queries";
import type { DetailPanelProps } from "@magnis/host/base";

function EmailHeaderExtra({ toAddresses, replyTo }: { toAddresses?: string; replyTo?: string }): JSX.Element | null {
  if (!toAddresses && !replyTo) return null;
  return (
    <Stack gap={0.5} className="mt-0.5">
      {toAddresses && (
        <Row gap={1} align="baseline">
          <Text variant="caption" className="text-content-tertiary shrink-0">To:</Text>
          <Text variant="caption" truncate>{toAddresses}</Text>
        </Row>
      )}
      {replyTo && (
        <Row gap={1} align="baseline">
          <Text variant="caption" className="text-content-tertiary shrink-0">Reply-To:</Text>
          <Text variant="caption" truncate>{replyTo}</Text>
        </Row>
      )}
    </Stack>
  );
}

export function EmailDetailPanel({ entityId }: Pick<DetailPanelProps, "entityId">): JSX.Element {
  const { data: detailView, isLoading } = useEmailDetailQuery(entityId);
  const detail = detailView ? mapEmailDetailFromDetailView(detailView) : undefined;
  const runtime = useAppRuntime();
  const queryClient = useQueryClient();
  const saving = useRef(false);
  const [syncStatus, setSyncStatus] = useState<string>();
  const [syncError, setSyncError] = useState<string>();

  const toggleSenderSync = async (): Promise<void> => {
    const sender = detailView?.senderSync;
    if (sender === undefined || sender === null || saving.current) return;
    saving.current = true;
    setSyncError(undefined);
    setSyncStatus("Saving…");
    try {
      const response = await runtime.transport.rpc<SetSyncEnabledResult>("email.address.setSyncEnabled", {
        id: sender.id,
        syncEnabled: !sender.syncEnabled,
      });
      const result = response.results.find((item) => item.identityId === sender.id);
      if (!result) throw new Error("The synchronization change returned no result.");
      if (result.kind === "failed") throw new Error(result.message);
      setSyncStatus(result.application.kind === "pending"
        ? "Synchronization setting saved. Applying…"
        : `Synchronization setting saved, but could not be applied: ${result.application.message}`);
      await queryClient.invalidateQueries({ queryKey: emailKeys.all });
    } catch (error) {
      setSyncStatus(undefined);
      setSyncError(error instanceof Error ? error.message : String(error));
    } finally {
      saving.current = false;
    }
  };

  if (isLoading || !detail || !detailView) {
    return (
      <DetailPane>
        <div className="flex items-center justify-center h-full text-content-tertiary text-sm">
          {isLoading ? "Loading..." : "No email data"}
        </div>
      </DetailPane>
    );
  }

  // Email threadKey = metadata.thread_id. Per CLAUDE.md NO FALLBACKS:
  // if thread_id is absent we refuse to render the composer. Falling back
  // to a sentinel would collide every unrelated thread onto a single draft
  // key.
  const threadIdRaw = detailView.metadata?.thread_id;
  const threadId = typeof threadIdRaw === "string" && threadIdRaw.length > 0 ? threadIdRaw : null;

  return (
    <DetailPane
      contentClassName={detail.bodyHtml && isRichHtml(detail.bodyHtml) ? "bg-white" : undefined}
      headerNode={
        <TopBarHeader
          leading={
            <Avatar
              label={detail.senderName.charAt(0).toUpperCase()}
              color="pink"
              size={TOPBAR_AVATAR_SIZE}
            />
          }
          title={detail.senderName}
          subtitle={detail.fromEmail !== detail.senderName ? detail.fromEmail : undefined}
          extra={<>
            <EmailHeaderExtra toAddresses={detail.toAddresses} replyTo={detail.replyTo} />
            {syncStatus && <div role="status" className="text-xs text-content-secondary">{syncStatus}</div>}
            {syncError && <div role="alert" className="text-xs text-content-secondary">{syncError}</div>}
          </>}
          actions={
            <>
              <Text variant="caption" className="text-content-tertiary">{detail.sentAt}</Text>
              {detailView.senderSync && <ActionButton
                variant="default"
                size="sm"
                label={detailView.senderSync.syncEnabled ? "Stop sender synchronization" : "Start sender synchronization"}
                onClick={() => { void toggleSenderSync(); }}
              />}
            </>
          }
        />
      }
      footer={
        threadId === null ? null : (
          <PaneFooterBar tone="surface-tertiary" inset="md" withTopBorder={false} className="!pt-4 !pb-6 !bg-transparent">
            <EmailReplyComposer
              emailId={detailView.id}
              threadId={threadId}
              senderName={detail.senderName}
            />
          </PaneFooterBar>
        )
      }
    >
      <EmailDetailContent detail={detail} />
    </DetailPane>
  );
}
