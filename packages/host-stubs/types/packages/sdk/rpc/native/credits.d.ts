import { z } from "zod";
export declare const creditBalanceGetContract: import("../contract.js").RpcContract<"credits.balance.get", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
    userId: z.ZodString;
    limitMicros: z.ZodNumber;
    remainingMicros: z.ZodNumber;
}, z.core.$strip>, "required">;
export declare const creditsContracts: {
    readonly "credits.balance.get": import("../contract.js").RpcContract<"credits.balance.get", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
        userId: z.ZodString;
        limitMicros: z.ZodNumber;
        remainingMicros: z.ZodNumber;
    }, z.core.$strip>, "required">;
};
//# sourceMappingURL=credits.d.ts.map