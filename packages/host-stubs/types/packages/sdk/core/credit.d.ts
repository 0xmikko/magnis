import { z } from "zod";
/** Current AI execution allowance. Money is stored and transported in micros. */
export declare const CreditBalanceSchema: z.ZodObject<{
    userId: z.ZodString;
    limitMicros: z.ZodNumber;
    remainingMicros: z.ZodNumber;
}, z.core.$strip>;
export type CreditBalance = z.output<typeof CreditBalanceSchema>;
//# sourceMappingURL=credit.d.ts.map