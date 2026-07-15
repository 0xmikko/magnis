import type { ReactNode, JSX } from "react";
export interface ChannelChipProps {
    /** Optional leading icon */
    readonly icon?: ReactNode;
    /** Label text */
    readonly label: string;
    /** Extra className */
    readonly className?: string;
}
/**
 * A small pill-shaped chip with an optional icon and label.
 * Used for channel indicators, tag-like labels, and small badges.
 */
export declare function ChannelChip({ icon, label, className }: ChannelChipProps): JSX.Element;
