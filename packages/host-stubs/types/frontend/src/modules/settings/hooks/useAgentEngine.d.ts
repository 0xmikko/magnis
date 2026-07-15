interface UseAgentEngineResult {
    readonly engines: readonly string[];
    readonly current: string | null;
    readonly loading: boolean;
    readonly setEngine: (name: string) => Promise<void>;
}
export declare function useAgentEngine(): UseAgentEngineResult;
export {};
