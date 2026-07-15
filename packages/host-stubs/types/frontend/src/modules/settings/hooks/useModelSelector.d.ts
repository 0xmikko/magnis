export interface ModelSelectorItem {
    readonly id: string;
    readonly label: string;
    readonly section: "agent" | "model";
    readonly engineName: string;
    readonly modelId?: string;
}
export interface UseModelSelectorResult {
    readonly items: readonly ModelSelectorItem[];
    readonly current: ModelSelectorItem | null;
    readonly loading: boolean;
    readonly select: (item: ModelSelectorItem) => Promise<void>;
}
export declare function useModelSelector(): UseModelSelectorResult;
