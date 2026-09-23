import { z } from "zod";
export declare const FileUploadParamsSchema: z.ZodObject<{
    name: z.ZodString;
    localPath: z.ZodString;
    mimeType: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type FileUploadParams = z.input<typeof FileUploadParamsSchema>;
export declare const FileUploadResultSchema: z.ZodObject<{
    id: z.ZodString;
    schemaId: z.ZodString;
    name: z.ZodString;
    mimeType: z.ZodString;
    sizeBytes: z.ZodNumber;
}, z.core.$strip>;
export type FileUploadResult = z.output<typeof FileUploadResultSchema>;
export declare const FileUploadHttpResultSchema: z.ZodObject<{
    entityId: z.ZodString;
    name: z.ZodString;
    mimeType: z.ZodString;
    sizeBytes: z.ZodNumber;
    url: z.ZodString;
}, z.core.$strip>;
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