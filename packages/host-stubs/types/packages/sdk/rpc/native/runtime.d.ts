import { z } from "zod";
export declare const runtimeContracts: {
    readonly "runtime.composer.setPresence": import("../contract.js").RpcContract<"runtime.composer.setPresence", z.ZodObject<{
        presence: z.ZodUnion<readonly [z.ZodObject<{
            mode: z.ZodString;
            threadKey: z.ZodString;
        }, z.core.$strip>, z.ZodNull]>;
    }, z.core.$strip>, z.ZodObject<{
        ok: z.ZodLiteral<true>;
    }, z.core.$strict>, "required">;
};
//# sourceMappingURL=runtime.d.ts.map