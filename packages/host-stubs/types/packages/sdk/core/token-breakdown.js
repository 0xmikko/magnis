import { z } from "zod";
export const TokenBreakdownSchema = z.strictObject({
    input: z.number().int().nonnegative(),
    output: z.number().int().nonnegative(),
    cacheRead: z.number().int().nonnegative(),
    cacheWrite: z.number().int().nonnegative(),
    cacheWriteOneHour: z.number().int().nonnegative(),
    reasoning: z.number().int().nonnegative(),
});
export const tokenBreakdownZero = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cacheWriteOneHour: 0,
    reasoning: 0,
};
