/** `@magnis/host/layout` — the host's pane scaffolding.
 *
 * The frame, header and content backgrounds belong to the host. What a
 * plugin owns, and can therefore assert, is what it PASSES: the header node,
 * the footer, and `contentClassName`. The double renders exactly that, under
 * the same test ids the host's panes carry, so a plugin test reads the same
 * either side of the boundary.
 */
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type JSX,
  type ReactNode,
} from "react";

export function PaneFrame({
  children,
  className,
  tone,
  style,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly tone?: string;
  readonly style?: CSSProperties;
  readonly withRightBorder?: boolean;
}): JSX.Element {
  return (
    <div data-host="PaneFrame" data-tone={tone} className={className} style={style}>
      {children}
    </div>
  );
}

export function PaneHeaderBar({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly tone?: string;
  readonly inset?: string;
  readonly withBottomBorder?: boolean;
}): JSX.Element {
  return (
    <header data-host="PaneHeaderBar" className={className}>
      {children}
    </header>
  );
}

export const PaneContent = forwardRef<
  HTMLDivElement,
  // The host's PaneContent forwards arbitrary div props (a plugin attaches
  // its own `data-testid`, `onScroll`, `role`), so the double does too.
  Omit<ComponentPropsWithoutRef<"div">, "children" | "className"> & {
    readonly children: ReactNode;
    readonly className?: string;
    readonly scrollY?: boolean;
  }
>(function PaneContent({ children, className, scrollY: _scrollY, ...rest }, ref): JSX.Element {
  return (
    <div ref={ref} data-host="PaneContent" data-testid="pane-content" className={className} {...rest}>
      {children}
    </div>
  );
});

export function PaneFooterBar({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly tone?: string;
  readonly inset?: string;
  readonly withTopBorder?: boolean;
  readonly compact?: boolean;
}): JSX.Element {
  return (
    <footer data-host="PaneFooterBar" className={className}>
      {children}
    </footer>
  );
}

export function DetailPane({
  headerNode,
  footer,
  frameClassName,
  headerClassName,
  contentClassName,
  scrollY,
  tone,
  children,
}: {
  readonly headerNode?: ReactNode;
  readonly footer?: ReactNode;
  readonly frameClassName?: string;
  readonly headerClassName?: string;
  readonly contentClassName?: string;
  readonly scrollY?: boolean;
  readonly tone?: string;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <PaneFrame tone={tone} className={frameClassName}>
      <div data-testid="detail-pane">
        {headerNode ? <PaneHeaderBar className={headerClassName}>{headerNode}</PaneHeaderBar> : null}
        <PaneContent className={contentClassName} scrollY={scrollY}>
          {children}
        </PaneContent>
        {footer}
      </div>
    </PaneFrame>
  );
}

export function ModuleLayout({
  moduleName,
  listPane,
  detailPane,
  rightPane,
  containerClassName,
  detailPaneClassName,
}: {
  readonly moduleName: string;
  readonly listPane: ReactNode;
  readonly detailPane: ReactNode;
  readonly rightPane?: ReactNode;
  readonly defaultSidebarEnabled?: boolean;
  readonly containerClassName?: string;
  readonly detailPaneClassName?: string;
  readonly listHandleBackground?: string;
  readonly sidebarHandleBackground?: string;
}): JSX.Element {
  // The host resizes and hides these panes from its own stores. A plugin
  // only ever supplies the three nodes, so all three render, always.
  return (
    <div data-host="ModuleLayout" data-module={moduleName} className={containerClassName}>
      <div data-testid="list-pane">{listPane}</div>
      <div data-testid="detail-pane-slot" className={detailPaneClassName}>
        {detailPane}
      </div>
      {rightPane ? <div data-testid="right-pane">{rightPane}</div> : null}
    </div>
  );
}
