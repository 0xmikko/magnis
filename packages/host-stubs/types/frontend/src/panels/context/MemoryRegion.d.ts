/**
 * The panel's memory region: what this conversation is remembered for.
 *
 * Plan: docs/plans/episode-agent-parity.md S9; layout in
 * docs/backend/episodes.md ("[Target] The context panel").
 *
 * Scoped to the episode. Without `sourceEpisodeId` the read would hand back
 * the user's whole memory store, which is a different thing wearing the same
 * label — "what this chat produced" is the question the region answers.
 *
 * S7 found no way for a guest engine to declare a memory, so what shows here
 * is what extraction produced. That is honest rather than empty, and the gap
 * is written down in docs/backend/episodes.md.
 */
import { type JSX } from "react";
import type { AppRuntime } from "../../runtime/contracts/runtime";
export declare function MemoryRegion({ runtime, episodeId, }: {
    readonly runtime: AppRuntime;
    readonly episodeId: string | null;
}): JSX.Element | null;
