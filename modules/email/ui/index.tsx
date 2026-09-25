import type { AgentHistoryBlock } from "@magnis/host/runtime";
import { toolNamesEquivalent } from "@magnis/host/agent";
import { Icon } from "@magnis/host/ui";
import { defineModule } from "@magnis/host/base";

import type { ListItem } from "@magnis/host/base";
import { EmailCard, emailHasMore } from "./EntityCards";
import { EmailDetailPanel } from "./EmailDetailPanel";
import { EmailToolCallRenderer } from "./EmailToolCallRenderer";
import { EmailBatchSendRenderer } from "./EmailBatchSendRenderer";
import { TriggerToolCallRenderer } from "./TriggerToolCallRenderer";
import { setupEventInvalidation } from "@magnis/host/runtime";
import { decodeHtmlEntities } from "@magnis/host/utils";

const EMAIL_TOOL_NAMES = new Set([
  "email.reply", "email_reply", "email__reply", "reply_email",
  "email.send", "email_send", "email__send", "send_email",
  "emails.send", "emails.reply",
  "email.batch_send", "email_batch_send", "emails.batch_send",
  "email.set_trigger", "email_set_trigger", "emails.set_trigger",
]);

function isEmailTool(name: string): boolean {
  return EMAIL_TOOL_NAMES.has(name);
}

function metaStr(meta: Record<string, unknown> | undefined, key: string): string | undefined {
  const v = meta?.[key];
  return typeof v === "string" ? v : undefined;
}

function mapEmailListItem(raw: Record<string, unknown>): ListItem {
  const meta = raw.metadata as Record<string, unknown> | undefined;
  const fromName = metaStr(meta, "from_name");
  const fromAddr = metaStr(meta, "from_address");
  const subject = metaStr(meta, "subject") ?? (raw.name as string | undefined) ?? null;
  const sender = fromName ?? fromAddr ?? (raw.sender as string | undefined) ?? null;
  const sentAt = metaStr(meta, "sent_at") ?? (raw.timestamp as string | undefined) ?? (raw.created_at as string | undefined) ?? null;
  const preview = (raw.preview as string | undefined) ?? null;

  return {
    id: raw.id as string,
    name: sender,
    schema_id: (raw.schema_id as string | undefined) ?? "",
    preview: subject ? decodeHtmlEntities(subject) : (preview ? decodeHtmlEntities(preview) : null),
    timestamp: sentAt ?? null,
    avatarUrl: null,
    is_pinned: (raw.is_pinned as boolean | undefined) ?? undefined,
    is_archived: (raw.is_archived as boolean | undefined) ?? undefined,
  };
}

const emailModule = defineModule({
  id: "email",
  title: "Emails",
  icon: <Icon name="mail" size={26} />,
  iconName: "mail",
  themeColor: "pink",
  entityTypes: ["message", "address"],
  primaryEntityType: "message",
  entityLabels: {
    message: {
      icon: "mail",
      label: "Email",
      hasMore: emailHasMore,
    },
    address: { icon: "mail", label: "Address", tabLabel: "Addresses" },
  },
  rpc: { list: "email.list", get: "email.get" },
  mapListItem: mapEmailListItem,
  DetailPanel: EmailDetailPanel,
  detailType: "custom",
  EntityCard: EmailCard,
  toolCallRenderers: [{ entity: "email.message", actions: ["create"], Render: EmailToolCallRenderer as never }],
  extractAllowlistTarget: (tc) => {
    const bound = tc.toolBinding;
    if (bound !== undefined && (bound.entity !== "email.message" || bound.operation !== "create")) return null;
    if (bound === undefined && !isEmailTool(tc.name)) return null;
    const args = tc.args as Record<string, unknown>;
    if (Array.isArray(args.messages)) return null;
    const to = typeof args.to === "string" ? args.to : null;
    if (!to) return null;
    return { action: bound === undefined ? tc.name : "email.message.create", targetType: "email_address", targetId: to, targetLabel: to };
  },
  extraSetup: (runtime) => {
    const unsub = setupEventInvalidation(
      runtime.transport,
      runtime.queryClient,
      ["sync.progress", "source.account.connected"],
      [["email"]],
    );
    return unsub;
  },
  linkedEntityDisplay: {
    "message": { label: "Emails" },
    "address": { hidden: true },
  },
});

export const EmailsModule = {
  ...emailModule,
  agent: {
    ...emailModule.agent,
    historyRenderers: [
      ...(emailModule.agent?.historyRenderers ?? []),
      { id: "email-send-history", moduleId: "email", priority: 10,
        match: (block: AgentHistoryBlock): boolean => block.toolBinding === undefined && block.toolName !== undefined && ["email.send", "email.reply", "emails.send", "emails.reply"].some((name) => toolNamesEquivalent(block.toolName ?? "", name)),
        Render: EmailToolCallRenderer as never },
      { id: "email-batch-history", moduleId: "email", priority: 10,
        match: (block: AgentHistoryBlock): boolean => block.toolBinding === undefined && block.toolName !== undefined && ["email.batch_send", "emails.batch_send"].some((name) => toolNamesEquivalent(block.toolName ?? "", name)),
        Render: EmailBatchSendRenderer as never },
      { id: "email-trigger-history", moduleId: "email", priority: 10,
        match: (block: AgentHistoryBlock): boolean => block.toolBinding === undefined && block.toolName !== undefined && ["email.set_trigger", "emails.set_trigger"].some((name) => toolNamesEquivalent(block.toolName ?? "", name)),
        Render: TriggerToolCallRenderer as never },
    ],
  },
};
