import { z } from "zod";
export declare const episodesContracts: {
    readonly "episodes.append_message": import("../contract.js").RpcContract<"episodes.append_message", z.ZodObject<{
        episodeId: z.ZodString;
        requestId: z.ZodString;
        messageId: z.ZodString;
        content: z.ZodString;
        attachmentIds: z.ZodArray<z.ZodString>;
    }, z.core.$strict>, z.ZodDiscriminatedUnion<[z.ZodObject<{
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
    }, z.core.$strict>], "kind">, "required">;
    readonly "episodes.archive": import("../contract.js").RpcContract<"episodes.archive", z.ZodObject<{
        id: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        status: z.ZodString;
    }, z.core.$strict>, "required">;
    readonly "episodes.ask_user": import("../contract.js").RpcContract<"episodes.ask_user", z.ZodObject<{
        question: z.ZodString;
        answerSchema: z.ZodDefault<z.ZodType<import("../../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../../core/json.js").JsonValue, unknown>>>;
    }, z.core.$strip>, z.ZodObject<{
        status: z.ZodLiteral<"question_sent">;
        awaitingResponse: z.ZodBoolean;
    }, z.core.$strip>, "required">;
    readonly "episodes.capabilities": import("../contract.js").RpcContract<"episodes.capabilities", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
        module: z.ZodString;
        entities: z.ZodReadonly<z.ZodArray<z.ZodObject<{
            entity: z.ZodString;
            operations: z.ZodReadonly<z.ZodArray<z.ZodString>>;
            forms: z.ZodExactOptional<z.ZodReadonly<z.ZodRecord<z.ZodString, z.ZodType<import("../../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../../core/json.js").JsonValue, unknown>>>>>;
        }, z.core.$strict>>>;
    }, z.core.$strict>, "required">;
    readonly "episodes.complete": import("../contract.js").RpcContract<"episodes.complete", z.ZodObject<{
        id: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        status: z.ZodString;
    }, z.core.$strict>, "required">;
    readonly "episodes.create": import("../contract.js").RpcContract<"episodes.create", z.ZodObject<{
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
    }, z.core.$strict>, z.ZodObject<{
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
    }, z.core.$strict>, "required">;
    readonly "episodes.delegate": import("../contract.js").RpcContract<"episodes.delegate", z.ZodObject<{
        subagent: z.ZodString;
        title: z.ZodString;
        prompt: z.ZodString;
        model: z.ZodOptional<z.ZodString>;
        background: z.ZodOptional<z.ZodBoolean>;
        result: z.ZodOptional<z.ZodType<import("../../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../../core/json.js").JsonValue, unknown>>>;
    }, z.core.$strict>, z.ZodObject<{
        childEpisodeId: z.ZodString;
        waitId: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>, "required">;
    readonly "episodes.get": import("../contract.js").RpcContract<"episodes.get", z.ZodObject<{
        episodeId: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
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
            data: z.ZodOptional<z.ZodType<import("../../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../../core/json.js").JsonValue, unknown>>>;
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
                    pending: "pending";
                    completed: "completed";
                    cancelled: "cancelled";
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
                request: z.ZodType<import("../../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../../core/json.js").JsonValue, unknown>>;
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
    }, z.core.$strict>, "required">;
    readonly "episodes.link_entity": import("../contract.js").RpcContract<"episodes.link_entity", z.ZodObject<{
        episodeId: z.ZodString;
        entityId: z.ZodString;
        kind: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        status: z.ZodString;
    }, z.core.$strict>, "required">;
    readonly "episodes.list": import("../contract.js").RpcContract<"episodes.list", z.ZodObject<{
        includeChildren: z.ZodOptional<z.ZodBoolean>;
        search: z.ZodOptional<z.ZodString>;
        status: z.ZodOptional<z.ZodString>;
        archived: z.ZodDefault<z.ZodNullable<z.ZodBoolean>>;
        limit: z.ZodDefault<z.ZodNumber>;
        offset: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>, z.ZodObject<{
        items: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            title: z.ZodString;
            rootEpisodeId: z.ZodString;
            parentEpisodeId: z.ZodNullable<z.ZodString>;
            rootTitle: z.ZodString;
            openDelegations: z.ZodInt;
            status: z.ZodUnion<[z.ZodEnum<{
                active: "active";
                completed: "completed";
                needs_input: "needs_input";
                idle: "idle";
            }>, z.ZodString]>;
            isArchived: z.ZodBoolean;
            messageCount: z.ZodInt;
            createdAt: z.ZodString;
            date: z.ZodString;
            updatedAt: z.ZodString;
            lastMessageAt: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        total: z.ZodNumber;
        limit: z.ZodNumber;
        offset: z.ZodNumber;
    }, z.core.$strip>, "required">;
    readonly "episodes.list_for_entity": import("../contract.js").RpcContract<"episodes.list_for_entity", z.ZodObject<{
        limit: z.ZodDefault<z.ZodInt>;
        offset: z.ZodDefault<z.ZodInt>;
        entityId: z.ZodString;
        statuses: z.ZodOptional<z.ZodArray<z.ZodString>>;
        archived: z.ZodDefault<z.ZodNullable<z.ZodBoolean>>;
    }, z.core.$strict>, z.ZodArray<z.ZodObject<{
        episodeId: z.ZodString;
        title: z.ZodString;
        status: z.ZodString;
        isArchived: z.ZodBoolean;
        linkKinds: z.ZodArray<z.ZodString>;
        updatedAt: z.ZodString;
        isEmpty: z.ZodBoolean;
    }, z.core.$strip>>, "required">;
    readonly "episodes.model.set": import("../contract.js").RpcContract<"episodes.model.set", z.ZodObject<{
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
    }, z.core.$strict>, z.ZodObject<{
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
    }, z.core.$strict>, "required">;
    readonly "episodes.report": import("../contract.js").RpcContract<"episodes.report", z.ZodObject<{
        summary: z.ZodString;
        result: z.ZodOptional<z.ZodType<import("../../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../../core/json.js").JsonValue, unknown>>>;
    }, z.core.$strict>, z.ZodObject<{
        reported: z.ZodLiteral<true>;
    }, z.core.$strict>, "required">;
    readonly "episodes.search": import("../contract.js").RpcContract<"episodes.search", z.ZodObject<{
        query: z.ZodString;
        status: z.ZodOptional<z.ZodString>;
        archived: z.ZodDefault<z.ZodNullable<z.ZodBoolean>>;
        limit: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>, z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        status: z.ZodString;
        isArchived: z.ZodBoolean;
        objective: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>, "required">;
    readonly "episodes.set_status": import("../contract.js").RpcContract<"episodes.set_status", z.ZodObject<{
        id: z.ZodString;
        status: z.ZodEnum<{
            active: "active";
            completed: "completed";
            needs_input: "needs_input";
            idle: "idle";
        }>;
    }, z.core.$strip>, z.ZodObject<{
        status: z.ZodString;
    }, z.core.$strict>, "required">;
    readonly "episodes.set_title": import("../contract.js").RpcContract<"episodes.set_title", z.ZodObject<{
        episodeId: z.ZodString;
        title: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        status: z.ZodString;
    }, z.core.$strict>, "required">;
    readonly "episodes.stop": import("../contract.js").RpcContract<"episodes.stop", z.ZodObject<{
        episodeId: z.ZodString;
        requestId: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        episodeId: z.ZodString;
        executionId: z.ZodNullable<z.ZodString>;
        state: z.ZodLiteral<"idle">;
        alreadyStopped: z.ZodBoolean;
    }, z.core.$strict>, "required">;
    readonly "episodes.subtree": import("../contract.js").RpcContract<"episodes.subtree", z.ZodObject<{
        episodeId: z.ZodString;
        limit: z.ZodDefault<z.ZodInt>;
        cursor: z.ZodOptional<z.ZodString>;
        openOnly: z.ZodOptional<z.ZodBoolean>;
        directOnly: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strict>, z.ZodObject<{
        items: z.ZodArray<z.ZodObject<{
            episodeId: z.ZodString;
            parentEpisodeId: z.ZodString;
            rootEpisodeId: z.ZodString;
            title: z.ZodString;
            status: z.ZodEnum<{
                active: "active";
                completed: "completed";
                needs_input: "needs_input";
                idle: "idle";
            }>;
            depth: z.ZodInt;
        }, z.core.$strict>>;
        nextCursor: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>, "required">;
    readonly "episodes.summary.get": import("../contract.js").RpcContract<"episodes.summary.get", z.ZodObject<{
        episodeId: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        id: z.ZodString;
        episodeId: z.ZodString;
        objective: z.ZodNullable<z.ZodString>;
        currentState: z.ZodNullable<z.ZodString>;
        recentDecisions: z.ZodArray<z.ZodString>;
        entityRefs: z.ZodArray<z.ZodString>;
        tokenEstimate: z.ZodNumber;
        lastRefreshedAt: z.ZodString;
        createdAt: z.ZodString;
    }, z.core.$strict>, "required">;
    readonly "episodes.summary.refresh": import("../contract.js").RpcContract<"episodes.summary.refresh", z.ZodObject<{
        episodeId: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        id: z.ZodString;
        episodeId: z.ZodString;
        objective: z.ZodNullable<z.ZodString>;
        currentState: z.ZodNullable<z.ZodString>;
        recentDecisions: z.ZodArray<z.ZodString>;
        entityRefs: z.ZodArray<z.ZodString>;
        tokenEstimate: z.ZodNumber;
        lastRefreshedAt: z.ZodString;
        createdAt: z.ZodString;
    }, z.core.$strict>, "required">;
    readonly "episodes.todo.get": import("../contract.js").RpcContract<"episodes.todo.get", z.ZodObject<{
        episodeId: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        items: z.ZodArray<z.ZodObject<{
            content: z.ZodString;
            status: z.ZodEnum<{
                pending: "pending";
                completed: "completed";
                cancelled: "cancelled";
                in_progress: "in_progress";
            }>;
            externalId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        }, z.core.$strip>>;
    }, z.core.$strip>, "required">;
    readonly "episodes.todo.update": import("../contract.js").RpcContract<"episodes.todo.update", z.ZodObject<{
        episodeId: z.ZodString;
        items: z.ZodArray<z.ZodObject<{
            content: z.ZodString;
            status: z.ZodEnum<{
                pending: "pending";
                completed: "completed";
                cancelled: "cancelled";
                in_progress: "in_progress";
            }>;
            externalId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        }, z.core.$strip>>;
    }, z.core.$strip>, z.ZodObject<{
        items: z.ZodArray<z.ZodObject<{
            content: z.ZodString;
            status: z.ZodEnum<{
                pending: "pending";
                completed: "completed";
                cancelled: "cancelled";
                in_progress: "in_progress";
            }>;
            externalId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        }, z.core.$strip>>;
    }, z.core.$strip>, "required">;
    readonly "episodes.unarchive": import("../contract.js").RpcContract<"episodes.unarchive", z.ZodObject<{
        id: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        status: z.ZodString;
    }, z.core.$strict>, "required">;
    readonly "episodes.usage.query": import("../contract.js").RpcContract<"episodes.usage.query", z.ZodObject<{
        from: z.ZodISODateTime;
        to: z.ZodISODateTime;
    }, z.core.$strict>, z.ZodObject<{
        from: z.ZodString;
        to: z.ZodString;
        episodes: z.ZodArray<z.ZodObject<{
            episodeId: z.ZodString;
            episodeTitle: z.ZodNullable<z.ZodString>;
            totalTokens: z.ZodNumber;
            costMicros: z.ZodNumber;
        }, z.core.$strip>>;
    }, z.core.$strip>, "required">;
    readonly "episodes.wait.resolve": import("../contract.js").RpcContract<"episodes.wait.resolve", z.ZodUnion<readonly [z.ZodObject<{
        kind: z.ZodEnum<{
            tool_approval: "tool_approval";
            native_approval: "native_approval";
        }>;
        episodeId: z.ZodString;
        waitId: z.ZodString;
        resolutionId: z.ZodString;
        decision: z.ZodEnum<{
            approved: "approved";
            denied: "denied";
        }>;
        argumentsOverride: z.ZodExactOptional<z.ZodType<import("../../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../../core/json.js").JsonValue, unknown>>>;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"ask_user">;
        episodeId: z.ZodString;
        waitId: z.ZodString;
        resolutionId: z.ZodString;
        answer: z.ZodType<import("../../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../../core/json.js").JsonValue, unknown>>;
    }, z.core.$strict>]>, z.ZodObject<{
        episodeId: z.ZodString;
        waitId: z.ZodString;
        inputId: z.ZodString;
        state: z.ZodEnum<{
            active: "active";
            needs_input: "needs_input";
        }>;
    }, z.core.$strict>, "required">;
    readonly "episodes.episode.ask_user": {
        readonly method: "episodes.episode.ask_user";
        readonly input: z.ZodObject<{
            question: z.ZodString;
            answerSchema: z.ZodDefault<z.ZodType<import("../../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../../core/json.js").JsonValue, unknown>>>;
        }, z.core.$strict>;
        readonly output: z.ZodObject<{
            status: z.ZodLiteral<"question_sent">;
            awaitingResponse: z.ZodBoolean;
        }, z.core.$strip>;
        readonly params: "required";
        readonly inputJsonSchema: Readonly<import("../../core/json.js").JsonObject>;
        readonly wire?: import("../contract.js").RpcWireCodec;
    };
    readonly "episodes.episode.create": {
        readonly method: "episodes.episode.create";
        readonly input: z.ZodObject<{
            subagent: z.ZodString;
            title: z.ZodString;
            prompt: z.ZodString;
            model: z.ZodOptional<z.ZodString>;
            background: z.ZodOptional<z.ZodBoolean>;
            result: z.ZodOptional<z.ZodType<import("../../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../../core/json.js").JsonValue, unknown>>>;
        }, z.core.$strict>;
        readonly output: z.ZodObject<{
            childEpisodeId: z.ZodString;
            waitId: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>;
        readonly params: "required";
        readonly inputJsonSchema: Readonly<import("../../core/json.js").JsonObject>;
        readonly wire?: import("../contract.js").RpcWireCodec;
    };
    readonly "episodes.episode.get": {
        readonly method: "episodes.episode.get";
        readonly input: z.ZodObject<{
            episodeId: z.ZodString;
        }, z.core.$strict>;
        readonly output: z.ZodObject<{
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
                data: z.ZodOptional<z.ZodType<import("../../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../../core/json.js").JsonValue, unknown>>>;
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
                        pending: "pending";
                        completed: "completed";
                        cancelled: "cancelled";
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
                    request: z.ZodType<import("../../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../../core/json.js").JsonValue, unknown>>;
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
        readonly params: "required";
        readonly inputJsonSchema: Readonly<import("../../core/json.js").JsonObject>;
        readonly wire?: import("../contract.js").RpcWireCodec;
    };
    readonly "episodes.episode.link": {
        readonly method: "episodes.episode.link";
        readonly input: z.ZodObject<{
            episodeId: z.ZodString;
            entityId: z.ZodString;
            kind: z.ZodString;
        }, z.core.$strict>;
        readonly output: z.ZodObject<{
            status: z.ZodString;
        }, z.core.$strict>;
        readonly params: "required";
        readonly inputJsonSchema: Readonly<import("../../core/json.js").JsonObject>;
        readonly wire?: import("../contract.js").RpcWireCodec;
    };
    readonly "episodes.episode.report": {
        readonly method: "episodes.episode.report";
        readonly input: z.ZodObject<{
            summary: z.ZodString;
            result: z.ZodOptional<z.ZodType<import("../../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../../core/json.js").JsonValue, unknown>>>;
        }, z.core.$strict>;
        readonly output: z.ZodObject<{
            reported: z.ZodLiteral<true>;
        }, z.core.$strict>;
        readonly params: "required";
        readonly inputJsonSchema: Readonly<import("../../core/json.js").JsonObject>;
        readonly wire?: import("../contract.js").RpcWireCodec;
    };
    readonly "episodes.episode.search": {
        readonly method: "episodes.episode.search";
        readonly input: z.ZodObject<{
            query: z.ZodString;
            status: z.ZodOptional<z.ZodString>;
            archived: z.ZodDefault<z.ZodNullable<z.ZodBoolean>>;
            limit: z.ZodDefault<z.ZodNumber>;
        }, z.core.$strict>;
        readonly output: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            title: z.ZodString;
            status: z.ZodString;
            isArchived: z.ZodBoolean;
            objective: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>;
        readonly params: "required";
        readonly inputJsonSchema: Readonly<import("../../core/json.js").JsonObject>;
        readonly wire?: import("../contract.js").RpcWireCodec;
    };
    readonly "episodes.episode.list": import("../contract.js").RpcContract<"episodes.episode.list", z.ZodUnion<readonly [z.ZodObject<{
        includeChildren: z.ZodOptional<z.ZodBoolean>;
        search: z.ZodOptional<z.ZodString>;
        status: z.ZodOptional<z.ZodString>;
        archived: z.ZodDefault<z.ZodNullable<z.ZodBoolean>>;
        limit: z.ZodDefault<z.ZodNumber>;
        offset: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strict>, z.ZodObject<{
        limit: z.ZodDefault<z.ZodInt>;
        offset: z.ZodDefault<z.ZodInt>;
        entityId: z.ZodString;
        statuses: z.ZodOptional<z.ZodArray<z.ZodString>>;
        archived: z.ZodDefault<z.ZodNullable<z.ZodBoolean>>;
    }, z.core.$strict>]>, z.ZodUnion<readonly [z.ZodObject<{
        items: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            title: z.ZodString;
            rootEpisodeId: z.ZodString;
            parentEpisodeId: z.ZodNullable<z.ZodString>;
            rootTitle: z.ZodString;
            openDelegations: z.ZodInt;
            status: z.ZodUnion<[z.ZodEnum<{
                active: "active";
                completed: "completed";
                needs_input: "needs_input";
                idle: "idle";
            }>, z.ZodString]>;
            isArchived: z.ZodBoolean;
            messageCount: z.ZodInt;
            createdAt: z.ZodString;
            date: z.ZodString;
            updatedAt: z.ZodString;
            lastMessageAt: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        total: z.ZodNumber;
        limit: z.ZodNumber;
        offset: z.ZodNumber;
    }, z.core.$strip>, z.ZodArray<z.ZodObject<{
        episodeId: z.ZodString;
        title: z.ZodString;
        status: z.ZodString;
        isArchived: z.ZodBoolean;
        linkKinds: z.ZodArray<z.ZodString>;
        updatedAt: z.ZodString;
        isEmpty: z.ZodBoolean;
    }, z.core.$strip>>]>, "required">;
    readonly "episodes.episode.update": import("../contract.js").RpcContract<"episodes.episode.update", z.ZodObject<{
        id: z.ZodString;
        title: z.ZodOptional<z.ZodString>;
        status: z.ZodOptional<z.ZodEnum<{
            active: "active";
            completed: "completed";
            needs_input: "needs_input";
            idle: "idle";
        }>>;
        archived: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>, z.ZodObject<{
        status: z.ZodString;
    }, z.core.$strict>, "required">;
    readonly "episodes.workspace.todo.list": import("../contract.js").RpcContract<"episodes.workspace.todo.list", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
        items: z.ZodArray<z.ZodObject<{
            content: z.ZodString;
            status: z.ZodEnum<{
                pending: "pending";
                completed: "completed";
                cancelled: "cancelled";
                in_progress: "in_progress";
            }>;
            externalId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            id: z.ZodUUID;
        }, z.core.$strip>>;
    }, z.core.$strip>, "required">;
    readonly "episodes.workspace.todo.add": import("../contract.js").RpcContract<"episodes.workspace.todo.add", z.ZodObject<{
        content: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        items: z.ZodArray<z.ZodObject<{
            content: z.ZodString;
            status: z.ZodEnum<{
                pending: "pending";
                completed: "completed";
                cancelled: "cancelled";
                in_progress: "in_progress";
            }>;
            externalId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            id: z.ZodUUID;
        }, z.core.$strip>>;
    }, z.core.$strip>, "required">;
    readonly "episodes.workspace.todo.rm": import("../contract.js").RpcContract<"episodes.workspace.todo.rm", z.ZodObject<{
        id: z.ZodUUID;
    }, z.core.$strip>, z.ZodObject<{
        items: z.ZodArray<z.ZodObject<{
            content: z.ZodString;
            status: z.ZodEnum<{
                pending: "pending";
                completed: "completed";
                cancelled: "cancelled";
                in_progress: "in_progress";
            }>;
            externalId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            id: z.ZodUUID;
        }, z.core.$strip>>;
    }, z.core.$strip>, "required">;
    readonly "episodes.workspace.todo.update": import("../contract.js").RpcContract<"episodes.workspace.todo.update", z.ZodObject<{
        id: z.ZodUUID;
        content: z.ZodOptional<z.ZodString>;
        status: z.ZodOptional<z.ZodEnum<{
            pending: "pending";
            completed: "completed";
            cancelled: "cancelled";
            in_progress: "in_progress";
        }>>;
    }, z.core.$strip>, z.ZodObject<{
        items: z.ZodArray<z.ZodObject<{
            content: z.ZodString;
            status: z.ZodEnum<{
                pending: "pending";
                completed: "completed";
                cancelled: "cancelled";
                in_progress: "in_progress";
            }>;
            externalId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            id: z.ZodUUID;
        }, z.core.$strip>>;
    }, z.core.$strip>, "required">;
    readonly "episodes.workspace.memory.get": import("../contract.js").RpcContract<"episodes.workspace.memory.get", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
        body: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>, "required">;
    readonly "episodes.workspace.memory.save": import("../contract.js").RpcContract<"episodes.workspace.memory.save", z.ZodObject<{
        body: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        body: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>, "required">;
};
//# sourceMappingURL=episodes.d.ts.map