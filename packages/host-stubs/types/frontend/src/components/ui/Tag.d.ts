import type { JSX } from "react";
export type TagVariant = "default" | "gold" | "green" | "orange" | "blue" | "teal" | "purple" | "red";
export type TagMode = "solid" | "subtle";
export interface TagProps {
    readonly label: string;
    readonly variant?: TagVariant;
    /** solid = filled bg + white text, subtle = transparent bg + colored text */
    readonly mode?: TagMode;
}
/**
 * Small tag/chip component for labels.
 * Supports multiple color variants and two modes:
 *  - solid: filled background with white text (default)
 *  - subtle: transparent tinted background with colored text (B1 design)
 */
export declare function Tag({ label, variant, mode }: TagProps): JSX.Element;
