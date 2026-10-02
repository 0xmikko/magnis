import { z } from "zod";
export declare const evalContracts: {
    readonly "eval.capabilities": import("../contract.js").RpcContract<"eval.capabilities", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
        module: z.ZodString;
        entities: z.ZodReadonly<z.ZodArray<z.ZodObject<{
            entity: z.ZodString;
            operations: z.ZodReadonly<z.ZodArray<z.ZodString>>;
            forms: z.ZodExactOptional<z.ZodReadonly<z.ZodRecord<z.ZodString, z.ZodType<import("../../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../../core/json.js").JsonValue, unknown>>>>>;
        }, z.core.$strict>>>;
    }, z.core.$strict>, "required">;
    readonly "eval.fixture.invoke": import("../contract.js").RpcContract<"eval.fixture.invoke", z.ZodObject<{
        actionId: z.ZodString;
        idempotencyKey: z.ZodString;
    }, z.core.$strip>, z.ZodRecord<z.ZodString, z.ZodType<import("../../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../../core/json.js").JsonValue, unknown>>>, "required">;
};
//# sourceMappingURL=eval.d.ts.map