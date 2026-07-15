import { type ReactNode } from "react";
import type { JSX } from "react";
export interface RouterContextValue {
    readonly activeModuleId: string;
    readonly entityType?: string;
    readonly entityId?: string;
    readonly pendingItemId?: string;
    readonly setActiveModule: (moduleId: string) => void;
    readonly navigate: (moduleId: string, entityType?: string, entityId?: string) => void;
    readonly setSelection: (entityType: string, entityId: string | undefined) => void;
    readonly consumePendingItem: () => void;
}
export declare function RouterProvider({ children, }: {
    readonly children: ReactNode;
}): JSX.Element;
export declare function useRouterContext(): RouterContextValue;
