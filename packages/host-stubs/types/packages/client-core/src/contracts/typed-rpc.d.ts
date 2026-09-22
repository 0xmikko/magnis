import { rpcContracts, type MagnisRpcMethod, type RpcArgsFor } from "@magnis/sdk";
import type { RpcOutputFor } from "@magnis/sdk/rpc/contract";
interface RawRpcTransport {
    readonly rpc: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
}
/**
 * Send a native call through the SDK registry and decode its response.
 * Product code can adopt this helper incrementally without re-declaring a
 * result interface or selecting a result generic at the call site.
 */
export declare function rpcWithContract<Method extends MagnisRpcMethod>(transport: RawRpcTransport, method: Method, ...args: RpcArgsFor<(typeof rpcContracts)[Method]>): Promise<RpcOutputFor<(typeof rpcContracts)[Method]>>;
export {};
