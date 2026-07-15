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
    readonly sourceModuleId: string;
    readonly targetModuleId: string;
    readonly targetItemId?: string;
}
export declare function getSourceVisual(moduleId: string): {
    readonly icon: IconName;
    readonly color: AvatarColor;
};
export declare function buildUnifiedTimeline(data: AgentModuleData): readonly TimelineItem[];
export declare function buildInboxTimeline(data: AgentModuleData): readonly TimelineItem[];
export declare function buildEpisodesTimeline(data: AgentModuleData): readonly TimelineItem[];
export declare function getTimelineItemById(timeline: readonly TimelineItem[], id: string): TimelineItem | undefined;
export declare function buildContextPanelProps(item: TimelineItem, linkedEntities?: readonly LinkedEntitySummary[]): Omit<ContextPanelProps, "runtime" | "onEntityClick">;
