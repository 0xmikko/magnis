import { type ReactNode, type UIEvent } from "react";
import type { JSX } from "react";
export interface ListPaneProps {
    readonly title: string;
    readonly count?: number;
    readonly onSearch?: (query: string) => void;
    readonly children: ReactNode;
    readonly headerNode?: ReactNode;
    readonly headerActions?: ReactNode;
    readonly onContentScroll?: (e: UIEvent<HTMLDivElement>) => void;
}
/**
 * List pane component with header and optional search
 */
export declare function ListPane({ title, count: _count, onSearch, children, headerNode, headerActions, onContentScroll, }: ListPaneProps): JSX.Element;
