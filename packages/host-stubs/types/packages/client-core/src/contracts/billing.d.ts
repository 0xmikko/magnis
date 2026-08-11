/**
 * Canonical per-call token breakdown — mirror of Rust `core::billing::TokenBreakdown`.
 * Keys are authoritative for WS `usage.cumulative` payloads (INV-BILL-3).
 * Missing dimensions default to 0 (e.g. a `step_error` frame carries no
 * tokens); a missing top-level `cumulative` object is handled by the parser.
 */
export interface TokenBreakdown {
    readonly input: number;
    readonly output: number;
    readonly cache_read: number;
    readonly cache_write: number;
    readonly cache_write_1h: number;
    readonly reasoning: number;
}
export declare function emptyTokenBreakdown(): TokenBreakdown;
