import type { JSX } from "react";
import type { ListItem } from "./types";
export interface BaseListItemProps {
    readonly item: ListItem;
    readonly themeColor?: string;
}
/**
 * Default list item renderer for BaseModule.
 * Shows: avatar + title + subtitle/preview + timestamp + pin icon.
 */
export declare function BaseListItem({ item, themeColor, }: BaseListItemProps): JSX.Element;
