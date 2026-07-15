import type {
  AvatarColor,
  FacetSummary,
  LinkedEntitySummary,
  SidebarData,
} from "@magnis/host/base";

export interface MessageListItem {
  readonly id: string;
  readonly sender: string | null;
  readonly subject: string | null;
  readonly preview: string | null;
  readonly channel: string;
  readonly timestamp: string;
  readonly created_at: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface MessageDetailView extends MessageListItem {
  readonly body: string | null;
  readonly canonical: Record<string, unknown>;
  readonly facets: readonly FacetSummary[];
  readonly linked_entities: readonly LinkedEntitySummary[];
}

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
