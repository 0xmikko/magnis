/** Entity merge: the survivor absorbs the retired entity. The preview reads,
 * the execution writes, and the merge tool takes either. */
import { z } from "zod";
/** One entity taking part in a merge. */
export declare const MergeEntityInfoSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodNullable<z.ZodString>;
    schemaId: z.ZodString;
    propertyCount: z.ZodInt;
    linkCount: z.ZodInt;
}, z.core.$strict>;
export type MergeEntityInfo = z.output<typeof MergeEntityInfoSchema>;
/** One dictionary key in the preview. The survivor's value wins and the
 * retired value fills a gap; `conflict` is a disagreement the execution
 * refuses unless an override answers it, and then `autoResolved` is null. */
export declare const MergeFieldSchema: z.ZodObject<{
    key: z.ZodString;
    survivorValue: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
    retiredValue: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
    autoResolved: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
    conflict: z.ZodBoolean;
}, z.core.$strict>;
export type MergeField = z.output<typeof MergeFieldSchema>;
/** One side of the merge, labelled by the provenance stamp its entity carries. */
export declare const MergeSourceSchema: z.ZodObject<{
    source: z.ZodString;
    entityId: z.ZodString;
    propertyCount: z.ZodInt;
}, z.core.$strict>;
export type MergeSource = z.output<typeof MergeSourceSchema>;
/** What a merge would do, read without writing. `fields` keeps key order. */
export declare const MergePreviewSchema: z.ZodObject<{
    survivor: z.ZodObject<{
        id: z.ZodString;
        name: z.ZodNullable<z.ZodString>;
        schemaId: z.ZodString;
        propertyCount: z.ZodInt;
        linkCount: z.ZodInt;
    }, z.core.$strict>;
    retired: z.ZodObject<{
        id: z.ZodString;
        name: z.ZodNullable<z.ZodString>;
        schemaId: z.ZodString;
        propertyCount: z.ZodInt;
        linkCount: z.ZodInt;
    }, z.core.$strict>;
    sources: z.ZodReadonly<z.ZodArray<z.ZodObject<{
        source: z.ZodString;
        entityId: z.ZodString;
        propertyCount: z.ZodInt;
    }, z.core.$strict>>>;
    fields: z.ZodReadonly<z.ZodRecord<z.ZodString, z.ZodObject<{
        key: z.ZodString;
        survivorValue: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
        retiredValue: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
        autoResolved: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
        conflict: z.ZodBoolean;
    }, z.core.$strict>>>;
    linksToRepoint: z.ZodInt;
    duplicateLinksToRemove: z.ZodInt;
    reflexiveLinksToRemove: z.ZodInt;
}, z.core.$strict>;
export type MergePreview = z.output<typeof MergePreviewSchema>;
/** What an executed merge did. */
export declare const MergeResultSchema: z.ZodObject<{
    survivorId: z.ZodString;
    retiredId: z.ZodString;
    linksRepointed: z.ZodInt;
    linksDeduplicated: z.ZodInt;
    linksReflexiveRemoved: z.ZodInt;
}, z.core.$strict>;
export type MergeResult = z.output<typeof MergeResultSchema>;
/** The operator's answer for one conflicting dictionary key. */
export declare const MergeOverrideSchema: z.ZodObject<{
    key: z.ZodString;
    value: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
}, z.core.$strict>;
export type MergeOverride = z.output<typeof MergeOverrideSchema>;
export declare const MergePreviewCommandSchema: z.ZodObject<{
    userId: z.ZodString;
    survivorId: z.ZodString;
    retiredId: z.ZodString;
}, z.core.$strict>;
export type MergePreviewCommand = z.output<typeof MergePreviewCommandSchema>;
export declare const MergeExecuteCommandSchema: z.ZodObject<{
    userId: z.ZodString;
    survivorId: z.ZodString;
    retiredId: z.ZodString;
    overrides: z.ZodReadonly<z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        value: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
    }, z.core.$strict>>>;
    reason: z.ZodNullable<z.ZodString>;
}, z.core.$strict>;
export type MergeExecuteCommand = z.output<typeof MergeExecuteCommandSchema>;
/** The merge tool's input; a plugin's merge_preview takes its two ids and
 * merge_execute drops `preview`. Absent overrides are none and an absent
 * reason is null, as the tool reads them today. */
export declare const MergeInputSchema: z.ZodObject<{
    survivorId: z.ZodGUID;
    retiredId: z.ZodGUID;
    preview: z.ZodBoolean;
    overrides: z.ZodDefault<z.ZodReadonly<z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        value: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
    }, z.core.$strict>>>>;
    reason: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}, z.core.$strict>;
export type MergeInput = z.output<typeof MergeInputSchema>;
//# sourceMappingURL=merge.d.ts.map