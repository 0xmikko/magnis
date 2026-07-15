import type { ReactNode, JSX } from "react";
export interface TopBarHeaderProps {
    readonly leading?: ReactNode;
    readonly title: ReactNode;
    readonly subtitle?: ReactNode;
    readonly extra?: ReactNode;
    readonly actions?: ReactNode;
    readonly className?: string;
    readonly titleClassName?: string;
    readonly subtitleClassName?: string;
    /** When provided, title becomes editable (click to edit, Enter to save). */
    readonly onTitleEdit?: (name: string) => void;
}
/**
 * Unified top-bar header used across module detail views.
 * Layout: leading avatar/icon, title + subtitle, trailing actions.
 */
export declare function TopBarHeader({ leading, title, subtitle, extra, actions, className, titleClassName, subtitleClassName, onTitleEdit, }: TopBarHeaderProps): JSX.Element;
