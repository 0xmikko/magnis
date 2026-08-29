import type { JSX } from "react";
/**
 * Application status bar — rendered at the very bottom of the app shell.
 *
 * Consumes `useSyncStatus()` for real-time sync/index status.
 * No mocks, no polling — all push-based via WebSocket events.
 */
export declare function StatusBar(): JSX.Element;
