/**
 * Minimal React error boundary. Wraps a subtree so a render error in
 * one piece of UI does not blank out the entire page (Magnis hit this
 * on the search results dropdown — a single bad result blew up the
 * whole app).
 *
 * Usage:
 *   <ErrorBoundary fallback={<small>Search unavailable</small>}>
 *     <SearchResults … />
 *   </ErrorBoundary>
 */
import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
interface Props {
    readonly children: ReactNode;
    /** Rendered in place of children when the subtree throws. */
    readonly fallback: ReactNode;
}
interface State {
    readonly hasError: boolean;
    readonly error?: Error;
}
export declare class ErrorBoundary extends Component<Props, State> {
    state: State;
    static getDerivedStateFromError(error: Error): State;
    componentDidCatch(error: Error, info: ErrorInfo): void;
    render(): ReactNode;
}
export {};
