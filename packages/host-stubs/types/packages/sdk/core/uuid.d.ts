import { z } from "zod";
/**
 * The UUID shape accepted by Magnis and PostgreSQL UUID columns.
 *
 * This deliberately validates the hyphenated shape without narrowing version
 * or variant nibbles. Several persisted fixtures predate RFC-versioned IDs.
 */
export declare const UuidShapeSchema: z.ZodGUID;
export type UuidShape = z.output<typeof UuidShapeSchema>;
/** Parse a Magnis UUID-shaped string and normalize it to lowercase. */
export declare function parseUuidShape(value: string): UuidShape | null;
//# sourceMappingURL=uuid.d.ts.map