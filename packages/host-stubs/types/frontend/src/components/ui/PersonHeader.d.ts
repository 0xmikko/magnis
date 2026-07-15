import type { ReactNode, JSX } from "react";
import type { AvatarProps } from "./Avatar";
export interface PersonHeaderProps {
    readonly name: string;
    readonly statusText?: string;
    readonly initials: string;
    readonly color?: AvatarProps["color"];
    readonly avatarSize?: AvatarProps["size"];
    readonly avatar?: ReactNode;
    readonly actions?: ReactNode;
    readonly showStatusDot?: boolean;
    readonly className?: string;
}
/**
 * Header showing a person with avatar, name, status, and action buttons.
 * Used in inbox, contacts, meetings, and email detail headers.
 */
export declare function PersonHeader({ name, statusText, initials, color, avatarSize, avatar, actions, showStatusDot, className, }: PersonHeaderProps): JSX.Element;
