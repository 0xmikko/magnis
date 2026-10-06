import type { AvatarColor, SidebarData } from "@magnis/host/base";
export type { MessageDetailView, MessageListItem } from "../types";

export interface EmailItem {
  readonly id: string;
  readonly sender: string;
  readonly initials: string;
  readonly subject: string;
  readonly preview: string;
  readonly time: string;
  readonly color: AvatarColor;
  readonly replyBadge?: boolean;
}

export interface EmailDetailAction {
  readonly label: string;
  readonly variant: "primary" | "secondary";
}

export interface EmailAttachment {
  readonly filename: string;
  readonly mime_type: string;
  readonly size: number;
  readonly path: string;
  /** S5: the file node the `file.attachment` edge ends at. */
  readonly id?: string;
}

export interface EmailDetailData {
  readonly fromEmail: string;
  readonly senderName: string;
  readonly sentAt: string;
  readonly toAddresses?: string;
  readonly replyTo?: string;
  readonly bodyParagraphs: readonly string[];
  readonly bodyHtml?: string;
  readonly actions: readonly EmailDetailAction[];
  readonly attachments?: readonly EmailAttachment[];
}

export interface EmailThreadItem {
  readonly id: string;
  readonly subject: string;
  readonly participants: readonly string[];
  readonly latestSender: string;
  readonly initials: string;
  readonly preview: string;
  readonly time: string;
  readonly color: AvatarColor;
  readonly messageCount: number;
}

export interface EmailThreadDetailData {
  readonly subject: string;
  readonly messages: readonly EmailDetailData[];
  readonly participantCount: number;
}

export interface EmailsModuleData {
  readonly listTitle: string;
  readonly searchPlaceholder: string;
  readonly detailSubtitlePrefix: string;
  readonly replyBadgeLabel: string;
  readonly sidebarTitle: string;
  readonly emails: readonly EmailItem[];
  readonly detailById: Readonly<Record<string, EmailDetailData>>;
  readonly sidebar: SidebarData;
  readonly threads?: readonly EmailThreadItem[];
  readonly threadDetailById?: Readonly<Record<string, EmailThreadDetailData>>;
}
