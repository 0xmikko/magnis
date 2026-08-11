/**
 * Card projections (A-5): schema→DATA resolution shared by every surface.
 * The web keeps schema→React registration as an enhancement on top; a text
 * client renders these projections directly.
 */
import { type ExtractEntitiesOptions } from "./extractEntities.ts";
/**
 * Flattens a tool-kind envelope to the legacy card data shape so entity
 * renderers can read fields directly (e.g. `data.name`).
 *
 * - `{kind:"created", id, schema_id, fields}` → `{id, schema_id, ...fields}`
 * - `{kind:"updated", id, schema_id, changed}` → `{id, schema_id, ...after-values}`
 * - anything else passes through unchanged.
 *
 * Envelope is persisted verbatim in chat history so cards render the same
 * forever — no graph fetches at render time. (Moved verbatim from
 * `frontend/src/components/agent/resolveCardFields.ts`; the web file is a
 * re-export facade.)
 */
export declare function resolveCardFields(data: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>>;
/** Renderable card data — what any surface needs to draw an entity card.
 *  `title` follows the web's BaseEntityCard rule: name → title → "Untitled". */
export interface EntityCardProjection {
    readonly schemaId: string;
    readonly entityId: string | null;
    readonly title: string;
    readonly kind: "created" | "updated" | null;
    /** Flattened field values (resolveCardFields output). */
    readonly fields: Readonly<Record<string, unknown>>;
}
/** Extract + flatten a tool result into renderable card projections —
 *  extractEntities ∘ resolveCardFields, with the web's title rule. */
export declare function projectEntityCards(result: unknown, opts?: ExtractEntitiesOptions): readonly EntityCardProjection[];
