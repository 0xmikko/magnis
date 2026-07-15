import type { ReactNode, JSX } from "react";
export type TextVariant = "heading" | "subheading" | "title" | "body" | "caption" | "tiny" | "overline" | "micro";
export type TextColor = "default" | "secondary" | "tertiary" | "accent" | "white" | "inherit";
export type TextWeight = "normal" | "medium" | "semibold" | "bold";
export interface TextProps {
    /** Predefined size/style variant */
    readonly variant?: TextVariant;
    /** Font weight override */
    readonly weight?: TextWeight;
    /** Text color */
    readonly color?: TextColor;
    /** Truncate with ellipsis */
    readonly truncate?: boolean;
    /** Line-through style */
    readonly strikethrough?: boolean;
    /** Prevent shrinking */
    readonly noShrink?: boolean;
    /** Text alignment */
    readonly align?: "left" | "center" | "right";
    /** Line height */
    readonly leading?: "tight" | "normal" | "relaxed";
    /** Render as element type */
    readonly as?: "span" | "div" | "p";
    /** Extra className (margins only) */
    readonly className?: string;
    readonly children: ReactNode;
}
export declare function Text({ variant, weight, color, truncate, strikethrough, noShrink, align, leading, as: Tag, className, children, }: TextProps): JSX.Element;
