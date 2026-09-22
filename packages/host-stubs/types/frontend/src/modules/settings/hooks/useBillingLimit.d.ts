/**
 * billing.limits.* API (plan billing-hardening Stage 6, INV-BH-3/7) — the
 * caller's credit limit, lifetime spend and entitlement status, plus the
 * admin write. Same WS-RPC + react-query pattern as useSourceAppConfig.
 */
import { type BillingLimitInfo } from "@magnis/sdk";
export type { BillingLimitInfo } from "@magnis/sdk";
export interface UseBillingLimitResult {
    readonly limit: BillingLimitInfo | undefined;
    readonly loading: boolean;
    readonly error: string | null;
    readonly saving: boolean;
    readonly saveError: string | null;
    /** Set (micros) or clear (null) the caller's credit limit. Admin-only. */
    readonly setLimit: (creditLimitMicros: number | null) => void;
    /** Re-run the billing.limits.get query (retry after a transport error). */
    readonly reload: () => void;
}
export declare function useBillingLimit(): UseBillingLimitResult;
