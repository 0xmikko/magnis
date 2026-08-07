import type { AllowlistEntry } from "../types";
interface UseAllowlistResult {
    readonly entries: readonly AllowlistEntry[];
    readonly loading: boolean;
    readonly getMatchingEntries: (action: string, targetType: string, targetId: string, episodeId: string | null | undefined) => readonly AllowlistEntry[];
    readonly getMatchingEntry: (action: string, targetType: string, targetId: string, episodeId: string | null | undefined) => AllowlistEntry | undefined;
    readonly removeMatchingEntries: (action: string, targetType: string, targetId: string, episodeId: string | null | undefined) => Promise<void>;
    readonly addEntry: (action: string, targetType: string, targetId: string, label?: string, episodeId?: string | null) => Promise<void>;
    readonly removeEntry: (id: string) => Promise<void>;
    readonly updateAccess: (id: string, accessLevel: string, groupIds: string[], hookIds: string[]) => Promise<void>;
    readonly getEntry: (id: string) => Promise<AllowlistEntry>;
    readonly reload: () => Promise<void>;
}
export declare function useAllowlist(): UseAllowlistResult;
export {};
