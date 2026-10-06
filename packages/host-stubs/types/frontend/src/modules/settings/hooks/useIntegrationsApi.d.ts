import type { SourceListResponse, SourceStatusListResponse } from "@magnis/sdk";
export interface IntegrationsApi {
    readonly getSourceList: () => Promise<SourceListResponse>;
    readonly getSourceStatus: () => Promise<SourceStatusListResponse>;
    readonly disconnectAccount: (sourceId: string, accountId: string) => Promise<void>;
}
export declare function useIntegrationsApi(): IntegrationsApi;
