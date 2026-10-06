import { rpcContracts, type MagnisRpcMethod, type RpcArgsFor } from "@magnis/sdk";
import type { RpcOutputFor } from "@magnis/sdk/rpc/contract";
interface RawRpcTransport {
    readonly rpc: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
}
/**
 * Send a native call through the SDK registry: the request is parsed once
 * before it is sent and the answer once, strictly, when it arrives. The
 * transport is a raw exchange; it parses neither.
 */
export declare function rpcWithContract<Method extends MagnisRpcMethod>(transport: RawRpcTransport, method: Method, ...args: RpcArgsFor<(typeof rpcContracts)[Method]>): Promise<RpcOutputFor<(typeof rpcContracts)[Method]>>;
export {};
