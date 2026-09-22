import { z } from "zod";
/** A semantic Magnis identifier with the runtime and assignment behavior of a string. */
export declare const IdSchema: z.ZodString;
/**
 * Common identifier type for graph objects and references.
 *
 * This is deliberately not branded: existing strings remain directly
 * assignable while signatures can communicate that a value is an identifier.
 */
export type Id = z.output<typeof IdSchema>;
//# sourceMappingURL=id.d.ts.map