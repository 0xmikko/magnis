import { type CSSProperties, type ComponentPropsWithoutRef, type ForwardRefExoticComponent, type ReactNode, type RefAttributes } from "react";
import type { JSX } from "react";
export type PaneTone = "surface" | "surface-secondary" | "surface-tertiary";
type PaneInset = "none" | "md" | "lg";
export interface PaneFrameProps {
    readonly children: ReactNode;
    readonly className?: string;
    readonly tone?: PaneTone;
    readonly style?: CSSProperties;
    readonly withRightBorder?: boolean;
}
export declare function PaneFrame({ children, className, tone, style, withRightBorder, }: PaneFrameProps): JSX.Element;
export interface PaneHeaderBarProps {
    readonly children: ReactNode;
    readonly className?: string;
    readonly tone?: PaneTone;
    readonly inset?: PaneInset;
    readonly withBottomBorder?: boolean;
}
export declare function PaneHeaderBar({ children, className, tone, inset, withBottomBorder, }: PaneHeaderBarProps): JSX.Element;
export interface PaneContentProps extends Omit<ComponentPropsWithoutRef<"div">, "children" | "className"> {
    readonly children: ReactNode;
    readonly className?: string;
    readonly scrollY?: boolean;
}
export declare const PaneContent: ForwardRefExoticComponent<PaneContentProps & RefAttributes<HTMLDivElement>>;
export interface PaneFooterBarProps {
    readonly children: ReactNode;
    readonly className?: string;
    readonly tone?: PaneTone;
    readonly inset?: PaneInset;
    readonly withTopBorder?: boolean;
    readonly compact?: boolean;
}
export declare function PaneFooterBar({ children, className, tone, inset, withTopBorder, compact, }: PaneFooterBarProps): JSX.Element;
export {};
