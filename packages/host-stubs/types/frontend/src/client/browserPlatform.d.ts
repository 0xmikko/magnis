import { type MagnisPlatform } from "@magnis/client-core";
export declare const LOCAL_CONNECTION_ID = "local";
export declare const MAGNIS_CLOUD_CONNECTION_ID = "magnisCloud";
export declare function resolveApiBaseUrl(rawApiUrl: string | undefined, pageUrl: URL): string;
export declare function resolveManagedCloudApiBaseUrl(): string;
export declare function createBrowserPlatform(): MagnisPlatform;
