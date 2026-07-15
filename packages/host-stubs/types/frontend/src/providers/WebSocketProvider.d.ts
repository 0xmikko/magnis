/**
 * WebSocketProvider — React adapter over WebSocketClient.
 *
 * Creates the client on mount, subscribes to status changes,
 * and exposes the client API through React context.
 *
 * The WebSocketClient instance is scoped to the selected workspace.
 * Reactive UI values (backendReady, status) live in state.
 * The context value is memoized for a stable consumer API.
 */
import { type ReactNode } from "react";
import type { JSX } from "react";
import { type Rpc, type StreamEvent } from "../store/websocketClient";
export interface WebSocketContextValue {
    readonly rpc: Rpc;
    readonly backendReady: boolean;
    readonly status: string;
    readonly onSchemaEvent: (schemaIds: readonly string[], handler: (e: StreamEvent) => void) => () => void;
    readonly onEventType: (types: readonly string[], handler: (e: StreamEvent) => void) => () => void;
}
export declare const WebSocketContext: import("react").Context<WebSocketContextValue | null>;
export type { Rpc, StreamEvent };
export declare function WebSocketProvider({ children }: {
    readonly children: ReactNode;
}): JSX.Element;
