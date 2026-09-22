export type ResourceListener = () => void;
export interface ExternalResource<State> {
    getSnapshot(): State;
    subscribe(listener: ResourceListener): () => void;
}
export declare class MutableExternalResource<State> implements ExternalResource<State> {
    private snapshot;
    private readonly listeners;
    constructor(snapshot: State);
    getSnapshot(): State;
    subscribe(listener: ResourceListener): () => void;
    setSnapshot(snapshot: State): void;
}
