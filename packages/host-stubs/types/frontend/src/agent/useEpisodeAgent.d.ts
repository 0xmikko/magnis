import type { AppRuntime } from "../runtime/contracts/runtime";
import type { AgentChoice } from "./EpisodeAgentHeader";
export interface UseEpisodeAgentResult {
    readonly engines: readonly string[];
    readonly models: readonly AgentChoice[];
    readonly selectEngine: (engine: string) => void;
    readonly selectModel: (model: string | null) => void;
    /** Why the last choice was refused, or null. The backend refuses a frozen
     *  engine and an unrunnable model by design; swallowing that leaves the user
     *  clicking a control that appears to do nothing. */
    readonly error: string | null;
}
export declare function useEpisodeAgent(runtime: AppRuntime, episodeId: string | null, engine: string | null): UseEpisodeAgentResult;
