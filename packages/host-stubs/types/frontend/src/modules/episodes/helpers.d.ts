/**
 * Agent module helpers — context key parsing, timeline construction,
 * and context panel building.
 */
import type { IconName } from "../../components/ui/Icon";
import type { AgentModuleData, LinkedEntitySummary } from "./types";
import type { AvatarColor } from "../shared/types";
import type { ContextPanelProps } from "../../agent/ContextPanel";
export interface TimelineItem {
    readonly id: string;
    readonly title: string;
    readonly preview: string;
    readonly time: string;
    readonly activityAt: Date | null;
    readonly iconName: IconName;
    readonly color: AvatarColor;
    readonly status?: string;
    /** Separate from `status`, which now survives archiving. */
    readonly isArchived?: boolean;
    readonly sourceModuleId: string;
    readonly targetModuleId: string;
    readonly targetItemId?: string;
}
export declare function getSourceVisual(moduleId: string): {
    readonly icon: IconName;
    readonly color: AvatarColor;
};
export declare function buildUnifiedTimeline(data: AgentModuleData): readonly TimelineItem[];
/** Chats list pane filter — "needs_reply" shows only episodes where the
 *  agent explicitly waits on the user; "all" is the default behavior. */
export type ChatListFilter = "all" | "needs_reply";
/** Single source of truth for "needs reply". `needs_input` is the ONLY
 *  status where the agent waits on the user (ask_user / pending tool
 *  approval). The former Inbox also counted `active` — a historical bug
 *  (`active` means it's the agent's turn). `idle` is deferred until
 *  unread-tracking exists. See docs/backend/episode-status.md. */
export declare const NEEDS_REPLY_STATUSES: readonly ["needs_input"];
export declare function isNeedsReplyStatus(status: string | undefined): boolean;
export declare function filterChatTimeline(items: readonly TimelineItem[], filter: ChatListFilter): readonly TimelineItem[];
/** One dropdown/badge item for the global command-bar bell. */
export interface NeedsReplyEpisode {
    readonly id: string;
    readonly title: string;
    readonly activityAt: string;
}
interface NeedsReplySource {
    readonly id: string;
    readonly title: string;
    readonly status?: string;
    readonly is_archived?: boolean;
    readonly created_at: string;
    readonly updated_at: string;
    readonly date?: string;
    readonly last_message_at?: string;
}
export declare function selectNeedsReplyEpisodes(episodes: readonly NeedsReplySource[]): readonly NeedsReplyEpisode[];
export declare function buildEpisodesTimeline(data: AgentModuleData): readonly TimelineItem[];
export declare function getTimelineItemById(timeline: readonly TimelineItem[], id: string): TimelineItem | undefined;
export declare function buildContextPanelProps(item: TimelineItem, linkedEntities?: readonly LinkedEntitySummary[]): Omit<ContextPanelProps, "runtime" | "onEntityClick">;
export {};
