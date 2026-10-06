import { z } from "zod";
import { type JsonObject, type JsonValue } from "../core/json.js";
export type RpcParamsMode = "required" | "optional";
export type ContractBoundary = "input" | "output" | "chunk";
/** RPC inputs are objects; common operations may select among closed object forms. */
export type RpcInputSchema = z.ZodObject | z.ZodUnion<readonly z.ZodObject[]>;
type StrictInputSchema<InputSchema extends RpcInputSchema> = InputSchema extends z.ZodObject ? z.ZodObject<InputSchema["shape"], z.core.$strict> : InputSchema;
export interface RpcContract<Method extends string, InputSchema extends RpcInputSchema, OutputSchema extends z.ZodType, Params extends RpcParamsMode = "required"> {
    readonly method: Method;
    readonly input: StrictInputSchema<InputSchema>;
    readonly output: OutputSchema;
    readonly params: Params;
    readonly inputJsonSchema: Readonly<JsonObject>;
}
export interface StreamContract<Method extends string, InputSchema extends z.ZodObject, ChunkSchema extends z.ZodType, OutputSchema extends z.ZodType, Params extends RpcParamsMode = "required"> extends RpcContract<Method, InputSchema, OutputSchema, Params> {
    readonly chunk: ChunkSchema;
}
export type RpcContractLike = Omit<RpcContract<string, z.ZodObject, z.ZodType, RpcParamsMode>, "input"> & {
    readonly input: RpcInputSchema & z.ZodType;
};
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
/** Parse one boundary value with its schema, exactly as the schema states it:
 * a strict object refuses an unknown key at every boundary. */
export declare function parseContractValue<Schema extends z.ZodType>(method: string, boundary: ContractBoundary, schema: Schema, value: unknown): z.output<Schema>;
export declare function strictInputSchema<const Input extends RpcInputSchema>(input: Input): StrictInputSchema<Input>;
/** Render a closed input schema for publication to clients and agents. */
export declare function inputJsonSchema(input: RpcInputSchema): Readonly<JsonObject>;
interface RpcContractDefinition<Method extends string, InputSchema extends RpcInputSchema, OutputSchema extends z.ZodType, Params extends RpcParamsMode> {
    readonly method: Method;
    readonly input: InputSchema;
    readonly output: OutputSchema;
    readonly params?: Params;
}
export declare function defineRpcContract<const Method extends string, const InputSchema extends RpcInputSchema, const OutputSchema extends z.ZodType>(definition: RpcContractDefinition<Method, InputSchema, OutputSchema, "optional"> & {
    readonly params: "optional";
}): RpcContract<Method, InputSchema, OutputSchema, "optional">;
export declare function defineRpcContract<const Method extends string, const InputSchema extends RpcInputSchema, const OutputSchema extends z.ZodType>(definition: RpcContractDefinition<Method, InputSchema, OutputSchema, "required">): RpcContract<Method, InputSchema, OutputSchema, "required">;
interface StreamContractDefinition<Method extends string, InputSchema extends z.ZodObject, ChunkSchema extends z.ZodType, OutputSchema extends z.ZodType> {
    readonly method: Method;
    readonly input: InputSchema;
    readonly chunk: ChunkSchema;
    readonly output: OutputSchema;
}
export declare function defineStreamContract<const Method extends string, const InputSchema extends z.ZodObject, const ChunkSchema extends z.ZodType, const OutputSchema extends z.ZodType>(definition: StreamContractDefinition<Method, InputSchema, ChunkSchema, OutputSchema>): StreamContract<Method, InputSchema, ChunkSchema, OutputSchema>;
export declare function parseRpcInput<Contract extends RpcContractLike>(contract: Contract, value: unknown): RpcHandlerInputFor<Contract>;
export declare function parseRpcOutput<Contract extends RpcContractLike>(contract: Contract, value: unknown): RpcOutputFor<Contract>;
export declare function parseStreamChunk<Contract extends StreamContractLike>(contract: Contract, value: unknown): StreamChunkFor<Contract>;
export {};
//# sourceMappingURL=contract.d.ts.map