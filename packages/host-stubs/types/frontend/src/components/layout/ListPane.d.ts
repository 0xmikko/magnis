import { type ReactNode, type UIEvent } from "react";
import type { JSX } from "react";
export interface ListPaneProps {
    readonly title: string;
    readonly count?: number;
    readonly onSearch?: (query: string) => void;
    readonly children: ReactNode;
    readonly headerNode?: ReactNode;
    readonly headerActions?: ReactNode;
    /** Rendered in the search row, attached right of the search input
     *  (e.g. the Chats needs-reply bell). */
    readonly searchAccessory?: ReactNode;
    readonly onContentScroll?: (e: UIEvent<HTMLDivElement>) => void;
}
/**
 * List pane component with header and optional search
 */
export declare function ListPane({ title, count: _count, onSearch, children, headerNode, headerActions, searchAccessory, onContentScroll, }: ListPaneProps): JSX.Element;
