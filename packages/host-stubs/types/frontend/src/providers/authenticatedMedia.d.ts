export interface AuthenticatedMediaContextValue {
    readonly pairKey: string;
    readonly baseUrl: string;
    readonly token: string;
}
export declare const AuthenticatedMediaContext: import("react").Context<AuthenticatedMediaContextValue | null>;
export declare function useAuthenticatedMediaUrl(source: string | null): string | null;
