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
export declare const pluginUiAssetContract: import("./contract.js").HttpContract<"GET", "/api/plugins/:plugin_id/ui/*asset_path", z.ZodObject<{
    pluginId: z.ZodString;
    assetPath: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    status: z.ZodNumber;
    contentType: z.ZodOptional<z.ZodString>;
    etag: z.ZodOptional<z.ZodString>;
    cacheControl: z.ZodOptional<z.ZodString>;
    body: z.ZodCustom<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>;
}, z.core.$strip>>;
export declare const sourceAuthScreenContract: import("./contract.js").HttpContract<"GET", "/api/sources/:source/auth/screen.js", z.ZodObject<{
    source: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    status: z.ZodNumber;
    contentType: z.ZodOptional<z.ZodString>;
    etag: z.ZodOptional<z.ZodString>;
    cacheControl: z.ZodOptional<z.ZodString>;
    body: z.ZodCustom<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>;
}, z.core.$strip>>;
//# sourceMappingURL=plugin-ui.d.ts.map