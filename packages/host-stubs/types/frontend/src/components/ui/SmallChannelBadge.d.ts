import type { ReactNode, JSX } from "react";
export interface SmallChannelBadgeProps {
    /** Leading icon */
    readonly icon?: ReactNode;
    /** Label text */
    readonly label: string;
    /** Extra className */
    readonly className?: string;
}
/**
 * A tiny channel indicator with icon and text.
 * Smaller than ChannelChip — used inside list items.
 */
export declare function SmallChannelBadge({ icon, label, className }: SmallChannelBadgeProps): JSX.Element;
