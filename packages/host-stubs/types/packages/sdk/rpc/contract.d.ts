import { z } from "zod";
import { type JsonObject, type JsonValue } from "../core/json.js";
export type RpcParamsMode = "required" | "optional";
export type ContractBoundary = "input" | "output" | "chunk";
/**
 * A transport codec keeps the SDK surface canonical while allowing a legacy
 * wire adapter to be explicit at the boundary.  Codec functions receive
 * values only after the public schema has validated them (and return values
 * that are validated again by the corresponding output/chunk schema).
 */
export interface RpcWireCodec {
    readonly encodeInput?: (value: unknown) => JsonValue;
    readonly encodeOutput?: (value: unknown) => JsonValue;
    readonly decodeInput?: (value: unknown) => unknown;
    readonly decodeOutput?: (value: unknown) => unknown;
    readonly decodeChunk?: (value: unknown) => unknown;
}
type StrictInputSchema<InputSchema extends z.ZodObject> = z.ZodObject<InputSchema["shape"], z.core.$strict>;
export interface RpcContract<Method extends string, InputSchema extends z.ZodObject, OutputSchema extends z.ZodType, Params extends RpcParamsMode = "required"> {
    readonly method: Method;
    readonly input: StrictInputSchema<InputSchema>;
    readonly output: OutputSchema;
    readonly params: Params;
    readonly inputJsonSchema: Readonly<JsonObject>;
    readonly wire?: RpcWireCodec;
}
export interface StreamContract<Method extends string, InputSchema extends z.ZodObject, ChunkSchema extends z.ZodType, OutputSchema extends z.ZodType, Params extends RpcParamsMode = "required"> extends RpcContract<Method, InputSchema, OutputSchema, Params> {
    readonly chunk: ChunkSchema;
}
export type RpcContractLike = RpcContract<string, z.ZodObject, z.ZodType, RpcParamsMode>;
export type StreamContractLike = StreamContract<string, z.ZodObject, z.ZodType, z.ZodType, RpcParamsMode>;
export type RpcInputFor<Contract extends RpcContractLike> = z.input<Contract["input"]>;
export type RpcHandlerInputFor<Contract extends RpcContractLike> = z.output<Contract["input"]>;
export type RpcOutputFor<Contract extends RpcContractLike> = z.output<Contract["output"]>;
export type RpcArgsFor<Contract extends RpcContractLike> = Contract["params"] extends "optional" ? readonly [params?: RpcInputFor<Contract>] : readonly [params: RpcInputFor<Contract>];
export type StreamChunkFor<Contract extends StreamContractLike> = z.output<Contract["chunk"]>;
export type RpcHandlerFor<Contract extends RpcContractLike> = (input: RpcHandlerInputFor<Contract>) => Promise<RpcOutputFor<Contract>>;
export type RpcRegistry = Readonly<Record<string, RpcContractLike>>;
export type RpcMethodFor<Registry extends RpcRegistry> = keyof Registry & string;
export type StreamMethodFor<Registry extends RpcRegistry> = {
    readonly [Method in keyof Registry]: Registry[Method] extends StreamContractLike ? Method : never;
}[keyof Registry] & string;
export type StreamContractFor<Registry extends RpcRegistry, Method extends StreamMethodFor<Registry>> = Extract<Registry[Method], StreamContractLike>;
/** A transport typed by one concrete registry of executable contracts. */
export interface MagnisRpcClient<Registry extends RpcRegistry> {
    rpc<Method extends RpcMethodFor<Registry>>(method: Method, ...args: RpcArgsFor<Registry[Method]>): Promise<RpcOutputFor<Registry[Method]>>;
    rpcStream<Method extends StreamMethodFor<Registry>>(method: Method, params: RpcInputFor<StreamContractFor<Registry, Method>>, onChunk: (chunk: StreamChunkFor<StreamContractFor<Registry, Method>>) => void): Promise<RpcOutputFor<StreamContractFor<Registry, Method>>>;
    rpcDynamic<OutputSchema extends z.ZodType<JsonValue>>(method: string, params: JsonObject, output: OutputSchema): Promise<z.output<OutputSchema>>;
}
export interface ContractIssue {
    readonly path: string;
    readonly message: string;
}
/** A stable validation failure that identifies the executable boundary. */
export declare class ContractValidationError extends Error {
    readonly name = "ContractValidationError";
    readonly method: string;
    readonly boundary: ContractBoundary;
    readonly issues: readonly ContractIssue[];
    constructor(method: string, boundary: ContractBoundary, issues: readonly ContractIssue[]);
}
/** Render validation details consistently for backend and client adapters. */
export declare function renderContractIssues(method: string, boundary: ContractBoundary, issues: readonly ContractIssue[]): string;
export declare function parseContractValue<Schema extends z.ZodType>(method: string, boundary: ContractBoundary, schema: Schema, value: unknown): z.output<Schema>;
export declare function strictInputSchema<const Shape extends z.core.$ZodLooseShape>(input: z.ZodObject<Shape, z.core.$ZodObjectConfig>): z.ZodObject<Shape, z.core.$strict>;
/** Render a closed input schema for publication to clients and agents. */
export declare function inputJsonSchema(input: z.ZodObject): Readonly<JsonObject>;
interface RpcContractDefinition<Method extends string, InputSchema extends z.ZodObject, OutputSchema extends z.ZodType, Params extends RpcParamsMode> {
    readonly method: Method;
    readonly input: InputSchema;
    readonly output: OutputSchema;
    readonly params?: Params;
    readonly wire?: RpcWireCodec;
}
export declare function defineRpcContract<const Method extends string, const InputSchema extends z.ZodObject, const OutputSchema extends z.ZodType>(definition: RpcContractDefinition<Method, InputSchema, OutputSchema, "optional"> & {
    readonly params: "optional";
}): RpcContract<Method, InputSchema, OutputSchema, "optional">;
export declare function defineRpcContract<const Method extends string, const InputSchema extends z.ZodObject, const OutputSchema extends z.ZodType>(definition: RpcContractDefinition<Method, InputSchema, OutputSchema, "required">): RpcContract<Method, InputSchema, OutputSchema, "required">;
interface StreamContractDefinition<Method extends string, InputSchema extends z.ZodObject, ChunkSchema extends z.ZodType, OutputSchema extends z.ZodType> {
    readonly method: Method;
    readonly input: InputSchema;
    readonly chunk: ChunkSchema;
    readonly output: OutputSchema;
    readonly wire?: RpcWireCodec;
}
export declare function defineStreamContract<const Method extends string, const InputSchema extends z.ZodObject, const ChunkSchema extends z.ZodType, const OutputSchema extends z.ZodType>(definition: StreamContractDefinition<Method, InputSchema, ChunkSchema, OutputSchema>): StreamContract<Method, InputSchema, ChunkSchema, OutputSchema>;
export declare function parseRpcInput<Contract extends RpcContractLike>(contract: Contract, value: unknown): RpcHandlerInputFor<Contract>;
/** Parse a backend wire request through the explicit input decoder. Client
 * callers use {@link parseRpcInput} on canonical values; backend adapters use
 * this function for the legacy serialized envelope. */
export declare function parseRpcWireInput<Contract extends RpcContractLike>(contract: Contract, value: unknown): RpcHandlerInputFor<Contract>;
export declare function parseRpcOutput<Contract extends RpcContractLike>(contract: Contract, value: unknown): RpcOutputFor<Contract>;
/** Encode a validated canonical output for a legacy transport envelope. */
export declare function encodeRpcOutput<Contract extends RpcContractLike>(contract: Contract, value: RpcOutputFor<Contract>): JsonValue;
/** Validate a backend's legacy wire response without changing the bytes that
 * the transport serializes. The client-side parser performs the canonical
 * decode; this helper lets backend registration enforce the same schema while
 * retaining the existing wire compatibility. */
export declare function validateRpcOutput<Contract extends RpcContractLike>(contract: Contract, value: unknown): void;
/** Validate a canonical input and encode it for the actual transport wire. */
export declare function encodeRpcInput<Contract extends RpcContractLike>(contract: Contract, value: unknown): JsonValue;
export declare function parseStreamChunk<Contract extends StreamContractLike>(contract: Contract, value: unknown): StreamChunkFor<Contract>;
export {};
//# sourceMappingURL=contract.d.ts.map