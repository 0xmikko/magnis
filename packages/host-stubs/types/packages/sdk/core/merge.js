/** Entity merge: the survivor absorbs the retired entity. The preview reads,
 * the execution writes, and the merge tool takes either. */
import { z } from "zod";
import { IdSchema, PersistentEntityIdSchema } from "./id.js";
import { JsonValueSchema } from "./json.js";
const countSchema = z.int().nonnegative();
/** One entity taking part in a merge. */
export const MergeEntityInfoSchema = z.strictObject({
    id: PersistentEntityIdSchema,
    name: z.string().nullable(),
    schemaId: z.string(),
    /** How many keys this entity's dictionary carries. */
    propertyCount: countSchema,
    linkCount: countSchema,
});
/** One dictionary key in the preview. The survivor's value wins and the
 * retired value fills a gap; `conflict` is a disagreement the execution
 * refuses unless an override answers it, and then `autoResolved` is null. */
export const MergeFieldSchema = z.strictObject({
    key: z.string(),
    survivorValue: JsonValueSchema,
    retiredValue: JsonValueSchema,
    autoResolved: JsonValueSchema,
    conflict: z.boolean(),
});
/** One side of the merge, labelled by the provenance stamp its entity carries. */
export const MergeSourceSchema = z.strictObject({
    source: z.string(),
    entityId: PersistentEntityIdSchema,
    propertyCount: countSchema,
});
/** What a merge would do, read without writing. `fields` keeps key order. */
export const MergePreviewSchema = z.strictObject({
    survivor: MergeEntityInfoSchema,
    retired: MergeEntityInfoSchema,
    sources: z.array(MergeSourceSchema).readonly(),
    fields: z.record(z.string(), MergeFieldSchema).readonly(),
    linksToRepoint: countSchema,
    duplicateLinksToRemove: countSchema,
    reflexiveLinksToRemove: countSchema,
});
/** What an executed merge did. */
export const MergeResultSchema = z.strictObject({
    survivorId: PersistentEntityIdSchema,
    retiredId: PersistentEntityIdSchema,
    linksRepointed: countSchema,
    linksDeduplicated: countSchema,
    linksReflexiveRemoved: countSchema,
});
/** The operator's answer for one conflicting dictionary key. */
export const MergeOverrideSchema = z.strictObject({
    key: z.string(),
    value: JsonValueSchema,
});
export const MergePreviewCommandSchema = z.strictObject({
    userId: IdSchema,
    survivorId: PersistentEntityIdSchema,
    retiredId: PersistentEntityIdSchema,
});
export const MergeExecuteCommandSchema = z.strictObject({
    userId: IdSchema,
    survivorId: PersistentEntityIdSchema,
    retiredId: PersistentEntityIdSchema,
    overrides: z.array(MergeOverrideSchema).readonly(),
    reason: z.string().nullable(),
});
/** The merge tool's input; a plugin's mergePreview takes its two ids and
 * mergeExecute drops `preview`. Absent overrides are none and an absent
 * reason is null, as the tool reads them today. */
export const MergeInputSchema = z.strictObject({
    survivorId: PersistentEntityIdSchema,
    retiredId: PersistentEntityIdSchema,
    preview: z.boolean(),
    overrides: z.array(MergeOverrideSchema).readonly().default([]),
    reason: z.string().nullable().default(null),
});
