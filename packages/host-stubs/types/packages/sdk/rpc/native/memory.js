import { z } from "zod";
import { MemoryRecordSchema, MemorySearchParamsSchema, MemoryTypeSchema, } from "../../core/memory.js";
import { PageLimitSchema } from "../../core/pagination.js";
import { EntityCapabilitiesSchema } from "../../core/plugin.js";
import { MemoryDiagnosticsSchema } from "../../core/search.js";
import { UuidShapeSchema } from "../../core/uuid.js";
import { defineRpcContract } from "../contract.js";
export const memoryContracts = {
    "memory.capabilities": defineRpcContract({
        method: "memory.capabilities",
        input: z.object({}),
        output: EntityCapabilitiesSchema,
    }),
    "memory.confirm": defineRpcContract({
        method: "memory.confirm",
        input: z.object({ id: UuidShapeSchema }),
        output: z.strictObject({ status: z.literal("ok"), confidence: z.number().int() }),
    }),
    "memory.diagnostics": defineRpcContract({
        method: "memory.diagnostics",
        input: z.object({}),
        output: MemoryDiagnosticsSchema,
    }),
    "memory.forget": defineRpcContract({
        method: "memory.forget",
        input: z.object({ id: UuidShapeSchema }),
        output: z.strictObject({ status: z.literal("forgotten") }),
    }),
    "memory.list": defineRpcContract({
        method: "memory.list",
        input: z.object({
            memoryType: MemoryTypeSchema.optional(),
            subjectEntityId: UuidShapeSchema.optional(),
            sourceEpisodeId: UuidShapeSchema.optional(),
            limit: PageLimitSchema,
        }),
        output: z.array(MemoryRecordSchema),
    }),
    "memory.reject": defineRpcContract({
        method: "memory.reject",
        input: z.object({ id: UuidShapeSchema }),
        output: z.strictObject({ status: z.literal("rejected") }),
    }),
    "memory.save": defineRpcContract({
        method: "memory.save",
        input: z.object({
            memoryType: MemoryTypeSchema,
            title: z.string().min(1),
            body: z.string(),
            subjectEntityId: UuidShapeSchema.optional(),
            projectEntityId: UuidShapeSchema.optional(),
        }),
        output: z.strictObject({ id: z.string(), status: z.literal("saved") }),
    }),
    "memory.search": defineRpcContract({
        method: "memory.search",
        input: MemorySearchParamsSchema,
        output: z.array(MemoryRecordSchema),
    }),
};
