import { z } from "zod";
import { UuidShapeSchema } from "./uuid.js";
/** A semantic Magnis identifier with the runtime and assignment behavior of a string. */
export const IdSchema = z.string();
/** Unsaved graph values have no assigned identity. This is not an auth ID. */
export const nilId = "00000000-0000-0000-0000-000000000000";
/** A stored Entity reference, including Link endpoints and statement evidence. */
export const PersistentEntityIdSchema = UuidShapeSchema
    .refine((id) => id !== nilId, "Persistent Entity ID must not be nil")
    .brand();
export const EntityIdSchema = z.union([PersistentEntityIdSchema, z.literal(nilId)]);
