import type { JSX } from "react";
import {
  Avatar,
  Icon,
  IconButton,
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
import { useEmailDetailQuery } from "./queries";
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

export function EmailDetailPanel({ entityId }: DetailPanelProps): JSX.Element {
  const { data: detailView, isLoading } = useEmailDetailQuery(entityId);
  const detail = detailView ? mapEmailDetailFromDetailView(detailView) : undefined;

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
          extra={<EmailHeaderExtra toAddresses={detail.toAddresses} replyTo={detail.replyTo} />}
          actions={
            <>
              <Text variant="caption" className="text-content-tertiary">{detail.sentAt}</Text>
              <IconButton variant="ghost"><Icon name="ellipsis-vertical" size={15} /></IconButton>
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
      <EmailDetailContent detail={detail} linkedEntities={detailView.linked_entities} />
    </DetailPane>
  );
}
