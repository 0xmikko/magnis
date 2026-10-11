import { z } from "zod";
/**
 * The UUID shape accepted by Magnis and PostgreSQL UUID columns.
 *
 * This deliberately validates the hyphenated shape without narrowing version
 * or variant nibbles. Several persisted fixtures predate RFC-versioned IDs.
 */
export const UuidShapeSchema = z.guid().toLowerCase().meta({ pattern: undefined });
/** Parse a Magnis UUID-shaped string and normalize it to lowercase. */
export function parseUuidShape(value) {
    const result = UuidShapeSchema.safeParse(value);
    return result.success ? result.data : null;
}
