import type { JSX } from "react";
import type { IconName } from "./Icon";
export type ContextMenuEntry = {
    readonly id: string;
    readonly label: string;
    readonly icon?: IconName;
    readonly variant?: "default" | "danger";
    readonly colorDot?: string;
    readonly role?: "menuitem" | "menuitemradio";
    readonly ariaChecked?: boolean;
} | {
    readonly type: "separator";
} | {
    readonly type: "submenu";
    readonly label: string;
    readonly icon: IconName;
    readonly children: readonly ContextMenuEntry[];
};
export interface ContextMenuProps {
    readonly items: readonly ContextMenuEntry[];
    readonly position: {
        readonly x: number;
        readonly y: number;
    };
    readonly onSelect: (itemId: string) => void;
    readonly onClose: () => void;
}
interface ContextMenuSurfaceProps {
    readonly items: readonly ContextMenuEntry[];
    readonly onSelect: (itemId: string) => void;
    readonly header?: string;
    readonly className?: string;
}
export declare function ContextMenu({ items, position, onSelect, onClose }: ContextMenuProps): JSX.Element;
export declare function ContextMenuSurface({ items, onSelect, header, className, }: ContextMenuSurfaceProps): JSX.Element;
export {};
