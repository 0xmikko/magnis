import type { UserProfile } from "@magnis/sdk/core/user";
import type { Workspace } from "@magnis/sdk/core/workspace";
import type { ClientError } from "../errors.ts";
import type { MagnisPlatform } from "../platform.ts";
import type { ExternalResource, ResourceListener } from "../resource.ts";
import type { WorkspaceConnection } from "../workspaces/resource.ts";
interface ActivePair {
    readonly connectionId: string;
    readonly workspace: Workspace;
    readonly baseUrl: string;
}
export type MagnisSessionStatus = "discovering" | "anonymous" | "loadingProfile" | "authenticated" | "error";
export interface MagnisSession {
    readonly connectionId: string | null;
    readonly workspace: Workspace | null;
    readonly profile: UserProfile | null;
    readonly status: MagnisSessionStatus;
    readonly error: ClientError | null;
    login(this: void, input: {
        readonly email: string | null;
        readonly password: string | null;
    }): Promise<void>;
    beginGoogleLogin(this: void, input: {
        readonly redirectUri: string;
        readonly source: string | null;
    }): Promise<{
        readonly authorizeUrl: string;
        readonly state: string;
    }>;
    completeGoogleLogin(this: void, input: {
        readonly code: string;
        readonly state: string;
        readonly redirectUri: string;
    }): Promise<void>;
    acceptToken(this: void, token: string): Promise<void>;
    logout(this: void): Promise<void>;
    refreshProfile(this: void): Promise<void>;
}
export interface SessionResource extends ExternalResource<MagnisSession> {
    getToken(): string | null;
    getBaseUrl(): string | null;
}
export declare class MagnisSessionResource implements SessionResource {
    private readonly platform;
    private readonly state;
    private pair;
    private token;
    private profile;
    private status;
    private error;
    private generation;
    private readonly loginAction;
    private readonly beginGoogleLoginAction;
    private readonly completeGoogleLoginAction;
    private readonly acceptTokenAction;
    private readonly logoutAction;
    private readonly refreshProfileAction;
    constructor(platform: MagnisPlatform);
    getSnapshot(): MagnisSession;
    subscribe(listener: ResourceListener): () => void;
    getToken(): string | null;
    getBaseUrl(): string | null;
    currentPair(): ActivePair | null;
    activate(connection: WorkspaceConnection | null): Promise<void>;
    clearPair(connectionId: string, workspaceId: string): Promise<void>;
    dispose(): void;
    private login;
    private beginGoogleLogin;
    private completeGoogleLogin;
    private acceptToken;
    private logout;
    private refreshProfile;
    private loadProfile;
    private requirePair;
    private createSnapshot;
    private publish;
}
export {};
