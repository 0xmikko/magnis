import type { JSX } from "react";
/**
 * Application status bar — rendered at the very bottom of the app shell.
 *
 * Consumes `useAppLogs()` for real-time status and error data.
 * No mocks, no polling — all push-based via WebSocket events.
 */
export declare function StatusBar(): JSX.Element;
