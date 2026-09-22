import type { EpisodeState, PendingPrompt } from "../types/episode.ts";
export interface ToolCardModel {
    readonly id: string;
    readonly name: string;
    readonly label: string;
    readonly summary: string | null;
    readonly args: unknown;
    readonly result: unknown;
    readonly resultCountLabel: string | null;
    readonly error: string | null;
    readonly status: "pending" | "approved" | "denied";
    readonly approvalId: string | null;
    readonly hidden: boolean;
}
export interface EpisodeToolProjection {
    readonly cards: readonly ToolCardModel[];
    readonly prompts: readonly PendingPrompt[];
}
/** Every call receives a generic card, including unknown and plugin-owned tools. */
export declare function projectEpisodeTools(state: EpisodeState): EpisodeToolProjection;
