/**
 * Agent module helpers — context key parsing, timeline construction,
 * and context panel building.
 */
import type { IconName } from "../../components/ui/Icon";
import type { EpisodeListRow } from "@magnis/client-core";
import type { LinkedEntitySummary } from "@magnis/sdk";
import type { EpisodeSubtreeItem } from "@magnis/sdk/core/episode";
import type { AgentModuleData } from "./types";
import type { AvatarColor } from "../shared/types";
import type { ContextPanelProps } from "../../panels";
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
    readonly rootEpisodeId: string;
    readonly rootTitle: string;
    readonly id: string;
    readonly title: string;
    readonly activityAt: string;
}
interface NeedsReplySource {
    readonly rootEpisodeId: string;
    readonly rootTitle: string;
    readonly id: string;
    readonly title: string;
    readonly status?: string;
    readonly isArchived?: boolean;
    readonly updatedAt: string;
    readonly date?: string;
    readonly lastMessageAt?: string;
}
export declare function selectNeedsReplyEpisodes(episodes: readonly NeedsReplySource[]): readonly NeedsReplyEpisode[];
export declare function buildEpisodesTimeline(data: AgentModuleData): readonly TimelineItem[];
/** Frontend-only visual projection over the renderer-neutral list. */
export declare function buildSharedEpisodesTimeline(episodes: readonly EpisodeListRow[]): readonly TimelineItem[];
export declare function getTimelineItemById(timeline: readonly TimelineItem[], id: string): TimelineItem | undefined;
export declare function buildEpisodeTreeContextEntities(items: readonly EpisodeSubtreeItem[], parentEpisodeId: string | null, parentTitle: string | null, rootEpisodeId: string | null): ContextPanelProps["connectedEntities"];
export declare function buildContextPanelProps(item: TimelineItem, linkedEntities?: readonly LinkedEntitySummary[]): Omit<ContextPanelProps, "runtime" | "onEntityClick">;
export {};
