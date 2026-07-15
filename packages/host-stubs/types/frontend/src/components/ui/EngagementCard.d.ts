import type { JSX } from "react";
import type { IconName } from "./Icon";
import type { EngagementChannelColor } from "./EngagementChannelChip";
export type EngagementStatusColor = "accent" | "blue" | "purple" | "green" | "amber";
export interface EngagementChannel {
    readonly label: string;
    readonly color?: EngagementChannelColor;
}
export interface EngagementCardProps {
    /** Leading icon name */
    readonly icon: IconName;
    /** Icon/text color theme */
    readonly iconColor?: EngagementStatusColor;
    /** Card title */
    readonly title: string;
    /** Status badge text (e.g. "ACTIVE", "IN PROGRESS") */
    readonly status: string;
    /** Status badge color */
    readonly statusColor?: EngagementStatusColor;
    /** Description text */
    readonly description: string;
    /** Channel chips (Telegram, Email, etc.) */
    readonly channels?: readonly EngagementChannel[];
    /** Click handler */
    readonly onClick?: () => void;
    /** Extra className */
    readonly className?: string;
}
/**
 * Engagement/project card with icon, title, status badge, description, and channel chips.
 * Matches B1 design — reusable for partnerships, tasks, collaborations.
 */
export declare function EngagementCard({ icon, iconColor, title, status, statusColor, description, channels, onClick, className, }: EngagementCardProps): JSX.Element;
