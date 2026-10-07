import { JsonValueSchema } from "../core/json.js";
import { inputJsonSchema, parseContractValue, strictInputSchema, ContractValidationError, } from "../rpc/contract.js";
export function defineHttpContract(definition) {
    const input = strictInputSchema(definition.input);
    return {
        method: definition.method,
        path: definition.path,
        input,
        output: definition.output,
        params: "required",
        inputJsonSchema: inputJsonSchema(input),
        requestKind: definition.requestKind ?? (definition.method === "GET" ? "query" : "json"),
    };
}
export function parseHttpInput(contract, value) {
    return parseContractValue(`${contract.method} ${contract.path}`, "input", contract.input, value);
}
export function parseHttpOutput(contract, value) {
    return parseContractValue(`${contract.method} ${contract.path}`, "output", contract.output, value);
}
/** Build the actual path/body target, including query and path parameters.
 * Multipart/raw endpoints are explicitly marked and must be sent by the
 * transport-specific caller; this helper never serializes bytes as JSON. */
export function buildHttpRequest(contract, value) {
    const input = JsonValueSchema.parse(parseHttpInput(contract, value));
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
        throw new ContractValidationError(`${contract.method} ${contract.path}`, "input", [
            { path: "", message: "HTTP input must be an object" },
        ]);
    }
    const fields = { ...input };
    let path = contract.path;
    for (const parameter of path.matchAll(/:([A-Za-z][A-Za-z0-9_]*)|\*([A-Za-z][A-Za-z0-9_]*)/g)) {
        const fieldKey = parameter[1] ?? parameter[2];
        const field = fieldKey === undefined ? undefined : fields[fieldKey];
        if (fieldKey === undefined || field === undefined || typeof field !== "string") {
            throw new ContractValidationError(`${contract.method} ${contract.path}`, "input", [
                { path: fieldKey ?? "", message: "path parameter is required" },
            ]);
        }
        const encoded = parameter[2] === undefined
            ? encodeURIComponent(field)
            : field
                .split("/")
                .map((segment) => encodeURIComponent(segment))
                .join("/");
        path = path.replace(parameter[0], encoded);
        delete fields[fieldKey];
    }
    if (contract.requestKind === "query") {
        const query = new URLSearchParams();
        for (const [key, field] of Object.entries(fields)) {
            if (field === null)
                continue;
            if (typeof field === "object")
                query.set(key, JSON.stringify(field));
            else
                query.set(key, String(field));
        }
        const suffix = query.toString();
        return { method: contract.method, path: suffix === "" ? path : `${path}?${suffix}` };
    }
    if (contract.requestKind === "multipart" || contract.requestKind === "raw") {
        return { method: contract.method, path };
    }
    return { method: contract.method, path, body: fields };
}
