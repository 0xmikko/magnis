/**
 * Pure tool-call presentation helpers shared by every surface (A-2) —
 * no React, no DOM, no I/O. Moved verbatim from
 * `frontend/src/components/agent/toolCallHelpers.ts`; the web file is now a
 * re-export facade of this module.
 */
/** Harness/plumbing tools that are not user-meaningful actions and must be
 *  hidden from the transcript: episode bookkeeping and the Claude Code schema
 *  loader (`ToolSearch`, which also leaks raw `mcp__…__` ids in its args). */
export declare function isHiddenTool(name: string): boolean;
/** Human-readable tool label: uses known mapping, falls back to spaced name.
 *  Always strips the internal MCP server namespace first. */
export declare function humanizeToolName(name: string): string;
/**
 * Pull a user-readable label out of tool args — what was being asked /
 * created / searched. Used to render the row as
 * "**<verb>**: <query>" instead of just the verb. Keys are checked in
 * preference order; first match wins.
 */
export declare function extractArgSummary(args: unknown): string | undefined;
/** Extract a result count from a tool result object. */
export declare function extractResultCount(result: unknown): number | null;
/**
 * Display label for the result-count badge. For a BOUNDED window
 * ({items, total} where total exceeds the returned items) shows
 * "<returned> of <total>" — e.g. "50 of 27859" — so a capped retrieval reads as
 * what reached the agent vs. what exists, instead of the bare total, which
 * looks like the whole set was dumped into context.
 */
export declare function extractResultCountLabel(result: unknown): string | null;
/** Wire marker set on a tool_result when the tool THREW during execution
 *  (builtin engine, AI_ToolExecutionError). Lets every surface render a
 *  terminal error card instead of an infinite spinner. */
export declare const TOOL_ERROR_MARKER = "__tool_error";
/** If a tool_result is a tool-execution error, return its message; else null.
 *  The marker (not a bare `error` field) is required so a normal result that
 *  merely carries an `error` key is not mistaken for a failed tool. */
export declare function toolResultError(result: unknown): string | null;
/** Build a copyable JSON string from tool args + result. */
export declare function buildCopyPayload(args: unknown, result: unknown): string;
