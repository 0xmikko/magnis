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
const COLUMN = "x-magnis-column";
const ENTITY = "x-magnis-entity";
/** This field is a column of the entity row, not a key inside `properties`. A
 * storage fact, so it travels with the data rather than with the search block. */
export function column(name, schema) {
    return schema.meta({ [COLUMN]: name });
}
export function entity(identity, shape, searched) {
    return z.object(shape).meta({ [ENTITY]: { ...identity, searched } });
}
