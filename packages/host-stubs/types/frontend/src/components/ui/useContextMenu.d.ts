export interface ContextMenuState<T> {
    readonly isOpen: boolean;
    readonly position: {
        readonly x: number;
        readonly y: number;
    };
    readonly data: T | null;
}
export interface UseContextMenuResult<T> {
    readonly state: ContextMenuState<T>;
    readonly open: (event: React.MouseEvent, data: T) => void;
    readonly close: () => void;
}
export declare function useContextMenu<T>(): UseContextMenuResult<T>;
