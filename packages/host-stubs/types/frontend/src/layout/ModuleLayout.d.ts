import { type ReactNode } from "react";
import type { JSX } from "react";
export declare function useListSelection<T extends {
    id: string;
}>(items: readonly T[], selectedId: string | undefined, setSelectedId: (id: string | undefined) => void): void;
export declare function useSearchFilter<T>(items: readonly T[], searchQuery: string, matchFn: (item: T, query: string) => boolean): readonly T[];
export interface ModuleLayoutProps {
    readonly moduleName: string;
    readonly listPane: ReactNode;
    readonly detailPane: ReactNode;
    readonly rightPane?: ReactNode;
    readonly containerClassName?: string;
    readonly detailPaneClassName?: string;
    readonly listHandleBackground?: string;
    readonly sidebarHandleBackground?: string;
}
export declare function ModuleLayout({ moduleName, listPane, detailPane, rightPane, containerClassName, detailPaneClassName, listHandleBackground, sidebarHandleBackground, }: ModuleLayoutProps): JSX.Element;
