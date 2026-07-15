import { type JSX } from "react";
import type { AppRuntime } from "../../runtime/contracts/runtime";
export interface ExpandableEntityCardProps {
    readonly schemaId: string;
    readonly data: Readonly<Record<string, unknown>>;
    readonly runtime: AppRuntime;
    /** Forwarded to the registered card; see `EntityRendererProps.action`. */
    readonly action?: string;
}
/**
 * Wraps an entity card with an optional in-place expansion.
 *
 * Per `docs/frontend/module-standard.md` ("ONE COMPONENT PER ENTITY")
 * the module registers a SINGLE entity card (`EntityCard`) which is
 * the only renderer for the schema. This wrapper:
 *
 *   1. Renders the registered card once.
 *   2. Reads the chevron-gating helper `reg.hasMore(data)`; if true,
 *      shows a chevron and pipes `expanded` through `ExpansionContext`
 *      so the same card can swap its compact vs full layout on the
 *      fly. The component itself is NOT remounted — it just re-reads
 *      the context and re-renders.
 *   3. If `hasMore` returns false, no chevron, card always renders
 *      in its compact (`expanded === false`) form.
 *
 * Forbidden: `reg.ExpandedRender`. The dual-card pattern has been
 * removed from the codebase; module registrations no longer carry
 * an `ExpandedEntityCard`.
 */
export declare function ExpandableEntityCard({ schemaId, data, runtime, action, }: ExpandableEntityCardProps): JSX.Element;
