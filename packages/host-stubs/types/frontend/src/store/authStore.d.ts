/**
 * Auth state store.
 *
 * Single source of truth for the authenticated user's token and
 * profile. Persists token to localStorage so the WS client can
 * reconnect after reloads. Backend manages the HttpOnly media_token
 * cookie — the frontend only handles the Bearer token.
 *
 * Validates INV-AUTH-14 (WS auth frame) and INV-AUTH-12 (set-password).
 */
export interface AuthUser {
    readonly id: string;
    readonly name: string;
    readonly surname: string | null;
    readonly email: string | null;
}
interface LoginPayload {
    readonly email?: string;
    readonly password?: string;
}
interface AuthState {
    readonly workspaceId: string | null;
    readonly token: string | null;
    readonly user: AuthUser | null;
    login: (payload?: LoginPayload) => Promise<void>;
    logout: () => Promise<void>;
    /** Drop a stale/rejected token LOCALLY (no backend call). The WS client
     *  calls this when the server rejects the presented token so the next
     *  reconnect goes token-less (Open-mode admits the local default user). */
    clearStaleToken: () => void;
    /** Set password for the currently authenticated user (enrolment). */
    setPassword: (password: string) => Promise<void>;
    applySessionForWorkspace: (workspaceId: string, token: string, user: AuthUser) => void;
    applySession: (token: string, user: AuthUser) => void;
}
export declare const useAuthStore: import("zustand").UseBoundStore<import("zustand").StoreApi<AuthState>>;
/** Convenience selector for the raw token — used by non-React code. */
export declare function getAuthToken(): string | null;
export declare function getStoredUserForWorkspace(workspaceId: string): AuthUser | null;
/**
 * Merge the current Bearer token into a `HeadersInit`. If no token is
 * set, `extra` is returned unchanged (no `Authorization` header added).
 * Centralises the "add Bearer if present" pattern that previously lived
 * in three separate call sites (review item, round-3 Simplicity cop).
 */
export declare function authHeaders(extra?: HeadersInit): HeadersInit;
export {};
