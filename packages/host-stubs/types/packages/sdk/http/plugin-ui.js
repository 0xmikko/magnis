import { z } from "zod";
import { defineHttpContract } from "./contract.js";
/** Raw asset response returned by the plugin/source UI controllers. The
 * transport owns status, cache validators and bytes; it is not a JSON body. */
export const PluginUiResponseSchema = z.object({
    status: z.number().int(),
    contentType: z.string().optional(),
    etag: z.string().optional(),
    cacheControl: z.string().optional(),
    body: z.instanceof(Uint8Array),
});
/** One asset of an active module's exact package. The path placeholders are
 * the input keys, so the route and the contract name each value once. */
export const pluginUiAssetContract = defineHttpContract({
    method: "GET",
    path: "/api/plugins/:pluginId/:packageHash/ui/*assetPath",
    requestKind: "raw",
    input: z.object({ pluginId: z.string().min(1), packageHash: z.string().min(1), assetPath: z.string() }),
    output: PluginUiResponseSchema,
});
export const sourceAuthScreenContract = defineHttpContract({
    method: "GET",
    path: "/api/sources/:source/:packageHash/auth/screen.js",
    requestKind: "raw",
    input: z.object({ source: z.string().min(1), packageHash: z.string().min(1) }),
    output: PluginUiResponseSchema,
});
