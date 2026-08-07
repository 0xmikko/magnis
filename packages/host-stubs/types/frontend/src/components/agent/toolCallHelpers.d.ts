/**
 * Facade — the pure tool-call presentation helpers moved to
 * `@magnis/client-core` (WS-1 consolidation, A-2/A-3) so the CLI renders
 * with the SAME functions. This file stays as the web-side import path.
 */
export { buildCopyPayload, extractArgSummary, extractResultCount, extractResultCountLabel, humanizeToolName, isHiddenTool, stripMcpPrefix, toolResultError, } from "@magnis/client-core";
