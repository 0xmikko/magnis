import { type JSX } from "react";
import type { ResolvedDecision } from "@magnis/agent-core";
import type { AppRuntime } from "../../runtime/contracts/runtime";
export interface DecisionSummaryProps {
    readonly decision: ResolvedDecision;
    /** Passed through to EntityCardRenderer when the result carries an entity. */
    readonly runtime?: AppRuntime;
}
/**
 * Compact read-only "Answers" block for a resolved tool call.
 *
 * Always renders as a collapsed summary line ("✓ Create contacts: Вася")
 * with a chevron. Expanding reveals either one EntityCard per resolved
 * entity (preferred) or a neutral args table when the result is not
 * entity-shaped (denied decisions, background calls without a visible
 * result).
 */
export declare function DecisionSummary({ decision, runtime }: DecisionSummaryProps): JSX.Element;
