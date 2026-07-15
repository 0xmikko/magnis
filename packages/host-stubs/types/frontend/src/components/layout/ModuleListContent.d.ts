import { type ReactNode } from "react";
import type { JSX } from "react";
export interface ModuleListContentProps<T> {
    readonly items: readonly T[];
    readonly isLoading: boolean;
    readonly hasMore: boolean;
    readonly searchQuery: string;
    readonly onLoadMore: () => void;
    readonly selectedId?: string;
    readonly onSelect: (id: string) => void;
    readonly renderItem: (item: T, selected: boolean) => ReactNode;
    readonly getId: (item: T) => string;
    readonly emptyMessage?: string;
    readonly groupBy?: "date" | "letter";
    readonly getGroupDate?: (item: T) => Date | null;
    readonly getGroupLetter?: (item: T) => string;
    readonly isPinned?: (item: T) => boolean;
}
export declare function ModuleListContent<T>({ items, isLoading, hasMore, searchQuery, onLoadMore, selectedId, onSelect, renderItem, getId, emptyMessage, groupBy, getGroupDate, getGroupLetter, isPinned, }: ModuleListContentProps<T>): JSX.Element;
