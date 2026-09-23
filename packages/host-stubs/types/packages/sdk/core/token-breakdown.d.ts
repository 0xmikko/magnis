import { z } from "zod";
export declare const TokenBreakdownSchema: z.ZodObject<{
    input: z.ZodNumber;
    output: z.ZodNumber;
    cacheRead: z.ZodNumber;
    cacheWrite: z.ZodNumber;
    cacheWriteOneHour: z.ZodNumber;
    reasoning: z.ZodNumber;
}, z.core.$strip>;
export type TokenBreakdown = z.output<typeof TokenBreakdownSchema>;
export declare const tokenBreakdownZero: TokenBreakdown;
//# sourceMappingURL=token-breakdown.d.ts.map