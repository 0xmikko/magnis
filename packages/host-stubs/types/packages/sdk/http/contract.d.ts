import { z } from "zod";
import { type JsonValue } from "../core/json.js";
import { type RpcWireCodec } from "../rpc/contract.js";
export type HttpMethod = "DELETE" | "GET" | "PATCH" | "POST" | "PUT";
export type HttpRequestKind = "json" | "query" | "multipart" | "raw";
type StrictInputSchema<InputSchema extends z.ZodObject> = z.ZodObject<InputSchema["shape"], z.core.$strict>;
export interface HttpContract<Method extends HttpMethod, Path extends string, InputSchema extends z.ZodObject, OutputSchema extends z.ZodType> {
    readonly method: Method;
    readonly path: Path;
    readonly input: StrictInputSchema<InputSchema>;
    readonly output: OutputSchema;
    readonly params: "required";
    readonly inputJsonSchema: Readonly<Record<string, JsonValue>>;
    readonly requestKind: HttpRequestKind;
    readonly wire?: RpcWireCodec;
}
export type HttpContractLike = HttpContract<HttpMethod, string, z.ZodObject, z.ZodType>;
export type HttpInputFor<Contract extends HttpContractLike> = z.input<Contract["input"]>;
export type HttpHandlerInputFor<Contract extends HttpContractLike> = z.output<Contract["input"]>;
export type HttpOutputFor<Contract extends HttpContractLike> = z.output<Contract["output"]>;
interface HttpContractDefinition<Method extends HttpMethod, Path extends string, InputSchema extends z.ZodObject, OutputSchema extends z.ZodType> {
    readonly method: Method;
    readonly path: Path;
    readonly input: InputSchema;
    readonly output: OutputSchema;
    readonly requestKind?: HttpRequestKind;
    readonly wire?: RpcWireCodec;
}
export declare function defineHttpContract<const Method extends HttpMethod, const Path extends string, const InputSchema extends z.ZodObject, const OutputSchema extends z.ZodType>(definition: HttpContractDefinition<Method, Path, InputSchema, OutputSchema>): HttpContract<Method, Path, InputSchema, OutputSchema>;
export declare function parseHttpInput<Contract extends HttpContractLike>(contract: Contract, value: unknown): HttpHandlerInputFor<Contract>;
export declare function parseHttpOutput<Contract extends HttpContractLike>(contract: Contract, value: unknown): HttpOutputFor<Contract>;
/** Validate canonical request data and encode the actual HTTP payload. */
export declare function encodeHttpInput<Contract extends HttpContractLike>(contract: Contract, value: unknown): JsonValue;
export interface HttpRequestTarget {
    readonly method: HttpMethod;
    readonly path: string;
    readonly body?: JsonValue;
}
/** Build the actual path/body target, including query and path parameters.
 * Multipart/raw endpoints are explicitly marked and must be sent by the
 * transport-specific caller; this helper never serializes bytes as JSON. */
export declare function buildHttpRequest<Contract extends HttpContractLike>(contract: Contract, value: unknown): HttpRequestTarget;
export {};
//# sourceMappingURL=contract.d.ts.map