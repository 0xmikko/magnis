import { z } from "zod";
/** `file.upload`: a display name and an absolute path the host reads the
 * bytes from. Omitted, the MIME type is derived from the path's extension. */
export declare const FileUploadParamsSchema: z.ZodObject<{
    name: z.ZodString;
    localPath: z.ZodString;
    mimeType: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type FileUploadParams = z.input<typeof FileUploadParamsSchema>;
/** `file.upload`: the created `file.object` entity, described. */
export declare const FileUploadResultSchema: z.ZodObject<{
    id: z.ZodString;
    schemaId: z.ZodString;
    name: z.ZodString;
    mimeType: z.ZodString;
    sizeBytes: z.ZodNumber;
}, z.core.$strict>;
export type FileUploadResult = z.output<typeof FileUploadResultSchema>;
/** `POST /files/upload`: the multipart upload's entity and its serve URL. */
export declare const FileUploadHttpResultSchema: z.ZodObject<{
    entityId: z.ZodString;
    name: z.ZodString;
    mimeType: z.ZodString;
    sizeBytes: z.ZodNumber;
    url: z.ZodString;
}, z.core.$strict>;
export type FileUploadHttpResult = z.output<typeof FileUploadHttpResultSchema>;
export declare const FileExtraSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"image">;
    width: z.ZodNumber;
    height: z.ZodNumber;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodLiteral<"audio">;
    durationSeconds: z.ZodNumber;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodLiteral<"video">;
    durationSeconds: z.ZodNumber;
    width: z.ZodNumber;
    height: z.ZodNumber;
}, z.core.$strip>], "kind">;
export type FileExtra = z.output<typeof FileExtraSchema>;
/** The command `FileService.register` takes: a plugin's `FileRegisterParams`
 * after the host matched its provenance. */
export declare const RegisterFileCommandSchema: z.ZodObject<{
    externalId: z.ZodString;
    parentExternalId: z.ZodString;
    linkKind: z.ZodString;
    name: z.ZodNullable<z.ZodString>;
    mimeType: z.ZodString;
    sizeBytes: z.ZodNullable<z.ZodNumber>;
    localPath: z.ZodNullable<z.ZodString>;
    cloudUrl: z.ZodNullable<z.ZodString>;
    sourceRef: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
    sourceModule: z.ZodString;
    sourceSurface: z.ZodString;
    download: z.ZodBoolean;
    extra: z.ZodNullable<z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"image">;
        width: z.ZodNumber;
        height: z.ZodNumber;
    }, z.core.$strip>, z.ZodObject<{
        kind: z.ZodLiteral<"audio">;
        durationSeconds: z.ZodNumber;
    }, z.core.$strip>, z.ZodObject<{
        kind: z.ZodLiteral<"video">;
        durationSeconds: z.ZodNumber;
        width: z.ZodNumber;
        height: z.ZodNumber;
    }, z.core.$strip>], "kind">>;
}, z.core.$strip>;
export type RegisterFileCommand = z.output<typeof RegisterFileCommandSchema>;
//# sourceMappingURL=file.d.ts.map