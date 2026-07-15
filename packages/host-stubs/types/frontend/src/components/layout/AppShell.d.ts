import type { ReactNode, JSX } from "react";
export interface AppShellProps {
    readonly leftRail: ReactNode;
    readonly children: ReactNode;
}
/**
 * Root application shell with left rail and main workspace.
 *
 * Window dragging is OPT-IN from chrome only — the CommandBar title bar
 * (`data-tauri-drag-region`) and each PaneHeaderBar. The root MUST NOT attach a
 * whole-screen onMouseDown→startWindowDrag handler: it made every non-interactive
 * element (message text, labels, scroll areas) drag the window, so the user
 * couldn't select text or click in the agent dialog and content panes.
 */
export declare function AppShell({ leftRail, children }: AppShellProps): JSX.Element;
