/**
 * Canonical client-side tool-name normalization (A-3), shared by web and CLI.
 * Backend matching lives in
 * `backend/src/transport/websocket/controllers/tool-names.ts`.
 * Client behavior is pinned by the `tst_cc_names_*` tests.
 */
/** Strip the MCP server namespace (`mcp__<server>__foo` → `foo`) that the
 *  Claude Code harness prepends. `<server>` is an internal name (e.g. the
 *  legacy "majordomo") that must never surface in any UI. */
export declare function stripMcpPrefix(name: string): string;
/**
 * Compare an engine-recorded tool name (typically all-underscores form like
 * `notes_template_apply`) against the canonical registered name (typically
 * dotted like `notes.template.apply`). Tries, in order: exact, `__`→`.`
 * everywhere, first `_`→`.` (2-segment names recorded without a dot), and
 * all `.`→`_` on the canonical (3+-segment names where every dot became an
 * underscore). Underscores INSIDE a canonical segment stay significant.
 */
export declare function toolNamesEquivalent(persistedCallName: string, canonicalToolName: string): boolean;
/** RPC method name for a recorded tool call. Agent SDK serializes RPC names
 *  as `module_tool` (underscore) but the backend registers them as
 *  `module.tool_with_underscores_inside` — only the FIRST underscore is the
 *  separator. Dotted names pass through untouched. */
export declare function rpcNameForToolCall(name: string): string;
