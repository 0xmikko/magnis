import type { AllowlistEntry } from "../types";
interface UseAllowlistResult {
    readonly entries: readonly AllowlistEntry[];
    readonly loading: boolean;
    readonly getMatchingEntry: (action: string, targetType: string, targetId: string, episodeId: string | null | undefined) => AllowlistEntry | undefined;
    readonly isAllowlisted: (action: string, targetType: string, targetId: string, episodeId: string | null | undefined) => boolean;
    readonly addEntry: (action: string, targetType: string, targetId: string, label?: string, episodeId?: string | null) => Promise<void>;
    readonly removeEntry: (id: string) => Promise<void>;
    readonly updateAccess: (id: string, accessLevel: string, groupIds: string[], hookIds: string[]) => Promise<void>;
    readonly getEntry: (id: string) => Promise<AllowlistEntry>;
    readonly reload: () => Promise<void>;
}
export declare function useAllowlist(): UseAllowlistResult;
export {};
