import { type ResizablePaneMetrics } from "./layoutMetrics";
export interface ResolveThreePanelLayoutOptions {
    readonly containerWidth: number;
    readonly listWidth: number;
    readonly sidebarWidth?: number;
    readonly hasSidebar?: boolean;
    readonly detailMinWidth?: number;
    readonly handleWidth?: number;
    readonly listMetrics?: ResizablePaneMetrics;
    readonly sidebarMetrics?: ResizablePaneMetrics;
}
export interface ResolvedThreePanelLayout {
    readonly listWidth: number;
    readonly detailWidth: number;
    readonly sidebarWidth: number;
    readonly minLayoutWidth: number;
    readonly totalWidth: number;
}
export declare function clampPaneWidth(width: number, metrics: ResizablePaneMetrics): number;
export declare function getThreePanelMinLayoutWidth({ hasSidebar, detailMinWidth, handleWidth, listMetrics, sidebarMetrics, }?: Omit<ResolveThreePanelLayoutOptions, "containerWidth" | "listWidth" | "sidebarWidth">): number;
export declare function resolveThreePanelLayout({ containerWidth, listWidth, sidebarWidth, hasSidebar, detailMinWidth, handleWidth, listMetrics, sidebarMetrics, }: ResolveThreePanelLayoutOptions): ResolvedThreePanelLayout;
