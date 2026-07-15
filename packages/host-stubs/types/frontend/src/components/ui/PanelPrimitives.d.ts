import type { CSSProperties, ReactNode, JSX } from "react";
import type { IconName } from "./Icon";
export interface PanelShellProps {
    readonly children: ReactNode;
    readonly className?: string;
}
export declare function PanelShell({ children, className }: PanelShellProps): JSX.Element;
export interface PanelHeaderProps {
    readonly title: ReactNode;
    readonly action?: ReactNode;
    readonly className?: string;
    readonly titleClassName?: string;
}
export declare function PanelHeader({ title, action, className, titleClassName, }: PanelHeaderProps): JSX.Element;
export interface IconRoundBadgeProps {
    readonly iconName: IconName;
    readonly colorClassName: string;
    readonly iconSize?: number;
    readonly className?: string;
    readonly style?: CSSProperties;
}
export declare function IconRoundBadge({ iconName, colorClassName, iconSize, className, style, }: IconRoundBadgeProps): JSX.Element;
export interface IconActionButtonProps {
    readonly iconName: IconName;
    readonly iconSize?: number;
    readonly onClick?: () => void;
    readonly className?: string;
    readonly type?: "button" | "submit" | "reset";
}
export declare function IconActionButton({ iconName, iconSize, onClick, className, type, }: IconActionButtonProps): JSX.Element;
