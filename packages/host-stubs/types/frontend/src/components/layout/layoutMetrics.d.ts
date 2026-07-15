/**
 * Shared shell sizing tokens.
 * Keep shell and workspace bounds centralized so the split controller and shell
 * both use the same explicit numbers.
 */
export interface ResizablePaneMetrics {
    readonly defaultWidth: number;
    readonly minWidth: number;
    readonly maxWidth: number;
}
export declare const LEFT_RAIL_WIDTH = 60;
export declare const LIST_PANE_METRICS: ResizablePaneMetrics;
export declare const AGENT_PANE_METRICS: ResizablePaneMetrics;
export declare const WORKSPACE_DETAIL_MIN_WIDTH = 560;
export declare const WORKSPACE_RESIZE_HANDLE_WIDTH = 1;
export declare const MODULE_LAYOUT_PANE_WIDTHS_STORAGE_KEY = "majordomo:workspace-pane-widths:v1";
