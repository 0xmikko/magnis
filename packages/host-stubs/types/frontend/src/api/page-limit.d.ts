/** The most any general paginated RPC list will return.
 *
 * Three call sites asked for 1000 and the server quietly handed back 200 —
 * `paramLimit` was `Math.min(limit ?? 50, 200)`. Now that a list method
 * publishes its bound and REFUSES an argument outside it (the MCP tools
 * specification treats one as an invalid argument, not something to
 * normalize), asking for more than this is an error rather than a rounding.
 *
 * A caller that needs more than one page needs `offset`, not a bigger number.
 */
export { pageLimitMax as PAGE_LIMIT_MAX } from "@magnis/sdk/core/pagination";
