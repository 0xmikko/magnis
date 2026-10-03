import { z } from "zod";
export declare const evalContracts: {
    readonly "eval.capabilities": import("../contract.js").RpcContract<"eval.capabilities", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
        module: z.ZodString;
        entities: z.ZodReadonly<z.ZodArray<z.ZodObject<{
            entity: z.ZodString;
            operations: z.ZodReadonly<z.ZodArray<z.ZodString>>;
            forms: z.ZodExactOptional<z.ZodReadonly<z.ZodRecord<z.ZodString, z.ZodType<import("../../index.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../../index.js").JsonValue, unknown>>>>>;
        }, z.core.$strict>>>;
    }, z.core.$strict>, "required">;
    readonly "eval.fixture.invoke": import("../contract.js").RpcContract<"eval.fixture.invoke", z.ZodObject<{
        actionId: z.ZodString;
        idempotencyKey: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        invocationId: z.ZodString;
        actionId: z.ZodString;
        phase: z.ZodLiteral<"trigger_evaluated">;
        actionTime: z.ZodISODateTime;
        eventEntityId: z.ZodNullable<z.ZodString>;
        episodeId: z.ZodNull;
        failureCode: z.ZodNull;
        failureDetail: z.ZodNull;
    }, z.core.$strict>, "required">;
};
//# sourceMappingURL=eval.d.ts.map