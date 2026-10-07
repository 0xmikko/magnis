import { z } from "zod";
import { GroupDetailViewSchema, GroupListItemSchema, GroupMemberItemSchema, ResolvedGroupIdentitySchema } from "../../core/group.js";
import { paginatedResponseSchema, PaginationSchema } from "../../core/pagination.js";
import { EntityCapabilitiesSchema } from "../../core/plugin.js";
import { StatusAckSchema } from "../../core/rpc-response.js";
import { UuidShapeSchema } from "../../core/uuid.js";
import { defineRpcContract } from "../contract.js";
const addMemberContract = defineRpcContract({
    method: "groups.add_member",
    input: z.object({ groupId: z.string().min(1), entityId: z.string().min(1) }),
    output: StatusAckSchema,
});
const createContract = defineRpcContract({
    method: "groups.create",
    input: z.object({
        name: z.string().min(1),
        description: z.string().default(""),
        memory: z.string().default(""),
        clientId: UuidShapeSchema.optional().describe("Client-generated UUID for optimistic creation"),
    }),
    output: GroupListItemSchema,
});
const getContract = defineRpcContract({
    method: "groups.get",
    input: z.object({ id: z.string().min(1).describe("Group ID") }),
    output: GroupDetailViewSchema,
});
const listContract = defineRpcContract({
    method: "groups.list",
    input: z.object({
        search: z.string().optional().describe("Filter groups by name (case-insensitive substring match)"),
        ...PaginationSchema.shape,
    }),
    output: paginatedResponseSchema(GroupListItemSchema),
});
const removeMemberContract = defineRpcContract({
    method: "groups.remove_member",
    input: z.object({ groupId: z.string().min(1), entityId: z.string().min(1) }),
    output: StatusAckSchema,
});
const updateBioContract = defineRpcContract({
    method: "groups.update_bio",
    input: z.object({
        groupId: z.string().min(1),
        content: z.string().describe("Bio/self-description text for this group context"),
    }),
    output: StatusAckSchema,
});
const updateMemoryContract = defineRpcContract({
    method: "groups.update_memory",
    input: z.object({
        groupId: z.string().min(1),
        memory: z.string().describe("Group policy text: tone, rules, language, behavior instructions"),
    }),
    output: GroupListItemSchema,
});
export const groupsContracts = {
    "groups.add_member": addMemberContract,
    "groups.capabilities": defineRpcContract({
        method: "groups.capabilities",
        input: z.object({}),
        output: EntityCapabilitiesSchema,
    }),
    "groups.create": createContract,
    "groups.delete": defineRpcContract({
        method: "groups.delete",
        input: z.object({ id: z.string().min(1) }),
        output: StatusAckSchema,
    }),
    "groups.get": getContract,
    "groups.list": listContract,
    "groups.list_for_entity": defineRpcContract({
        method: "groups.list_for_entity",
        input: z.object({ entityId: z.string().min(1) }),
        output: z.array(GroupListItemSchema),
    }),
    "groups.list_members": defineRpcContract({
        method: "groups.list_members",
        input: z.object({ id: z.string().min(1) }),
        output: z.array(GroupMemberItemSchema),
    }),
    "groups.remove_member": removeMemberContract,
    "groups.resolve_identity": defineRpcContract({
        method: "groups.resolve_identity",
        input: z.object({ entityId: z.string().min(1) }),
        output: z.array(ResolvedGroupIdentitySchema),
    }),
    "groups.update": defineRpcContract({
        method: "groups.update",
        input: z.object({ id: z.string().min(1), name: z.string().optional(), description: z.string().optional(), memory: z.string().optional() }),
        output: GroupListItemSchema,
    }),
    "groups.update_bio": updateBioContract,
    "groups.update_memory": updateMemoryContract,
    // Bound operation names retain the existing client adapters for equivalent methods.
    "groups.group.create": { ...createContract, method: "groups.group.create" },
    "groups.group.get": { ...getContract, method: "groups.group.get" },
    "groups.group.link": { ...addMemberContract, method: "groups.group.link" },
    "groups.group.list": { ...listContract, method: "groups.group.list" },
    "groups.group.memory.update": { ...updateMemoryContract, method: "groups.group.memory.update" },
    "groups.group.unlink": { ...removeMemberContract, method: "groups.group.unlink" },
    "groups.identity.bio.update": { ...updateBioContract, method: "groups.identity.bio.update" },
};
