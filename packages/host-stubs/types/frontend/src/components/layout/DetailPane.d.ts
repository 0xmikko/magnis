import type { ReactNode, JSX } from "react";
import type { PaneTone } from "./PaneBlocks";
export interface DetailPaneProps {
    readonly headerNode?: ReactNode;
    /** Rendered after PaneContent. Caller controls wrapper (e.g. PaneFooterBar or plain div). */
    readonly footer?: ReactNode;
    readonly frameClassName?: string;
    readonly headerClassName?: string;
    readonly contentClassName?: string;
    /** Controls PaneContent vertical scroll. Default: true */
    readonly scrollY?: boolean;
    /** PaneFrame background tone. Default: "surface-tertiary" */
    readonly tone?: PaneTone;
    readonly children: ReactNode;
}
/**
 * Detail pane component with optional header and footer.
 * Shared layout wrapper for the center panel across all modules.
 */
export declare function DetailPane({ headerNode, footer, frameClassName, headerClassName, contentClassName, scrollY, tone, children, }: DetailPaneProps): JSX.Element;
