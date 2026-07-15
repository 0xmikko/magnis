import type { AllowlistEntry } from "../types";
interface UseAllowlistResult {
    readonly entries: readonly AllowlistEntry[];
    readonly loading: boolean;
    readonly isAllowlisted: (action: string, targetType: string, targetId: string) => boolean;
    readonly addEntry: (action: string, targetType: string, targetId: string, label?: string) => Promise<void>;
    readonly removeEntry: (id: string) => Promise<void>;
    readonly updateAccess: (id: string, accessLevel: string, groupIds: string[], hookIds: string[]) => Promise<void>;
    readonly getEntry: (id: string) => Promise<AllowlistEntry>;
    readonly reload: () => Promise<void>;
}
export declare function useAllowlist(): UseAllowlistResult;
export {};
