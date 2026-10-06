import { z } from "zod";
export declare const runtimeContracts: {
    readonly "runtime.composer.setPresence": import("../contract.js").RpcContract<"runtime.composer.setPresence", z.ZodObject<{
        presence: z.ZodNullable<z.ZodObject<{
            mode: z.ZodEnum<{
                email: "email";
                telegram: "telegram";
            }>;
            threadKey: z.ZodString;
        }, z.core.$strict>>;
    }, z.core.$strip>, z.ZodObject<{
        ok: z.ZodLiteral<true>;
    }, z.core.$strict>, "required">;
};
//# sourceMappingURL=runtime.d.ts.map