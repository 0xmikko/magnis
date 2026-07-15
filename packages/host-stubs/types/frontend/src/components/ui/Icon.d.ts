import type { JSX } from "react";
export type IconName = "activity" | "archive" | "archive-restore" | "arrow-left" | "arrow-right" | "arrow-up" | "arrow-up-right" | "attach" | "bell" | "bell-off" | "bot" | "brain" | "building" | "calendar" | "check" | "check-square" | "chevron-down" | "chevron-right" | "chevron-up" | "circle" | "circle-alert" | "circle-check" | "circle-dot" | "clock" | "clock-3" | "close" | "code" | "corner-down-left" | "corner-up-left" | "contacts" | "copy" | "edit" | "ellipsis-vertical" | "extensions" | "file" | "file-image" | "filter" | "folder" | "gift" | "globe" | "handshake" | "hash" | "history" | "image" | "inbox" | "link" | "lock" | "loader" | "mail" | "map-pin" | "maximize-2" | "minimize-2" | "menu" | "message" | "message-circle" | "mic" | "monitor" | "moon" | "more" | "note" | "notebook-pen" | "paperclip" | "pause" | "pencil" | "phone" | "pin" | "plus" | "puzzle" | "package" | "search" | "send" | "slack" | "settings" | "shield-alert" | "briefcase" | "chevron-left" | "eye" | "eye-off" | "heart" | "id-card" | "repeat-2" | "scale" | "shield-check" | "anchor" | "plug" | "palette" | "panel-bottom" | "panel-right" | "webhook" | "smile" | "sun" | "tasks" | "trash" | "trending-down" | "user" | "users" | "video" | "wallet" | "zap";
export interface IconProps {
    readonly name: IconName;
    readonly size?: number;
    readonly className?: string;
}
export declare function isIconName(value: string): value is IconName;
export declare function Icon({ name, size, className }: IconProps): JSX.Element;
