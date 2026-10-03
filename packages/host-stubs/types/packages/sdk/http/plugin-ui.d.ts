import { z } from "zod";
/** Raw asset response returned by the plugin/source UI controllers. The
 * transport owns status, cache validators and bytes; it is not a JSON body. */
export declare const PluginUiResponseSchema: z.ZodObject<{
    status: z.ZodNumber;
    contentType: z.ZodOptional<z.ZodString>;
    etag: z.ZodOptional<z.ZodString>;
    cacheControl: z.ZodOptional<z.ZodString>;
    body: z.ZodCustom<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>;
}, z.core.$strip>;
export type PluginUiResponse = z.output<typeof PluginUiResponseSchema>;
/** One asset of an active module's exact package. The path placeholders are
 * the input keys, so the route and the contract name each value once. */
export declare const pluginUiAssetContract: import("./contract.js").HttpContract<"GET", "/api/plugins/:pluginId/:packageHash/ui/*assetPath", z.ZodObject<{
    pluginId: z.ZodString;
    packageHash: z.ZodString;
    assetPath: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    status: z.ZodNumber;
    contentType: z.ZodOptional<z.ZodString>;
    etag: z.ZodOptional<z.ZodString>;
    cacheControl: z.ZodOptional<z.ZodString>;
    body: z.ZodCustom<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>;
}, z.core.$strip>>;
export declare const sourceAuthScreenContract: import("./contract.js").HttpContract<"GET", "/api/sources/:source/:packageHash/auth/screen.js", z.ZodObject<{
    source: z.ZodString;
    packageHash: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    status: z.ZodNumber;
    contentType: z.ZodOptional<z.ZodString>;
    etag: z.ZodOptional<z.ZodString>;
    cacheControl: z.ZodOptional<z.ZodString>;
    body: z.ZodCustom<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>;
}, z.core.$strip>>;
//# sourceMappingURL=plugin-ui.d.ts.map