import type { JSX } from "react";
export type EngagementChannelColor = "blue" | "amber" | "purple" | "green";
export interface EngagementChannelChipProps {
    readonly label: string;
    readonly color?: EngagementChannelColor;
    readonly className?: string;
}
/**
 * Small channel chip for engagement cards (Telegram, Email, Zoom, Slack, etc.).
 * Matches B1 design — colored background with matching text.
 */
export declare function EngagementChannelChip({ label, color, className, }: EngagementChannelChipProps): JSX.Element;
