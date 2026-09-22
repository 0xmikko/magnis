import { type EpisodeState } from "../types/episode.ts";
import type { MagnisClient } from "../client.ts";
export type HeadlessEpisodeTurnEvent = {
    readonly kind: "assistant";
    readonly text: string;
} | {
    readonly kind: "tool_call";
    readonly name: string;
    readonly args: Record<string, unknown>;
} | {
    readonly kind: "tool_result";
    readonly name: string;
    readonly result: Record<string, unknown>;
} | {
    readonly kind: "engine";
    readonly engine: string;
} | {
    readonly kind: "paused";
    readonly toolName: string;
    readonly episodeId: string;
    readonly reason: "ask_user" | "approval";
} | {
    readonly kind: "error";
    readonly message: string;
};
export interface HeadlessEpisodeTurnOptions {
    readonly episodeId: string;
    readonly text: string;
    readonly attachments: readonly string[];
    readonly hydrate: boolean;
    readonly timeoutMs?: number;
    readonly onState?: (state: EpisodeState) => void;
    /** Defaults to idle or needs_input. Failures always end the admitted turn. */
    readonly isComplete?: (state: EpisodeState) => boolean;
}
/** Run one renderer-free turn against the retained Episode capability. */
export declare function runHeadlessEpisodeTurn(client: MagnisClient, options: HeadlessEpisodeTurnOptions): Promise<readonly HeadlessEpisodeTurnEvent[]>;
