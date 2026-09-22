export { LiveEntitlementSchema } from "./billing.js";
export type { LiveEntitlement } from "./billing.js";
export type EntitlementDecision = {
    readonly decision: "entitled";
} | {
    readonly decision: "refused";
    readonly spentMicros: bigint;
    readonly limitMicros: bigint;
};
//# sourceMappingURL=entitlement.d.ts.map