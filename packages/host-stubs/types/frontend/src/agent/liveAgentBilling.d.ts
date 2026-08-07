import type { AgentFailure } from "../modules/episodes/types";
import { type BillingLimitInfo } from "../modules/settings/hooks/useBillingLimit";
export declare const DEMO_CREDIT_DISABLED_COPY = "Your $1 demo agent credit has been used.";
export declare function formatUsdMicros(micros: number): string;
export declare function liveAgentDisabledReason(limit: BillingLimitInfo | undefined, failure: AgentFailure | null): string | null;
export declare function useLiveAgentBilling(isStreaming: boolean, failure: AgentFailure | null): {
    readonly disabledReason: string | null;
    readonly limit: BillingLimitInfo | undefined;
};
