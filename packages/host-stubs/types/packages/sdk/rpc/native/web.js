import { z } from "zod";
import { EntityCapabilitiesSchema } from "../../core/plugin.js";
import { UuidShapeSchema } from "../../core/uuid.js";
import { WebLinkDetailViewSchema, WebLinkOpenResultSchema, WebSearchResultsSchema } from "../../core/web.js";
import { defineRpcContract } from "../contract.js";
const searchContract = defineRpcContract({
    method: "web.search",
    input: z.object({
        query: z.string().min(1).describe("Free-text search query"),
        limit: z.int().min(1).max(10).default(5).describe("Max results"),
    }),
    output: WebSearchResultsSchema,
});
export const webContracts = {
    "web.capabilities": defineRpcContract({
        method: "web.capabilities",
        input: z.object({}),
        output: EntityCapabilitiesSchema,
    }),
    "web.link.get": defineRpcContract({
        method: "web.link.get",
        input: z.object({
            id: UuidShapeSchema.describe("The web.link entity ID (from linked entities on another entity)"),
        }),
        output: WebLinkDetailViewSchema,
    }),
    // Either arm identifies a link. The pairing rule is a check the published
    // object schema cannot state, so it refines the parsed request.
    "web.link.open": defineRpcContract({
        method: "web.link.open",
        input: z.object({
            id: UuidShapeSchema.optional().describe("An existing web.link entity ID (from linked entities). Omit if passing `url`."),
            url: z
                .string()
                .min(1)
                .optional()
                .describe("A web address to open (e.g. a web.search result url). Registered as a web.link if " +
                "new. Omit if passing `id`."),
            forceRefresh: z.boolean().default(false).describe("Force re-fetch ignoring cache"),
        }).refine(({ id, url }) => id !== undefined || url !== undefined, "id or url is required"),
        output: WebLinkOpenResultSchema,
    }),
    "web.search": searchContract,
    // Bound operation names retain the existing client adapters for equivalent methods.
    "web.page.search": { ...searchContract, method: "web.page.search" },
};
