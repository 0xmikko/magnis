import type { JSX } from "react";
import type { IconName } from "./Icon";
export interface TriggerCondition {
    /** Condition icon */
    readonly conditionIcon: IconName;
    /** Condition text (e.g. "If: No reply for 48h on Telegram") */
    readonly conditionText: string;
    /** Action icon */
    readonly actionIcon: IconName;
    /** Action text (e.g. "Then: Send gentle nudge") */
    readonly actionText: string;
}
export interface TriggerCardProps {
    /** Leading icon */
    readonly icon?: IconName;
    /** Icon color class */
    readonly iconColor?: string;
    /** Trigger title */
    readonly title: string;
    /** Whether trigger is active (shows ON badge) */
    readonly active?: boolean;
    /** If/Then condition row */
    readonly condition?: TriggerCondition;
    /** Click handler */
    readonly onClick?: () => void;
    /** Extra className */
    readonly className?: string;
}
/**
 * Trigger card with icon, title, ON badge, and If/Then condition.
 * Matches B1 Pencil design — reusable for automation triggers.
 */
export declare function TriggerCard({ icon, iconColor, title, active, condition, onClick, className, }: TriggerCardProps): JSX.Element;
