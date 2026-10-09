import { z } from "zod";
import { IdSchema } from "./id.js";
import { JsonValueSchema } from "./json.js";
/** `file.upload`: a display name and an absolute path the host reads the
 * bytes from. Omitted, the MIME type is derived from the path's extension. */
export const FileUploadParamsSchema = z.object({
    name: z.string().min(1),
    localPath: z.string().min(1),
    mimeType: z.string().optional(),
});
/** `file.upload`: the created `file.object` entity, described. */
export const FileUploadResultSchema = z.strictObject({
    id: IdSchema,
    schemaId: z.string(),
    name: z.string(),
    mimeType: z.string(),
    sizeBytes: z.number().int().nonnegative(),
});
/** `POST /files/upload`: the multipart upload's entity and its serve URL. */
export const FileUploadHttpResultSchema = z.strictObject({
    entityId: IdSchema,
    name: z.string(),
    mimeType: z.string(),
    sizeBytes: z.number().int().nonnegative(),
    url: z.string(),
});
export const FileExtraSchema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("image"), width: z.number().int().nonnegative(), height: z.number().int().nonnegative() }),
    z.object({ kind: z.literal("audio"), durationSeconds: z.number().nonnegative() }),
    z.object({ kind: z.literal("video"), durationSeconds: z.number().nonnegative(), width: z.number().int().nonnegative(), height: z.number().int().nonnegative() }),
]);
/** The command `FileService.register` takes: a plugin's `FileRegisterParams`
 * after the host matched its provenance. */
export const RegisterFileCommandSchema = z.object({
    externalId: z.string(),
    parentExternalId: z.string(),
    linkKind: z.string(),
    name: z.string().nullable(),
    mimeType: z.string(),
    sizeBytes: z.number().int().nonnegative().nullable(),
    localPath: z.string().nullable(),
    cloudUrl: z.string().nullable(),
    sourceRef: JsonValueSchema,
    sourceModule: z.string(),
    sourceSurface: z.string(),
    download: z.boolean(),
    extra: FileExtraSchema.nullable(),
});
