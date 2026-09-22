import { z } from "zod";
import { type LinkedEntitySummary } from "./linked-entity.js";
import { type EpisodeMessage } from "./episode-message.js";
import { JsonValueSchema } from "./json.js";
export declare const episodeStatuses: readonly ["active", "needs_input", "idle", "completed"];
export declare const EpisodeStatusSchema: z.ZodEnum<{
    completed: "completed";
    active: "active";
    needs_input: "needs_input";
    idle: "idle";
}>;
export type EpisodeStatus = z.output<typeof EpisodeStatusSchema>;
export declare const episodeLinkKindRanks: readonly ["started_with", "created", "triggered_by", "modified", "mentions", "reply_to"];
export type RankedEpisodeLinkKind = (typeof episodeLinkKindRanks)[number];
export declare const EpisodeListItemSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    rootEpisodeId: z.ZodString;
    parentEpisodeId: z.ZodNullable<z.ZodString>;
    rootTitle: z.ZodString;
    openDelegations: z.ZodInt;
    status: z.ZodUnion<[z.ZodEnum<{
        completed: "completed";
        active: "active";
        needs_input: "needs_input";
        idle: "idle";
    }>, z.ZodString]>;
    isArchived: z.ZodBoolean;
    messageCount: z.ZodInt;
    createdAt: z.ZodString;
    date: z.ZodString;
    updatedAt: z.ZodString;
    lastMessageAt: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type EpisodeListItem = z.output<typeof EpisodeListItemSchema>;
export declare const EpisodeSubtreeQuerySchema: z.ZodObject<{
    episodeId: z.ZodString;
    limit: z.ZodDefault<z.ZodInt>;
    cursor: z.ZodOptional<z.ZodString>;
    openOnly: z.ZodOptional<z.ZodBoolean>;
    directOnly: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strict>;
export type EpisodeSubtreeQuery = z.output<typeof EpisodeSubtreeQuerySchema>;
export declare const EpisodeSubtreeItemSchema: z.ZodObject<{
    episodeId: z.ZodString;
    parentEpisodeId: z.ZodString;
    rootEpisodeId: z.ZodString;
    title: z.ZodString;
    status: z.ZodEnum<{
        completed: "completed";
        active: "active";
        needs_input: "needs_input";
        idle: "idle";
    }>;
    depth: z.ZodInt;
}, z.core.$strict>;
export type EpisodeSubtreeItem = z.output<typeof EpisodeSubtreeItemSchema>;
export declare const EpisodeSubtreePageSchema: z.ZodObject<{
    items: z.ZodArray<z.ZodObject<{
        episodeId: z.ZodString;
        parentEpisodeId: z.ZodString;
        rootEpisodeId: z.ZodString;
        title: z.ZodString;
        status: z.ZodEnum<{
            completed: "completed";
            active: "active";
            needs_input: "needs_input";
            idle: "idle";
        }>;
        depth: z.ZodInt;
    }, z.core.$strict>>;
    nextCursor: z.ZodNullable<z.ZodString>;
}, z.core.$strict>;
export type EpisodeSubtreePage = z.output<typeof EpisodeSubtreePageSchema>;
export declare const EpisodeLinkSummarySchema: z.ZodObject<{
    episodeId: z.ZodString;
    title: z.ZodString;
    status: z.ZodString;
    isArchived: z.ZodBoolean;
    linkKinds: z.ZodArray<z.ZodString>;
    updatedAt: z.ZodString;
    isEmpty: z.ZodBoolean;
}, z.core.$strip>;
export type EpisodeLinkSummary = z.output<typeof EpisodeLinkSummarySchema>;
/** Search result over episode titles and durable summaries. */
export declare const EpisodeSearchResultSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    status: z.ZodString;
    isArchived: z.ZodBoolean;
    objective: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export type EpisodeSearchResult = z.output<typeof EpisodeSearchResultSchema>;
export declare const EpisodeDetailViewSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    status: z.ZodString;
    isArchived: z.ZodBoolean;
    messageCount: z.ZodInt;
    messages: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        episodeId: z.ZodString;
        ordinal: z.ZodInt;
        role: z.ZodString;
        content: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        toolName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        toolBinding: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            entity: z.ZodString;
            operation: z.ZodString;
        }, z.core.$strict>>>;
        toolCallId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        toolArgs: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        toolResult: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        status: z.ZodString;
        createdAt: z.ZodString;
        attachments: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
    linkedEntities: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodNullable<z.ZodString>;
        schemaId: z.ZodString;
        linkKind: z.ZodString;
        createdAt: z.ZodString;
        data: z.ZodOptional<z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>>;
        confidence: z.ZodNullable<z.ZodNumber>;
        origin: z.ZodEnum<{
            canonical: "canonical";
            agent: "agent";
        }>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
    }, z.core.$strip>>;
    todos: z.ZodOptional<z.ZodArray<z.ZodObject<{
        content: z.ZodString;
        status: z.ZodEnum<{
            completed: "completed";
            cancelled: "cancelled";
            pending: "pending";
            in_progress: "in_progress";
        }>;
        externalId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    }, z.core.$strip>>>;
    waits: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        executionId: z.ZodString;
        kind: z.ZodEnum<{
            tool_approval: "tool_approval";
            ask_user: "ask_user";
            native_approval: "native_approval";
            subagent: "subagent";
        }>;
        request: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
        createdAt: z.ZodString;
    }, z.core.$strict>>>;
    createdAt: z.ZodString;
    date: z.ZodString;
    updatedAt: z.ZodString;
    lastTurnResolution: z.ZodOptional<z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>>;
}, z.core.$strip>;
export type EpisodeDetailView = z.output<typeof EpisodeDetailViewSchema>;
export interface EpisodeContextView {
    readonly linkedEntities: readonly LinkedEntitySummary[];
    readonly messages: readonly EpisodeMessage[];
}
export declare const EpisodeCreateParamsSchema: z.ZodObject<{
    title: z.ZodString;
}, z.core.$strip>;
export type EpisodeCreateParams = z.input<typeof EpisodeCreateParamsSchema>;
export declare const agentImplementationIds: readonly ["magnis", "codex", "claude"];
export declare const AgentImplementationIdSchema: z.ZodEnum<{
    magnis: "magnis";
    codex: "codex";
    claude: "claude";
}>;
export type AgentImplementationId = z.output<typeof AgentImplementationIdSchema>;
/** One concrete model the selected Agent implementation can bind next. */
export declare const AgentModelOptionSchema: z.ZodObject<{
    id: z.ZodString;
    modelId: z.ZodString;
    name: z.ZodString;
    providerConnectionId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    providerDisplayName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    dataBoundary: z.ZodOptional<z.ZodEnum<{
        device_only: "device_only";
        cloud_allowed: "cloud_allowed";
    }>>;
    available: z.ZodOptional<z.ZodBoolean>;
    unavailableReason: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    isDefault: z.ZodOptional<z.ZodBoolean>;
    reasoning: z.ZodOptional<z.ZodDiscriminatedUnion<[z.ZodObject<{
        state: z.ZodLiteral<"none">;
        revision: z.ZodString;
        canUseProviderDefault: z.ZodBoolean;
    }, z.core.$strict>, z.ZodObject<{
        state: z.ZodLiteral<"unknown">;
        reason: z.ZodEnum<{
            metadata_unavailable: "metadata_unavailable";
            unverified_model: "unverified_model";
            adapter_not_supported: "adapter_not_supported";
        }>;
        revision: z.ZodString;
        canUseProviderDefault: z.ZodBoolean;
    }, z.core.$strict>, z.ZodObject<{
        state: z.ZodLiteral<"ready">;
        controls: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
            kind: z.ZodLiteral<"effort">;
            options: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                label: z.ZodString;
            }, z.core.$strict>>;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"thinking">;
            options: z.ZodArray<z.ZodBoolean>;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"budget">;
            unit: z.ZodLiteral<"tokens">;
            min: z.ZodNumber;
            max: z.ZodNumber;
            step: z.ZodNumber;
        }, z.core.$strict>], "kind">>;
        defaultValues: z.ZodNullable<z.ZodObject<{
            effort: z.ZodOptional<z.ZodString>;
            thinking: z.ZodOptional<z.ZodBoolean>;
            budgetTokens: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strict>>;
        revision: z.ZodString;
        canUseProviderDefault: z.ZodBoolean;
    }, z.core.$strict>], "state">>;
}, z.core.$strict>;
export type AgentModelOption = z.output<typeof AgentModelOptionSchema>;
export declare const episodeAgentStates: readonly ["idle", "active", "needs_input"];
export declare const EpisodeAgentStateSchema: z.ZodEnum<{
    active: "active";
    needs_input: "needs_input";
    idle: "idle";
}>;
export type EpisodeAgentState = z.output<typeof EpisodeAgentStateSchema>;
export declare const AgentProfileSnapshotSchema: z.ZodObject<{
    profileId: z.ZodString;
    configurationHash: z.ZodString;
    instructions: z.ZodString;
    allowedToolNames: z.ZodArray<z.ZodString>;
    contextBudgetTokens: z.ZodNumber;
}, z.core.$strict>;
export type AgentProfileSnapshot = z.output<typeof AgentProfileSnapshotSchema>;
export declare const AgentSessionBindingSchema: z.ZodObject<{
    id: z.ZodString;
    implementationId: z.ZodEnum<{
        magnis: "magnis";
        codex: "codex";
        claude: "claude";
    }>;
}, z.core.$strict>;
export type AgentSessionBinding = z.output<typeof AgentSessionBindingSchema>;
export declare const EpisodeAgentBindingSchema: z.ZodObject<{
    revision: z.ZodNumber;
    implementationId: z.ZodEnum<{
        magnis: "magnis";
        codex: "codex";
        claude: "claude";
    }>;
    modelId: z.ZodString;
    reasoning: z.ZodOptional<z.ZodDiscriminatedUnion<[z.ZodObject<{
        mode: z.ZodLiteral<"provider_default">;
    }, z.core.$strict>, z.ZodObject<{
        mode: z.ZodLiteral<"explicit">;
        capabilitiesRevision: z.ZodString;
        values: z.ZodObject<{
            effort: z.ZodOptional<z.ZodString>;
            thinking: z.ZodOptional<z.ZodBoolean>;
            budgetTokens: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strict>;
    }, z.core.$strict>], "mode">>;
    profile: z.ZodObject<{
        profileId: z.ZodString;
        configurationHash: z.ZodString;
        instructions: z.ZodString;
        allowedToolNames: z.ZodArray<z.ZodString>;
        contextBudgetTokens: z.ZodNumber;
    }, z.core.$strict>;
    session: z.ZodNullable<z.ZodObject<{
        id: z.ZodString;
        implementationId: z.ZodEnum<{
            magnis: "magnis";
            codex: "codex";
            claude: "claude";
        }>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type EpisodeAgentBinding = z.output<typeof EpisodeAgentBindingSchema>;
export declare const EpisodeWorkingMemorySchema: z.ZodObject<{
    agentMemory: z.ZodNullable<z.ZodString>;
    objective: z.ZodNullable<z.ZodString>;
    currentState: z.ZodNullable<z.ZodString>;
    recentDecisions: z.ZodArray<z.ZodString>;
    summary: z.ZodNullable<z.ZodString>;
    transcriptWindow: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        episodeId: z.ZodString;
        ordinal: z.ZodInt;
        role: z.ZodString;
        content: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        toolName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        toolBinding: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            entity: z.ZodString;
            operation: z.ZodString;
        }, z.core.$strict>>>;
        toolCallId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        toolArgs: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        toolResult: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        status: z.ZodString;
        createdAt: z.ZodString;
        attachments: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
    todos: z.ZodArray<z.ZodObject<{
        content: z.ZodString;
        status: z.ZodEnum<{
            completed: "completed";
            cancelled: "cancelled";
            pending: "pending";
            in_progress: "in_progress";
        }>;
        externalId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    }, z.core.$strip>>;
    waits: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        executionId: z.ZodString;
        kind: z.ZodEnum<{
            tool_approval: "tool_approval";
            ask_user: "ask_user";
            native_approval: "native_approval";
            subagent: "subagent";
        }>;
        request: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
        createdAt: z.ZodString;
    }, z.core.$strict>>;
    deniedToolCallIds: z.ZodArray<z.ZodString>;
    activeEntityIds: z.ZodArray<z.ZodString>;
}, z.core.$strict>;
export type EpisodeWorkingMemory = z.output<typeof EpisodeWorkingMemorySchema>;
/** A current terminal failure persisted by the Episode execution owner. */
export declare const EpisodeExecutionErrorSchema: z.ZodObject<{
    executionId: z.ZodString;
    code: z.ZodString;
    message: z.ZodString;
}, z.core.$strict>;
export type EpisodeExecutionError = z.output<typeof EpisodeExecutionErrorSchema>;
/** The single durable hydration document for an Episode Agent surface. */
export declare const EpisodeAgentSnapshotSchema: z.ZodObject<{
    episodeId: z.ZodString;
    rootEpisodeId: z.ZodString;
    parentEpisodeId: z.ZodNullable<z.ZodString>;
    openDelegations: z.ZodInt;
    hasUnfinishedDescendants: z.ZodBoolean;
    title: z.ZodString;
    isArchived: z.ZodBoolean;
    linkedEntities: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodNullable<z.ZodString>;
        schemaId: z.ZodString;
        linkKind: z.ZodString;
        createdAt: z.ZodString;
        data: z.ZodOptional<z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>>;
        confidence: z.ZodNullable<z.ZodNumber>;
        origin: z.ZodEnum<{
            canonical: "canonical";
            agent: "agent";
        }>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
    }, z.core.$strip>>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
    state: z.ZodEnum<{
        active: "active";
        needs_input: "needs_input";
        idle: "idle";
    }>;
    binding: z.ZodObject<{
        revision: z.ZodNumber;
        implementationId: z.ZodEnum<{
            magnis: "magnis";
            codex: "codex";
            claude: "claude";
        }>;
        modelId: z.ZodString;
        reasoning: z.ZodOptional<z.ZodDiscriminatedUnion<[z.ZodObject<{
            mode: z.ZodLiteral<"provider_default">;
        }, z.core.$strict>, z.ZodObject<{
            mode: z.ZodLiteral<"explicit">;
            capabilitiesRevision: z.ZodString;
            values: z.ZodObject<{
                effort: z.ZodOptional<z.ZodString>;
                thinking: z.ZodOptional<z.ZodBoolean>;
                budgetTokens: z.ZodOptional<z.ZodNumber>;
            }, z.core.$strict>;
        }, z.core.$strict>], "mode">>;
        profile: z.ZodObject<{
            profileId: z.ZodString;
            configurationHash: z.ZodString;
            instructions: z.ZodString;
            allowedToolNames: z.ZodArray<z.ZodString>;
            contextBudgetTokens: z.ZodNumber;
        }, z.core.$strict>;
        session: z.ZodNullable<z.ZodObject<{
            id: z.ZodString;
            implementationId: z.ZodEnum<{
                magnis: "magnis";
                codex: "codex";
                claude: "claude";
            }>;
        }, z.core.$strict>>;
    }, z.core.$strict>;
    workingMemory: z.ZodObject<{
        agentMemory: z.ZodNullable<z.ZodString>;
        objective: z.ZodNullable<z.ZodString>;
        currentState: z.ZodNullable<z.ZodString>;
        recentDecisions: z.ZodArray<z.ZodString>;
        summary: z.ZodNullable<z.ZodString>;
        transcriptWindow: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            episodeId: z.ZodString;
            ordinal: z.ZodInt;
            role: z.ZodString;
            content: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            toolName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            toolBinding: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                entity: z.ZodString;
                operation: z.ZodString;
            }, z.core.$strict>>>;
            toolCallId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            toolArgs: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            toolResult: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            status: z.ZodString;
            createdAt: z.ZodString;
            attachments: z.ZodDefault<z.ZodArray<z.ZodString>>;
        }, z.core.$strip>>;
        todos: z.ZodArray<z.ZodObject<{
            content: z.ZodString;
            status: z.ZodEnum<{
                completed: "completed";
                cancelled: "cancelled";
                pending: "pending";
                in_progress: "in_progress";
            }>;
            externalId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        }, z.core.$strip>>;
        waits: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            executionId: z.ZodString;
            kind: z.ZodEnum<{
                tool_approval: "tool_approval";
                ask_user: "ask_user";
                native_approval: "native_approval";
                subagent: "subagent";
            }>;
            request: z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>;
            createdAt: z.ZodString;
        }, z.core.$strict>>;
        deniedToolCallIds: z.ZodArray<z.ZodString>;
        activeEntityIds: z.ZodArray<z.ZodString>;
    }, z.core.$strict>;
    activeExecutionId: z.ZodNullable<z.ZodString>;
    executionError: z.ZodOptional<z.ZodObject<{
        executionId: z.ZodString;
        code: z.ZodString;
        message: z.ZodString;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type EpisodeAgentSnapshot = z.output<typeof EpisodeAgentSnapshotSchema>;
export declare const SendEpisodeMessageRequestSchema: z.ZodObject<{
    episodeId: z.ZodString;
    requestId: z.ZodString;
    messageId: z.ZodString;
    content: z.ZodString;
    attachmentIds: z.ZodArray<z.ZodString>;
}, z.core.$strict>;
export type SendEpisodeMessageRequest = z.output<typeof SendEpisodeMessageRequestSchema>;
export declare const EpisodeInputAdmissionSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"appended">;
    episodeId: z.ZodString;
    inputId: z.ZodString;
    sequence: z.ZodNumber;
    messageId: z.ZodString;
    state: z.ZodLiteral<"active">;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"queued">;
    episodeId: z.ZodString;
    inputId: z.ZodString;
    sequence: z.ZodNumber;
    state: z.ZodEnum<{
        active: "active";
        needs_input: "needs_input";
    }>;
}, z.core.$strict>], "kind">;
export type EpisodeInputAdmission = z.output<typeof EpisodeInputAdmissionSchema>;
export declare const ResolveAgentWaitRequestSchema: z.ZodObject<{
    kind: z.ZodEnum<{
        tool_approval: "tool_approval";
        ask_user: "ask_user";
        native_approval: "native_approval";
    }>;
    episodeId: z.ZodString;
    waitId: z.ZodString;
    resolutionId: z.ZodString;
    decision: z.ZodOptional<z.ZodEnum<{
        approved: "approved";
        denied: "denied";
    }>>;
    answer: z.ZodOptional<z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>>;
    argumentsOverride: z.ZodOptional<z.ZodType<import("./json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("./json.js").JsonValue, unknown>>>;
}, z.core.$strict>;
export type ResolveAgentWaitRequest = {
    readonly kind: "tool_approval" | "native_approval";
    readonly episodeId: string;
    readonly waitId: string;
    readonly resolutionId: string;
    readonly decision: "approved" | "denied";
    readonly argumentsOverride?: z.output<typeof JsonValueSchema>;
} | {
    readonly kind: "ask_user";
    readonly episodeId: string;
    readonly waitId: string;
    readonly resolutionId: string;
    readonly answer: z.output<typeof JsonValueSchema>;
};
export declare const AgentWaitResolutionReceiptSchema: z.ZodObject<{
    episodeId: z.ZodString;
    waitId: z.ZodString;
    inputId: z.ZodString;
    state: z.ZodEnum<{
        active: "active";
        needs_input: "needs_input";
    }>;
}, z.core.$strict>;
export type AgentWaitResolutionReceipt = z.output<typeof AgentWaitResolutionReceiptSchema>;
export declare const StopEpisodeAgentRequestSchema: z.ZodObject<{
    episodeId: z.ZodString;
    requestId: z.ZodString;
}, z.core.$strict>;
export type StopEpisodeAgentRequest = z.output<typeof StopEpisodeAgentRequestSchema>;
export declare const AgentStopReceiptSchema: z.ZodObject<{
    episodeId: z.ZodString;
    executionId: z.ZodNullable<z.ZodString>;
    state: z.ZodLiteral<"idle">;
    alreadyStopped: z.ZodBoolean;
}, z.core.$strict>;
export type AgentStopReceipt = z.output<typeof AgentStopReceiptSchema>;
export declare const EpisodeAgentSelectionInputSchema: z.ZodObject<{
    implementationId: z.ZodOptional<z.ZodEnum<{
        magnis: "magnis";
        codex: "codex";
        claude: "claude";
    }>>;
    modelId: z.ZodOptional<z.ZodString>;
    reasoning: z.ZodOptional<z.ZodDiscriminatedUnion<[z.ZodObject<{
        mode: z.ZodLiteral<"provider_default">;
    }, z.core.$strict>, z.ZodObject<{
        mode: z.ZodLiteral<"explicit">;
        capabilitiesRevision: z.ZodString;
        values: z.ZodObject<{
            effort: z.ZodOptional<z.ZodString>;
            thinking: z.ZodOptional<z.ZodBoolean>;
            budgetTokens: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strict>;
    }, z.core.$strict>], "mode">>;
}, z.core.$strict>;
export type EpisodeAgentSelectionInput = z.output<typeof EpisodeAgentSelectionInputSchema>;
export declare const CreateEpisodeRequestSchema: z.ZodObject<{
    requestId: z.ZodString;
    title: z.ZodString;
    selection: z.ZodOptional<z.ZodObject<{
        implementationId: z.ZodOptional<z.ZodEnum<{
            magnis: "magnis";
            codex: "codex";
            claude: "claude";
        }>>;
        modelId: z.ZodOptional<z.ZodString>;
        reasoning: z.ZodOptional<z.ZodDiscriminatedUnion<[z.ZodObject<{
            mode: z.ZodLiteral<"provider_default">;
        }, z.core.$strict>, z.ZodObject<{
            mode: z.ZodLiteral<"explicit">;
            capabilitiesRevision: z.ZodString;
            values: z.ZodObject<{
                effort: z.ZodOptional<z.ZodString>;
                thinking: z.ZodOptional<z.ZodBoolean>;
                budgetTokens: z.ZodOptional<z.ZodNumber>;
            }, z.core.$strict>;
        }, z.core.$strict>], "mode">>;
    }, z.core.$strict>>;
    profileId: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export type CreateEpisodeRequest = z.output<typeof CreateEpisodeRequestSchema>;
export declare const EpisodeCreatedSchema: z.ZodObject<{
    episodeId: z.ZodString;
    binding: z.ZodObject<{
        revision: z.ZodNumber;
        implementationId: z.ZodEnum<{
            magnis: "magnis";
            codex: "codex";
            claude: "claude";
        }>;
        modelId: z.ZodString;
        reasoning: z.ZodOptional<z.ZodDiscriminatedUnion<[z.ZodObject<{
            mode: z.ZodLiteral<"provider_default">;
        }, z.core.$strict>, z.ZodObject<{
            mode: z.ZodLiteral<"explicit">;
            capabilitiesRevision: z.ZodString;
            values: z.ZodObject<{
                effort: z.ZodOptional<z.ZodString>;
                thinking: z.ZodOptional<z.ZodBoolean>;
                budgetTokens: z.ZodOptional<z.ZodNumber>;
            }, z.core.$strict>;
        }, z.core.$strict>], "mode">>;
        profile: z.ZodObject<{
            profileId: z.ZodString;
            configurationHash: z.ZodString;
            instructions: z.ZodString;
            allowedToolNames: z.ZodArray<z.ZodString>;
            contextBudgetTokens: z.ZodNumber;
        }, z.core.$strict>;
        session: z.ZodNullable<z.ZodObject<{
            id: z.ZodString;
            implementationId: z.ZodEnum<{
                magnis: "magnis";
                codex: "codex";
                claude: "claude";
            }>;
        }, z.core.$strict>>;
    }, z.core.$strict>;
    state: z.ZodLiteral<"idle">;
}, z.core.$strict>;
export type EpisodeCreated = z.output<typeof EpisodeCreatedSchema>;
export declare const SetEpisodeModelRequestSchema: z.ZodObject<{
    episodeId: z.ZodString;
    requestId: z.ZodString;
    expectedRevision: z.ZodNumber;
    modelId: z.ZodString;
    reasoning: z.ZodOptional<z.ZodDiscriminatedUnion<[z.ZodObject<{
        mode: z.ZodLiteral<"provider_default">;
    }, z.core.$strict>, z.ZodObject<{
        mode: z.ZodLiteral<"explicit">;
        capabilitiesRevision: z.ZodString;
        values: z.ZodObject<{
            effort: z.ZodOptional<z.ZodString>;
            thinking: z.ZodOptional<z.ZodBoolean>;
            budgetTokens: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strict>;
    }, z.core.$strict>], "mode">>;
}, z.core.$strict>;
export type SetEpisodeModelRequest = z.output<typeof SetEpisodeModelRequestSchema>;
//# sourceMappingURL=episode.d.ts.map