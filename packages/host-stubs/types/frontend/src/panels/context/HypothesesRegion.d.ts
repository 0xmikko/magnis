/**
 * The panel's hypotheses region: what the agent suspects but has not
 * committed to.
 *
 * Plan: docs/plans/episode-agent-parity.md S9; layout in
 * docs/backend/episodes.md ("[Target] The context panel").
 *
 * A candidate link is a claim with a probability attached, and the
 * probability is the point: `works_at p 0.72` is a different thing from a
 * fact, and showing it without the number would present a guess as one.
 *
 * Anchored on the episode's primary entity, because a hypothesis is about
 * something — with no primary entity there is nothing to be uncertain about
 * and the region does not render.
 */
import { type JSX } from "react";
import type { AppRuntime } from "../../runtime/contracts/runtime";
export interface CandidateLink {
    readonly id: string;
    readonly from: string;
    readonly to: string;
    readonly kind: string;
    readonly p: number;
}
export declare function HypothesesRegion({ runtime, primaryEntityId, nameOf, }: {
    readonly runtime: AppRuntime;
    readonly primaryEntityId: string | null;
    /** Resolve an entity id to something readable. Ids the panel has never seen
     *  come back as the id, which is honest — the row still says which link the
     *  agent is unsure about. */
    readonly nameOf: (id: string) => string;
}): JSX.Element | null;
