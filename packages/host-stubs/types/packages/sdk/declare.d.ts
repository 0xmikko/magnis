/** How a module declares an entity: identity, fields as types, and how the
 * entity is searched.
 *
 * One declaration, three derivations — the schema the graph enforces, the
 * declaration the search layer consumes, and the card a hit returns — so they
 * cannot disagree. What a module writes is types; `required` follows
 * optionality and the field set closes itself, because `z.object` is strict
 * when it is converted.
 *
 * Search is the upper layer here and names fields it does not own. Those names
 * are checked against the shape by the compiler, so a rename that misses one is
 * an error that suggests the right spelling rather than a string that quietly
 * stops matching.
 */
import { z } from "zod";
export type { AssertEqual, Equal } from "./core/assert-equal.js";
/** Where a value lives when it is not a key inside `properties`. The closed
 * set is the columns of the entity row a module may write. */
export type EntityColumn = "name" | "date" | "idx";
/** This field is a column of the entity row, not a key inside `properties`. A
 * storage fact, so it travels with the data rather than with the search block. */
export declare function column<T extends z.ZodType>(name: EntityColumn, schema: T): T;
export interface EntityIdentity {
    readonly id: string;
    readonly name: string;
    readonly description?: string;
    /** Endpoint roles this entity plays in relations. A link kind constrains its
     * two ends by role, so an entity that carries none can stand at neither. */
    readonly roles?: readonly string[];
    readonly triggerable?: boolean;
    readonly mergeable?: boolean;
}
export interface Searched<Shape extends z.ZodRawShape> {
    /** The entity's natural order: which field, which direction. */
    readonly order: readonly [keyof Shape & string, "asc" | "desc"];
    /** The field whose text is this entity's title in the semantic index. */
    readonly title?: keyof Shape & string;
    /** The field that is the haystack: indexed, and never returned whole in a
     * search hit — a snippet stands in its place when it was searched. */
    readonly body?: keyof Shape & string;
    /** One searchable name over several fields, for a value that may live in any
     * of them: a person's name across display, first, last and handle. */
    readonly alias?: Readonly<Record<string, readonly (keyof Shape & string)[]>>;
}
export declare function entity<Shape extends z.ZodRawShape>(identity: EntityIdentity, shape: Shape, searched: Searched<Shape>): z.ZodObject<Shape>;
//# sourceMappingURL=declare.d.ts.map