import { type JsonValue } from "../../core/json.js";
/** A closed, named field whose value is validated as JSON at the boundary. */
export declare const nativeJsonField: import("zod").ZodType<JsonValue, unknown, import("zod/v4/core").$ZodTypeInternals<JsonValue, unknown>>;
/** Explicit adapter for native controllers that still consume legacy wire
 * keys. Canonical SDK callers never see these names. Opaque JSON fields keep
 * their user/provider-owned keys unchanged. */
export declare const nativeWireCodec: {
    encodeInput: (value: unknown) => JsonValue;
    encodeOutput: (value: unknown) => JsonValue;
    decodeInput: (value: unknown) => JsonValue;
    decodeOutput: (value: unknown) => JsonValue;
};
/** Extension controllers preserve the canonical nested UI descriptor while
 * retaining legacy top-level wire names. Keep this rule on list/get only. */
export declare const extensionWireCodec: {
    encodeOutput: (value: unknown) => JsonValue;
    decodeOutput: (value: unknown) => JsonValue;
    encodeInput: (value: unknown) => JsonValue;
    decodeInput: (value: unknown) => JsonValue;
};
/** Eval fixture requests preserve the backend's `action_id` field while the
 * SDK exposes the canonical camel-case spelling. */
export declare const evalFixtureWireCodec: {
    encodeInput: (value: unknown) => JsonValue;
    decodeInput: (value: unknown) => JsonValue;
    encodeOutput: (value: unknown) => JsonValue;
    decodeOutput: (value: unknown) => JsonValue;
};
/** Source endpoints use legacy snake-case enum values in addition to legacy
 * keys. Keep that translation explicit and scoped; arbitrary provider JSON
 * must never have its string values rewritten. */
export declare const sourceWireCodec: {
    encodeInput: (value: unknown) => JsonValue;
    encodeOutput: (value: unknown) => JsonValue;
    decodeInput: (value: unknown) => JsonValue;
    decodeOutput: (value: unknown) => JsonValue;
};
//# sourceMappingURL=common.d.ts.map