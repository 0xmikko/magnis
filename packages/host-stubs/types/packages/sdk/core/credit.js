import { z } from "zod";
/** Current AI execution allowance. Money is stored and transported in micros. */
export const CreditBalanceSchema = z.strictObject({
    userId: z.string().min(1),
    limitMicros: z.number().int().nonnegative(),
    remainingMicros: z.number().int(),
});
