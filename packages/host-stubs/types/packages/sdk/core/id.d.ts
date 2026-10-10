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
/** Unsaved graph values have no assigned identity. This is not an auth ID. */
export declare const nilId = "00000000-0000-0000-0000-000000000000";
export type NilId = typeof nilId;
/** A stored Entity reference, including Link endpoints and statement evidence. */
export declare const PersistentEntityIdSchema: z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">;
export type PersistentEntityId = z.output<typeof PersistentEntityIdSchema>;
export declare const EntityIdSchema: z.ZodUnion<readonly [z.core.$ZodBranded<z.ZodGUID, "PersistentEntityId", "out">, z.ZodLiteral<"00000000-0000-0000-0000-000000000000">]>;
export type EntityId = z.output<typeof EntityIdSchema>;
//# sourceMappingURL=id.d.ts.map