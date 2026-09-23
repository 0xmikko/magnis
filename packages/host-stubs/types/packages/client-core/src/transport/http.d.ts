import { type HttpContractLike, type HttpInputFor, type HttpOutputFor } from "@magnis/sdk";
import type { FetchImplementation } from "../platform.ts";
export declare class HttpClientError extends Error {
    readonly status: number;
    readonly responseBody: unknown;
    constructor(status: number, responseBody: unknown);
}
export interface HttpRequestOptions {
    readonly token?: string | null;
    /** `null` selects Node's explicit no-deadline transport for long local jobs. */
    readonly responseDeadlineMs?: number | null;
    readonly fetch?: FetchImplementation;
}
/** Execute one SDK-described request. Callers state whether the operation is
 * public or bearer-bound; browser credentials never carry workspace state. */
export declare function httpRequest<Contract extends HttpContractLike>(baseUrl: string, contract: Contract, input: HttpInputFor<Contract>, options: HttpRequestOptions): Promise<HttpOutputFor<Contract>>;
/** Execute one SDK-described HTTP operation with an explicit bearer. */
export declare function httpWithContract<Contract extends HttpContractLike>(baseUrl: string, token: string, contract: Contract, input: HttpInputFor<Contract>, options: Omit<HttpRequestOptions, "token">): Promise<HttpOutputFor<Contract>>;
