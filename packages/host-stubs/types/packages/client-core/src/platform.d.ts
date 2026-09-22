export interface MagnisStorage {
    read(key: string): Promise<string | null>;
    write(key: string, value: string): Promise<void>;
    remove(key: string): Promise<void>;
}
export type FetchImplementation = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
export type WorkspaceConnectionSource = "local" | "cloud" | "custom";
export interface WorkspaceConnectionSeed {
    readonly id: string;
    readonly url: string;
    readonly source: WorkspaceConnectionSource;
}
export interface WebSocketCloseEvent {
    readonly code?: number;
    readonly reason?: string;
}
export interface WebSocketMessageEvent {
    readonly data: unknown;
}
export interface WebSocketErrorEvent {
    readonly message?: string;
}
export interface WebSocketLike {
    readonly readyState: number;
    onopen: (() => void) | null;
    onclose: ((event: WebSocketCloseEvent) => void) | null;
    onmessage: ((event: WebSocketMessageEvent) => void) | null;
    onerror: ((event: WebSocketErrorEvent) => void) | null;
    send(data: string): void;
    close(): void;
}
export type WebSocketFactory = (url: string) => WebSocketLike;
export interface MagnisPlatform {
    readonly storage: MagnisStorage;
    readonly fetch: FetchImplementation;
    readonly createWebSocket: WebSocketFactory;
    readonly connectionSeeds: () => Promise<readonly WorkspaceConnectionSeed[]>;
}
