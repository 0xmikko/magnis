import { z } from "zod";
import { JsonObjectSchema, } from "../core/json.js";
/** A stable validation failure that identifies the executable boundary. */
export class ContractValidationError extends Error {
    name = "ContractValidationError";
    method;
    boundary;
    issues;
    constructor(method, boundary, issues) {
        super(renderContractIssues(method, boundary, issues));
        this.method = method;
        this.boundary = boundary;
        this.issues = issues;
    }
}
/** Render validation details consistently for backend and client adapters. */
export function renderContractIssues(method, boundary, issues) {
    const detail = issues
        .map((issue) => (issue.path === "" ? issue.message : `${issue.path}: ${issue.message}`))
        .join("; ");
    const subject = boundary === "input" ? method : `${method} ${boundary}`;
    return `${subject}: ${detail}`;
}
function contractIssues(error) {
    return error.issues.map((issue) => ({
        path: issue.path.map(String).join("."),
        message: issue.message,
    }));
}
/** Parse one boundary value with its schema, exactly as the schema states it:
 * a strict object refuses an unknown key at every boundary. */
export function parseContractValue(method, boundary, schema, value) {
    const result = schema.safeParse(value);
    if (!result.success) {
        throw new ContractValidationError(method, boundary, contractIssues(result.error));
    }
    return result.data;
}
export function strictInputSchema(input) {
    if (input instanceof z.ZodObject)
        return input.strict();
    // Union forms must already be closed so their exact inferred types survive.
    if (input.options.some(option => !(option.def.catchall instanceof z.ZodNever))) {
        throw new Error("RPC union forms must be strict objects");
    }
    return input;
}
/** Render a closed input schema for publication to clients and agents. */
export function inputJsonSchema(input) {
    const rendered = JsonObjectSchema.parse(z.toJSONSchema(strictInputSchema(input), { io: "input" }));
    const published = { ...rendered };
    delete published.$schema;
    return published;
}
/** A definition names only the fields a contract has; anything else, such as
 * a transport codec, is refused rather than silently dropped. */
function refuseUnknownFields(method, definition, fields) {
    const unknown = Object.keys(definition).filter((key) => !fields.includes(key));
    if (unknown.length > 0) {
        throw new Error(`RPC contract ${method} has no field ${unknown.join(", ")}`);
    }
}
export function defineRpcContract(definition) {
    refuseUnknownFields(definition.method, definition, ["method", "input", "output", "params"]);
    const input = strictInputSchema(definition.input);
    return {
        method: definition.method,
        input,
        output: definition.output,
        params: definition.params ?? "required",
        inputJsonSchema: inputJsonSchema(input),
    };
}
export function defineStreamContract(definition) {
    refuseUnknownFields(definition.method, definition, ["method", "input", "chunk", "output"]);
    const input = strictInputSchema(definition.input);
    return {
        method: definition.method,
        input,
        chunk: definition.chunk,
        output: definition.output,
        params: "required",
        inputJsonSchema: inputJsonSchema(input),
    };
}
export function parseRpcInput(contract, value) {
    return parseContractValue(contract.method, "input", contract.input, value);
}
export function parseRpcOutput(contract, value) {
    return parseContractValue(contract.method, "output", contract.output, value);
}
export function parseStreamChunk(contract, value) {
    return parseContractValue(contract.method, "chunk", contract.chunk, value);
}
