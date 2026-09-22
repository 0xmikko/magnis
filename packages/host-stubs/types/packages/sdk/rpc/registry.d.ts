import { z } from "zod";
import { type RpcContract } from "./contract.js";
/**
 * The checked-in native method surface.  The individual capability files own
 * precise schemas as they are adopted; this map is deliberately assembled in
 * one place so a method cannot be silently absent from the public package.
 *
 * Every method receives a named, closed input and output descriptor here.
 * Capability-owned envelopes use Core schemas; deliberately open capability
 * payloads retain a bounded JsonValue field without weakening the method
 * boundary itself.
 */
declare const nativeMethodNames: readonly ["agent.implementations", "agent.limits.get", "agent.models.list", "ai_models.catalog", "ai_models.catalog_models", "ai_models.get_defaults", "ai_models.list_models", "ai_models.list_providers", "ai_models.subscription_status", "allowlist.add", "allowlist.delete", "allowlist.get", "allowlist.list", "allowlist.update_access", "billing.ledger.query", "billing.limits.get", "eval.capabilities", "eval.fixture.invoke", "episodes.append_message", "episodes.archive", "episodes.ask_user", "episodes.capabilities", "episodes.complete", "episodes.create", "episodes.get", "episodes.link_entity", "episodes.list", "episodes.list_for_entity", "episodes.model.set", "episodes.search", "episodes.set_status", "episodes.set_title", "episodes.stop", "episodes.subtree", "episodes.summary.get", "episodes.summary.refresh", "episodes.todo.get", "episodes.todo.update", "episodes.unarchive", "episodes.usage.query", "episodes.wait.resolve", "extensions.get", "extensions.list", "file.upload", "graph.approve", "graph.capabilities", "graph.entity.archive", "graph.entity.get", "graph.entity.links", "graph.entity.pin", "graph.entity.unarchive", "graph.entity.unpin", "graph.entity.update_properties", "graph.find", "graph.get", "graph.link.add", "graph.links", "graph.search", "graph.withdraw", "groups.add_member", "groups.capabilities", "groups.create", "groups.delete", "groups.get", "groups.list", "groups.list_for_entity", "groups.list_members", "groups.remove_member", "groups.resolve_identity", "groups.update", "groups.update_bio", "groups.update_memory", "hooks.create", "hooks.delete", "hooks.list", "hooks.update", "identity.create", "identity.delete", "identity.list", "identity.update", "memory.capabilities", "memory.confirm", "memory.diagnostics", "memory.forget", "memory.list", "memory.reject", "memory.save", "memory.search", "module_settings.list", "runtime.composer.setPresence", "search.by_graph", "search.capabilities", "search.combined", "search.fast", "search.hybrid", "search.indexing_status", "search.model_status", "setup.get", "setup.update", "skills.capabilities", "skills.list", "skills.list_files", "skills.read", "source.accounts.disconnect", "source.accounts.provision", "source.auth.exec", "source.auth.oauth.complete", "source.auth.session.cancel", "source.auth.session.open", "source.auth.submit", "source.keys.list", "source.keys.set", "source.list", "source.status.list", "source.sync.bootstrap", "subagents.create", "subagents.delete", "subagents.list", "subagents.update", "subagents.roster", "episodes.delegate", "episodes.report", "triggers.capabilities", "triggers.fire_history", "triggers.fire_now", "triggers.invalidate_cache", "triggers.resolve_watchable", "triggers.validate_schedule", "triggers.validate_watch", "user_events.track", "web.capabilities", "web.link.get", "web.link.open", "web.search"];
export type NativeRpcMethod = (typeof nativeMethodNames)[number];
declare const nativeInputSchemas: {
    "agent.implementations": z.ZodObject<{}, z.core.$strip>;
    "agent.limits.get": z.ZodObject<{}, z.core.$strip>;
    "agent.models.list": z.ZodObject<{
        implementationId: z.ZodString;
    }, z.core.$strip>;
    "billing.ledger.query": z.ZodObject<{
        from: z.ZodOptional<z.ZodString>;
        to: z.ZodOptional<z.ZodString>;
        limit: z.ZodOptional<z.ZodNumber>;
        offset: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>;
    "billing.limits.get": z.ZodObject<{}, z.core.$strip>;
    "episodes.complete": z.ZodObject<{
        id: z.ZodString;
    }, z.core.$strip>;
    "episodes.get": z.ZodObject<{
        episodeId: z.ZodString;
    }, z.core.$strip>;
    "episodes.list_for_entity": z.ZodObject<{
        limit: z.ZodDefault<z.ZodInt>;
        offset: z.ZodDefault<z.ZodInt>;
        entityId: z.ZodString;
        statuses: z.ZodOptional<z.ZodArray<z.ZodString>>;
        archived: z.ZodDefault<z.ZodNullable<z.ZodBoolean>>;
    }, z.core.$strip>;
    "episodes.link_entity": z.ZodObject<{
        episodeId: z.ZodString;
        entityId: z.ZodString;
        kind: z.ZodString;
    }, z.core.$strip>;
    "episodes.usage.query": z.ZodObject<{
        from: z.ZodISODateTime;
        to: z.ZodISODateTime;
    }, z.core.$strict>;
    "file.upload": z.ZodObject<{
        name: z.ZodString;
        localPath: z.ZodString;
        mimeType: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    "graph.entity.get": z.ZodObject<{
        id: z.ZodString;
    }, z.core.$strip>;
    "graph.find": z.ZodObject<{
        type: z.ZodString;
        chatId: z.ZodOptional<z.ZodString>;
        name: z.ZodOptional<z.ZodString>;
        after: z.ZodOptional<z.ZodString>;
        before: z.ZodOptional<z.ZodString>;
        limit: z.ZodOptional<z.ZodNumber>;
        offset: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>;
    "graph.get": z.ZodObject<{
        id: z.ZodString;
    }, z.core.$strip>;
    "graph.links": z.ZodObject<{
        id: z.ZodString;
        kind: z.ZodString;
        direction: z.ZodOptional<z.ZodEnum<{
            in: "in";
            out: "out";
        }>>;
        childType: z.ZodOptional<z.ZodString>;
        after: z.ZodOptional<z.ZodString>;
        before: z.ZodOptional<z.ZodString>;
        limit: z.ZodOptional<z.ZodNumber>;
        offset: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>;
    "graph.search": z.ZodObject<{
        query: z.ZodString;
        type: z.ZodOptional<z.ZodString>;
        after: z.ZodOptional<z.ZodString>;
        before: z.ZodOptional<z.ZodString>;
        limit: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>;
    "groups.delete": z.ZodObject<{
        id: z.ZodString;
    }, z.core.$strip>;
    "groups.list": z.ZodObject<{
        search: z.ZodOptional<z.ZodString>;
        limit: z.ZodDefault<z.ZodNumber>;
        offset: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>;
    "groups.list_for_entity": z.ZodObject<{
        entityId: z.ZodString;
    }, z.core.$strip>;
    "groups.list_members": z.ZodObject<{
        id: z.ZodString;
    }, z.core.$strip>;
    "groups.resolve_identity": z.ZodObject<{
        entityId: z.ZodString;
    }, z.core.$strip>;
    "groups.update_bio": z.ZodObject<{
        groupId: z.ZodString;
        content: z.ZodString;
    }, z.core.$strip>;
    "identity.delete": z.ZodObject<{
        id: z.ZodString;
    }, z.core.$strip>;
    "source.accounts.disconnect": z.ZodObject<{
        sourceId: z.ZodString;
        accountId: z.ZodString;
    }, z.core.$strip>;
    "source.accounts.provision": z.ZodObject<{
        sourceId: z.ZodString;
        intent: z.ZodDefault<z.ZodEnum<{
            repair: "repair";
            add: "add";
        }>>;
        connectionId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    "source.keys.set": z.ZodObject<{
        sourceId: z.ZodString;
        key: z.ZodString;
        value: z.ZodString;
        accountId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    "source.sync.bootstrap": z.ZodObject<{
        sourceId: z.ZodString;
        surface: z.ZodString;
        params: z.ZodType<import("../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonValue, unknown>>;
    }, z.core.$strip>;
    "subagents.delete": z.ZodObject<{
        id: z.ZodString;
    }, z.core.$strip>;
    "web.link.get": z.ZodObject<{
        id: z.ZodString;
    }, z.core.$strip>;
    "web.link.open": z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        url: z.ZodOptional<z.ZodString>;
        forceRefresh: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>;
    "web.search": z.ZodObject<{
        query: z.ZodString;
        limit: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>;
    "ai_models.catalog": z.ZodObject<{
        providerId: z.ZodString;
    }, z.core.$strip>;
    "ai_models.catalog_models": z.ZodObject<{
        search: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    "ai_models.get_defaults": z.ZodObject<{}, z.core.$strip>;
    "ai_models.list_models": z.ZodObject<{
        capability: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    "ai_models.list_providers": z.ZodObject<{}, z.core.$strip>;
    "ai_models.subscription_status": z.ZodObject<{}, z.core.$strip>;
    "allowlist.add": z.ZodObject<{
        action: z.ZodString;
        targetType: z.ZodString;
        targetId: z.ZodString;
        targetLabel: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        episodeId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, z.core.$strip>;
    "allowlist.delete": z.ZodObject<{
        id: z.ZodString;
    }, z.core.$strip>;
    "allowlist.get": z.ZodObject<{
        id: z.ZodString;
    }, z.core.$strip>;
    "allowlist.list": z.ZodObject<{}, z.core.$strip>;
    "allowlist.update_access": z.ZodObject<{
        id: z.ZodString;
        accessLevel: z.ZodString;
        groupIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
        hookIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>;
    "episodes.append_message": z.ZodObject<{
        episodeId: z.ZodString;
        requestId: z.ZodString;
        messageId: z.ZodString;
        content: z.ZodString;
        attachmentIds: z.ZodArray<z.ZodString>;
    }, z.core.$strict>;
    "episodes.archive": z.ZodObject<{
        id: z.ZodString;
    }, z.core.$strip>;
    "episodes.create": z.ZodObject<{
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
    "episodes.delegate": z.ZodObject<{
        subagent: z.ZodString;
        title: z.ZodString;
        prompt: z.ZodString;
        model: z.ZodOptional<z.ZodString>;
        background: z.ZodOptional<z.ZodBoolean>;
        result: z.ZodOptional<z.ZodType<import("../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonValue, unknown>>>;
    }, z.core.$strict>;
    "episodes.report": z.ZodObject<{
        summary: z.ZodString;
        result: z.ZodOptional<z.ZodType<import("../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonValue, unknown>>>;
    }, z.core.$strict>;
    "subagents.roster": z.ZodObject<{}, z.core.$strict>;
    "episodes.ask_user": z.ZodObject<{
        question: z.ZodString;
        answerSchema: z.ZodDefault<z.ZodType<import("../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonValue, unknown>>>;
    }, z.core.$strip>;
    "episodes.subtree": z.ZodObject<{
        episodeId: z.ZodString;
        limit: z.ZodDefault<z.ZodInt>;
        cursor: z.ZodOptional<z.ZodString>;
        openOnly: z.ZodOptional<z.ZodBoolean>;
        directOnly: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strict>;
    "episodes.list": z.ZodObject<{
        includeChildren: z.ZodOptional<z.ZodBoolean>;
        search: z.ZodOptional<z.ZodString>;
        status: z.ZodOptional<z.ZodString>;
        archived: z.ZodDefault<z.ZodNullable<z.ZodBoolean>>;
        limit: z.ZodDefault<z.ZodNumber>;
        offset: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>;
    "episodes.model.set": z.ZodObject<{
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
    "episodes.search": z.ZodObject<{
        query: z.ZodString;
        status: z.ZodOptional<z.ZodString>;
        archived: z.ZodDefault<z.ZodNullable<z.ZodBoolean>>;
        limit: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>;
    "episodes.set_title": z.ZodObject<{
        episodeId: z.ZodString;
        title: z.ZodString;
    }, z.core.$strip>;
    "episodes.set_status": z.ZodObject<{
        id: z.ZodString;
        status: z.ZodEnum<{
            completed: "completed";
            active: "active";
            needs_input: "needs_input";
            idle: "idle";
        }>;
    }, z.core.$strip>;
    "episodes.stop": z.ZodObject<{
        episodeId: z.ZodString;
        requestId: z.ZodString;
    }, z.core.$strict>;
    "episodes.summary.get": z.ZodObject<{
        episodeId: z.ZodString;
    }, z.core.$strip>;
    "episodes.summary.refresh": z.ZodObject<{
        episodeId: z.ZodString;
    }, z.core.$strip>;
    "episodes.todo.get": z.ZodObject<{
        episodeId: z.ZodString;
    }, z.core.$strip>;
    "episodes.todo.update": z.ZodObject<{
        episodeId: z.ZodString;
        items: z.ZodArray<z.ZodObject<{
            content: z.ZodString;
            status: z.ZodEnum<{
                completed: "completed";
                cancelled: "cancelled";
                pending: "pending";
                in_progress: "in_progress";
            }>;
            externalId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    "episodes.unarchive": z.ZodObject<{
        id: z.ZodString;
    }, z.core.$strip>;
    "episodes.wait.resolve": z.ZodObject<{
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
        answer: z.ZodOptional<z.ZodType<import("../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonValue, unknown>>>;
        argumentsOverride: z.ZodOptional<z.ZodType<import("../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonValue, unknown>>>;
    }, z.core.$strict>;
    "extensions.get": z.ZodObject<{
        key: z.ZodString;
    }, z.core.$strip>;
    "extensions.list": z.ZodObject<{
        kind: z.ZodOptional<z.ZodEnum<{
            source: "source";
            module: "module";
            skill: "skill";
        }>>;
        enabled: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>;
    "graph.entity.archive": z.ZodObject<{
        entityId: z.ZodString;
    }, z.core.$strip>;
    "graph.entity.pin": z.ZodObject<{
        entityId: z.ZodString;
        pinOrder: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>;
    "graph.entity.unarchive": z.ZodObject<{
        entityId: z.ZodString;
    }, z.core.$strip>;
    "graph.entity.unpin": z.ZodObject<{
        entityId: z.ZodString;
    }, z.core.$strip>;
    "graph.entity.update_properties": z.ZodObject<{
        entityId: z.ZodString;
        properties: z.ZodType<import("../core/json.js").JsonObject, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonObject, unknown>>;
    }, z.core.$strip>;
    "graph.link.add": z.ZodObject<{
        confidence: z.ZodNumber;
        evidence: z.ZodTuple<[z.ZodString], z.ZodString>;
        validFrom: z.ZodNullable<z.ZodISODateTime>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
        from: z.ZodString;
        to: z.ZodString;
        kind: z.ZodString;
    }, z.core.$strip>;
    "graph.approve": z.ZodObject<{
        id: z.ZodString;
        episodeId: z.ZodString;
    }, z.core.$strip>;
    "graph.withdraw": z.ZodObject<{
        evidenceIds: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
    "groups.add_member": z.ZodObject<{
        groupId: z.ZodString;
        entityId: z.ZodString;
    }, z.core.$strip>;
    "groups.create": z.ZodObject<{
        name: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        memory: z.ZodOptional<z.ZodString>;
        clientId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    "groups.remove_member": z.ZodObject<{
        groupId: z.ZodString;
        entityId: z.ZodString;
    }, z.core.$strip>;
    "groups.update": z.ZodObject<{
        id: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        memory: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    "groups.update_memory": z.ZodObject<{
        groupId: z.ZodString;
        memory: z.ZodString;
    }, z.core.$strip>;
    "hooks.create": z.ZodObject<{
        name: z.ZodString;
        triggerAction: z.ZodString;
        triggerScope: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        reviewAgentId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        onWarning: z.ZodOptional<z.ZodString>;
        groupIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>;
    "hooks.delete": z.ZodObject<{
        id: z.ZodString;
    }, z.core.$strip>;
    "hooks.list": z.ZodObject<{}, z.core.$strip>;
    "hooks.update": z.ZodObject<{
        id: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
        triggerAction: z.ZodOptional<z.ZodString>;
        triggerScope: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        reviewAgentId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        onWarning: z.ZodOptional<z.ZodString>;
        groupIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
        enabled: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>;
    "identity.create": z.ZodObject<{
        name: z.ZodString;
        content: z.ZodOptional<z.ZodString>;
        isDefault: z.ZodDefault<z.ZodBoolean>;
        groupIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>;
    "identity.list": z.ZodObject<{}, z.core.$strip>;
    "identity.update": z.ZodObject<{
        id: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
        content: z.ZodOptional<z.ZodString>;
        isDefault: z.ZodOptional<z.ZodBoolean>;
        groupIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>;
    "memory.save": z.ZodObject<{
        memoryType: z.ZodEnum<{
            user: "user";
            feedback: "feedback";
            project: "project";
            reference: "reference";
        }>;
        title: z.ZodString;
        body: z.ZodString;
        subjectEntityId: z.ZodOptional<z.ZodString>;
        projectEntityId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    "memory.forget": z.ZodObject<{
        id: z.ZodString;
    }, z.core.$strip>;
    "memory.search": z.ZodObject<{
        query: z.ZodString;
        memoryType: z.ZodOptional<z.ZodEnum<{
            user: "user";
            feedback: "feedback";
            project: "project";
            reference: "reference";
        }>>;
        limit: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>;
    "memory.confirm": z.ZodObject<{
        id: z.ZodString;
    }, z.core.$strip>;
    "memory.reject": z.ZodObject<{
        id: z.ZodString;
    }, z.core.$strip>;
    "memory.diagnostics": z.ZodObject<{}, z.core.$strip>;
    "memory.capabilities": z.ZodObject<{}, z.core.$strip>;
    "memory.list": z.ZodObject<{
        memoryType: z.ZodOptional<z.ZodEnum<{
            user: "user";
            feedback: "feedback";
            project: "project";
            reference: "reference";
        }>>;
        subjectEntityId: z.ZodOptional<z.ZodString>;
        projectEntityId: z.ZodOptional<z.ZodString>;
        sourceEpisodeId: z.ZodOptional<z.ZodString>;
        limit: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>;
    "module_settings.list": z.ZodObject<{
        moduleId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    "runtime.composer.setPresence": z.ZodObject<{
        presence: z.ZodUnion<readonly [z.ZodObject<{
            mode: z.ZodString;
            threadKey: z.ZodString;
        }, z.core.$strip>, z.ZodNull]>;
    }, z.core.$strip>;
    "triggers.resolve_watchable": z.ZodObject<{
        entityId: z.ZodString;
    }, z.core.$strip>;
    "triggers.fire_now": z.ZodObject<{
        triggerId: z.ZodString;
        eventEntityId: z.ZodDefault<z.ZodString>;
        context: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodType<import("../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonValue, unknown>>>>;
    }, z.core.$strip>;
    "triggers.validate_watch": z.ZodObject<{
        watchEntityIds: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
    "triggers.validate_schedule": z.ZodObject<{
        cron: z.ZodString;
        timezone: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    }, z.core.$strip>;
    "triggers.invalidate_cache": z.ZodObject<{}, z.core.$strip>;
    "triggers.fire_history": z.ZodObject<{
        triggerId: z.ZodString;
        limit: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>;
    "search.fast": z.ZodObject<{
        query: z.ZodString;
        mentionIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
        schemaIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
        retrieval: z.ZodDefault<z.ZodEnum<{
            text: "text";
            hybrid: "hybrid";
        }>>;
        limit: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>;
    "search.by_graph": z.ZodObject<{
        entityId: z.ZodString;
        depth: z.ZodDefault<z.ZodNumber>;
        linkKind: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    "search.capabilities": z.ZodObject<{}, z.core.$strip>;
    "search.combined": z.ZodObject<{
        query: z.ZodString;
        relatedTo: z.ZodDefault<z.ZodArray<z.ZodString>>;
        schemaIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
        limit: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>;
    "search.hybrid": z.ZodObject<{
        query: z.ZodString;
        limit: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>;
    "search.indexing_status": z.ZodObject<{}, z.core.$strip>;
    "search.model_status": z.ZodObject<{}, z.core.$strip>;
    "source.auth.exec": z.ZodObject<{
        sourceId: z.ZodString;
        sessionId: z.ZodString;
        op: z.ZodString;
        args: z.ZodOptional<z.ZodType<import("../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonValue, unknown>>>;
    }, z.core.$strip>;
    "source.auth.oauth.complete": z.ZodObject<{
        sourceId: z.ZodString;
        code: z.ZodString;
        state: z.ZodString;
    }, z.core.$strip>;
    "source.auth.session.open": z.ZodObject<{
        sourceId: z.ZodString;
        intent: z.ZodEnum<{
            repair: "repair";
            add: "add";
        }>;
        presentation: z.ZodEnum<{
            web: "web";
            cli: "cli";
        }>;
        connectionId: z.ZodOptional<z.ZodString>;
        repairAction: z.ZodOptional<z.ZodString>;
        redirectUri: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    "source.auth.submit": z.ZodObject<{
        sourceId: z.ZodString;
        sessionId: z.ZodString;
        step: z.ZodString;
        value: z.ZodString;
    }, z.core.$strip>;
    "source.auth.session.cancel": z.ZodObject<{
        sourceId: z.ZodString;
        sessionId: z.ZodString;
    }, z.core.$strip>;
    "source.keys.list": z.ZodObject<{
        accountId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    "subagents.create": z.ZodObject<{
        name: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        systemPrompt: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    "subagents.list": z.ZodObject<{}, z.core.$strip>;
    "subagents.update": z.ZodObject<{
        id: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        systemPrompt: z.ZodOptional<z.ZodString>;
        status: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    "user_events.track": z.ZodObject<{
        eventName: z.ZodString;
        source: z.ZodString;
        properties: z.ZodOptional<z.ZodType<import("../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonValue, unknown>>>;
    }, z.core.$strip>;
    "graph.entity.links": z.ZodObject<{
        id: z.ZodString;
        kind: z.ZodOptional<z.ZodString>;
        direction: z.ZodDefault<z.ZodEnum<{
            from: "from";
            to: "to";
            both: "both";
        }>>;
    }, z.core.$strip>;
    "groups.get": z.ZodObject<{
        id: z.ZodString;
    }, z.core.$strip>;
    "episodes.capabilities": z.ZodObject<{}, z.core.$strip>;
    "graph.capabilities": z.ZodObject<{}, z.core.$strip>;
    "groups.capabilities": z.ZodObject<{}, z.core.$strip>;
    "setup.get": z.ZodObject<{}, z.core.$strip>;
    "setup.update": z.ZodObject<{
        step: z.ZodDiscriminatedUnion<[z.ZodObject<{
            kind: z.ZodLiteral<"welcome">;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"accounts">;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"connect">;
            source: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"agent">;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"syncing">;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"done">;
        }, z.core.$strict>], "kind">;
        outcome: z.ZodDiscriminatedUnion<[z.ZodObject<{
            state: z.ZodLiteral<"answered">;
        }, z.core.$strict>, z.ZodObject<{
            state: z.ZodLiteral<"skipped">;
        }, z.core.$strict>, z.ZodObject<{
            state: z.ZodLiteral<"refused">;
            reason: z.ZodString;
        }, z.core.$strict>], "state">;
        session: z.ZodNullable<z.ZodString>;
        document: z.ZodNullable<z.ZodObject<{
            version: z.ZodNumber;
            completed: z.ZodBoolean;
            currentStep: z.ZodString;
            sources: z.ZodArray<z.ZodString>;
            engine: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strict>;
    "skills.capabilities": z.ZodObject<{}, z.core.$strip>;
    "skills.list": z.ZodObject<{}, z.core.$strip>;
    "skills.list_files": z.ZodObject<{
        id: z.ZodString;
    }, z.core.$strip>;
    "skills.read": z.ZodObject<{
        id: z.ZodString;
        path: z.ZodDefault<z.ZodString>;
    }, z.core.$strip>;
    "source.list": z.ZodObject<{}, z.core.$strip>;
    "source.status.list": z.ZodObject<{}, z.core.$strip>;
    "triggers.capabilities": z.ZodObject<{}, z.core.$strip>;
    "web.capabilities": z.ZodObject<{}, z.core.$strip>;
    "eval.capabilities": z.ZodObject<{}, z.core.$strip>;
    "eval.fixture.invoke": z.ZodObject<{
        actionId: z.ZodString;
        idempotencyKey: z.ZodString;
    }, z.core.$strip>;
};
declare const nativeOutputSchemas: {
    "agent.implementations": z.ZodObject<{
        readonly implementations: z.ZodArray<z.ZodObject<{
            id: z.ZodEnum<{
                magnis: "magnis";
                codex: "codex";
                claude: "claude";
            }>;
            displayName: z.ZodString;
            nativeSession: z.ZodBoolean;
            usesLlmRuntime: z.ZodBoolean;
            available: z.ZodOptional<z.ZodBoolean>;
            unavailableReason: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        }, z.core.$strip>>;
        readonly defaultImplementationId: z.ZodEnum<{
            magnis: "magnis";
            codex: "codex";
            claude: "claude";
        }>;
    }, z.core.$strip>;
    "agent.limits.get": z.ZodObject<{
        readonly maxSteps: z.ZodNumber;
    }, z.core.$strip>;
    "agent.models.list": z.ZodObject<{
        readonly implementationId: z.ZodString;
        readonly models: z.ZodArray<z.ZodObject<{
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
        }, z.core.$strict>>;
        readonly available: z.ZodOptional<z.ZodBoolean>;
        readonly unavailableReason: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, z.core.$strip>;
    "allowlist.add": z.ZodObject<{
        id: z.ZodString;
        action: z.ZodString;
        targetType: z.ZodString;
        targetId: z.ZodString;
        targetLabel: z.ZodOptional<z.ZodString>;
        accessLevel: z.ZodString;
        groupIds: z.ZodArray<z.ZodString>;
        hookIds: z.ZodArray<z.ZodString>;
        episodeId: z.ZodNullable<z.ZodString>;
        createdAt: z.ZodString;
    }, z.core.$strip>;
    "allowlist.get": z.ZodObject<{
        id: z.ZodString;
        action: z.ZodString;
        targetType: z.ZodString;
        targetId: z.ZodString;
        targetLabel: z.ZodOptional<z.ZodString>;
        accessLevel: z.ZodString;
        groupIds: z.ZodArray<z.ZodString>;
        hookIds: z.ZodArray<z.ZodString>;
        episodeId: z.ZodNullable<z.ZodString>;
        createdAt: z.ZodString;
    }, z.core.$strip>;
    "allowlist.list": z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        action: z.ZodString;
        targetType: z.ZodString;
        targetId: z.ZodString;
        targetLabel: z.ZodOptional<z.ZodString>;
        accessLevel: z.ZodString;
        groupIds: z.ZodArray<z.ZodString>;
        hookIds: z.ZodArray<z.ZodString>;
        episodeId: z.ZodNullable<z.ZodString>;
        createdAt: z.ZodString;
    }, z.core.$strip>>;
    "allowlist.update_access": z.ZodObject<{
        id: z.ZodString;
        action: z.ZodString;
        targetType: z.ZodString;
        targetId: z.ZodString;
        targetLabel: z.ZodOptional<z.ZodString>;
        accessLevel: z.ZodString;
        groupIds: z.ZodArray<z.ZodString>;
        hookIds: z.ZodArray<z.ZodString>;
        episodeId: z.ZodNullable<z.ZodString>;
        createdAt: z.ZodString;
    }, z.core.$strip>;
    "ai_models.list_providers": z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        baseUrl: z.ZodNullable<z.ZodString>;
        enabled: z.ZodBoolean;
        authKind: z.ZodString;
        reserved: z.ZodBoolean;
        apiKeySet: z.ZodBoolean;
        createdAt: z.ZodString;
        updatedAt: z.ZodString;
    }, z.core.$strip>>;
    "ai_models.list_models": z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        providerId: z.ZodString;
        modelId: z.ZodString;
        name: z.ZodString;
        capability: z.ZodString;
        enabled: z.ZodBoolean;
        configJson: z.ZodNullable<z.ZodString>;
        createdAt: z.ZodString;
    }, z.core.$strip>>;
    "ai_models.get_defaults": z.ZodArray<z.ZodObject<{
        capability: z.ZodString;
        modelId: z.ZodString;
        updatedAt: z.ZodString;
    }, z.core.$strip>>;
    "ai_models.catalog": z.ZodArray<z.ZodObject<{
        modelId: z.ZodString;
        name: z.ZodString;
        promptUsdPerToken: z.ZodNullable<z.ZodString>;
        completionUsdPerToken: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
    "ai_models.catalog_models": z.ZodObject<{
        source: z.ZodEnum<{
            bundled: "bundled";
            refreshed: "refreshed";
        }>;
        version: z.ZodString;
        providers: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            family: z.ZodString;
            api: z.ZodNullable<z.ZodString>;
            logoUrl: z.ZodString;
        }, z.core.$strip>>;
        models: z.ZodArray<z.ZodObject<{
            providerId: z.ZodString;
            modelId: z.ZodString;
            name: z.ZodString;
            family: z.ZodString;
            costInputUsdMtok: z.ZodNullable<z.ZodString>;
            costOutputUsdMtok: z.ZodNullable<z.ZodString>;
            costCacheReadUsdMtok: z.ZodNullable<z.ZodString>;
            costCacheWriteUsdMtok: z.ZodNullable<z.ZodString>;
            contextLimit: z.ZodNullable<z.ZodNumber>;
            reasoning: z.ZodBoolean;
            logoUrl: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    "ai_models.subscription_status": z.ZodObject<{
        readonly connected: z.ZodBoolean;
        readonly accountId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, z.core.$strip>;
    "episodes.usage.query": z.ZodObject<{
        from: z.ZodString;
        to: z.ZodString;
        episodes: z.ZodArray<z.ZodObject<{
            episodeId: z.ZodString;
            episodeTitle: z.ZodNullable<z.ZodString>;
            totalTokens: z.ZodNumber;
            costMicros: z.ZodNumber;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    "billing.limits.get": z.ZodObject<{
        readonly userId: z.ZodString;
        readonly creditLimitMicros: z.ZodNullable<z.ZodNumber>;
        readonly spentMicros: z.ZodNumber;
        readonly reservedMicros: z.ZodNumber;
        readonly availableMicros: z.ZodNullable<z.ZodNumber>;
        readonly entitled: z.ZodBoolean;
    }, z.core.$strip>;
    "billing.ledger.query": z.ZodObject<{
        readonly rows: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            turnId: z.ZodNullable<z.ZodString>;
            origin: z.ZodString;
            provider: z.ZodString;
            model: z.ZodString;
            startedAt: z.ZodString;
            finishedAt: z.ZodNullable<z.ZodString>;
            inputTokens: z.ZodNumber;
            outputTokens: z.ZodNumber;
            cacheReadTokens: z.ZodNumber;
            cacheWriteTokens: z.ZodNumber;
            reasoningTokens: z.ZodNumber;
            costMicros: z.ZodNullable<z.ZodNumber>;
            status: z.ZodString;
            error: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>;
        readonly from: z.ZodString;
        readonly to: z.ZodString;
        readonly limit: z.ZodNumber;
        readonly offset: z.ZodNumber;
    }, z.core.$strip>;
    "allowlist.delete": z.ZodObject<{
        status: z.ZodString;
    }, z.core.$strip>;
    "episodes.create": z.ZodObject<{
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
    "episodes.delegate": z.ZodObject<{
        childEpisodeId: z.ZodString;
        waitId: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    "episodes.report": z.ZodObject<{
        reported: z.ZodLiteral<true>;
    }, z.core.$strict>;
    "subagents.roster": z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        description: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>>;
    "episodes.capabilities": z.ZodRecord<z.ZodString, z.ZodType<import("../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonValue, unknown>>>;
    "episodes.summary.get": z.ZodObject<{
        id: z.ZodString;
        episodeId: z.ZodString;
        objective: z.ZodNullable<z.ZodString>;
        currentState: z.ZodNullable<z.ZodString>;
        recentDecisions: z.ZodArray<z.ZodString>;
        entityRefs: z.ZodArray<z.ZodString>;
        tokenEstimate: z.ZodNumber;
        lastRefreshedAt: z.ZodString;
        createdAt: z.ZodString;
    }, z.core.$strict>;
    "episodes.summary.refresh": z.ZodObject<{
        id: z.ZodString;
        episodeId: z.ZodString;
        objective: z.ZodNullable<z.ZodString>;
        currentState: z.ZodNullable<z.ZodString>;
        recentDecisions: z.ZodArray<z.ZodString>;
        entityRefs: z.ZodArray<z.ZodString>;
        tokenEstimate: z.ZodNumber;
        lastRefreshedAt: z.ZodString;
        createdAt: z.ZodString;
    }, z.core.$strict>;
    "episodes.append_message": z.ZodDiscriminatedUnion<[z.ZodObject<{
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
    "episodes.archive": z.ZodObject<{
        status: z.ZodString;
    }, z.core.$strip>;
    "episodes.complete": z.ZodObject<{
        status: z.ZodString;
    }, z.core.$strip>;
    "episodes.ask_user": z.ZodObject<{
        readonly status: z.ZodLiteral<"question_sent">;
        readonly awaitingResponse: z.ZodBoolean;
    }, z.core.$strip>;
    "episodes.get": z.ZodObject<{
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
            data: z.ZodOptional<z.ZodType<import("../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonValue, unknown>>>;
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
                request: z.ZodType<import("../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonValue, unknown>>;
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
    "episodes.subtree": z.ZodObject<{
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
    "episodes.list": z.ZodObject<{
        readonly items: z.ZodArray<z.ZodObject<{
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
        }, z.core.$strip>>;
        readonly total: z.ZodNumber;
        readonly limit: z.ZodNumber;
        readonly offset: z.ZodNumber;
    }, z.core.$strip>;
    "episodes.list_for_entity": z.ZodArray<z.ZodObject<{
        episodeId: z.ZodString;
        title: z.ZodString;
        status: z.ZodString;
        isArchived: z.ZodBoolean;
        linkKinds: z.ZodArray<z.ZodString>;
        updatedAt: z.ZodString;
        isEmpty: z.ZodBoolean;
    }, z.core.$strip>>;
    "episodes.search": z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        status: z.ZodString;
        isArchived: z.ZodBoolean;
        objective: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
    "episodes.todo.get": z.ZodObject<{
        items: z.ZodArray<z.ZodObject<{
            content: z.ZodString;
            status: z.ZodEnum<{
                completed: "completed";
                cancelled: "cancelled";
                pending: "pending";
                in_progress: "in_progress";
            }>;
            externalId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    "episodes.todo.update": z.ZodObject<{
        items: z.ZodArray<z.ZodObject<{
            content: z.ZodString;
            status: z.ZodEnum<{
                completed: "completed";
                cancelled: "cancelled";
                pending: "pending";
                in_progress: "in_progress";
            }>;
            externalId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    "episodes.model.set": z.ZodObject<{
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
    "episodes.stop": z.ZodObject<{
        episodeId: z.ZodString;
        executionId: z.ZodNullable<z.ZodString>;
        state: z.ZodLiteral<"idle">;
        alreadyStopped: z.ZodBoolean;
    }, z.core.$strict>;
    "episodes.wait.resolve": z.ZodObject<{
        episodeId: z.ZodString;
        waitId: z.ZodString;
        inputId: z.ZodString;
        state: z.ZodEnum<{
            active: "active";
            needs_input: "needs_input";
        }>;
    }, z.core.$strict>;
    "episodes.link_entity": z.ZodObject<{
        status: z.ZodString;
    }, z.core.$strip>;
    "episodes.set_title": z.ZodObject<{
        status: z.ZodString;
    }, z.core.$strip>;
    "episodes.set_status": z.ZodObject<{
        status: z.ZodString;
    }, z.core.$strip>;
    "episodes.unarchive": z.ZodObject<{
        status: z.ZodString;
    }, z.core.$strip>;
    "extensions.list": z.ZodObject<{
        extensions: z.ZodArray<z.ZodObject<{
            kind: z.ZodEnum<{
                source: "source";
                module: "module";
                skill: "skill";
            }>;
            id: z.ZodString;
            title: z.ZodString;
            summary: z.ZodString;
            publisher: z.ZodString;
            publisherUrl: z.ZodOptional<z.ZodString>;
            iconUrl: z.ZodString;
            details: z.ZodString;
            docsUrl: z.ZodOptional<z.ZodString>;
            version: z.ZodString;
            state: z.ZodEnum<{
                available: "available";
                active: "active";
                installed_disabled: "installed_disabled";
                activation_failed: "activation_failed";
            }>;
            stateReason: z.ZodOptional<z.ZodString>;
            connection: z.ZodOptional<z.ZodString>;
            installable: z.ZodBoolean;
            installed: z.ZodBoolean;
            enabled: z.ZodBoolean;
            packageHash: z.ZodNullable<z.ZodString>;
            ui: z.ZodOptional<z.ZodObject<{
                moduleId: z.ZodString;
                packageHash: z.ZodString;
                entry: z.ZodString;
                exportName: z.ZodString;
            }, z.core.$strip>>;
            removable: z.ZodBoolean;
            position: z.ZodNumber;
            blockingDependents: z.ZodDefault<z.ZodArray<z.ZodString>>;
            unmetRequirements: z.ZodDefault<z.ZodArray<z.ZodString>>;
            surfaces: z.ZodDefault<z.ZodArray<z.ZodString>>;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    "extensions.get": z.ZodObject<{
        kind: z.ZodEnum<{
            source: "source";
            module: "module";
            skill: "skill";
        }>;
        id: z.ZodString;
        title: z.ZodString;
        summary: z.ZodString;
        publisher: z.ZodString;
        publisherUrl: z.ZodOptional<z.ZodString>;
        iconUrl: z.ZodString;
        details: z.ZodString;
        docsUrl: z.ZodOptional<z.ZodString>;
        version: z.ZodString;
        state: z.ZodEnum<{
            available: "available";
            active: "active";
            installed_disabled: "installed_disabled";
            activation_failed: "activation_failed";
        }>;
        stateReason: z.ZodOptional<z.ZodString>;
        connection: z.ZodOptional<z.ZodString>;
        installable: z.ZodBoolean;
        installed: z.ZodBoolean;
        enabled: z.ZodBoolean;
        packageHash: z.ZodNullable<z.ZodString>;
        ui: z.ZodOptional<z.ZodObject<{
            moduleId: z.ZodString;
            packageHash: z.ZodString;
            entry: z.ZodString;
            exportName: z.ZodString;
        }, z.core.$strip>>;
        removable: z.ZodBoolean;
        position: z.ZodNumber;
        blockingDependents: z.ZodDefault<z.ZodArray<z.ZodString>>;
        unmetRequirements: z.ZodDefault<z.ZodArray<z.ZodString>>;
        surfaces: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>;
    "groups.get": z.ZodObject<{
        name: z.ZodString;
        id: z.ZodString;
        description: z.ZodString;
        createdAt: z.ZodString;
        memory: z.ZodString;
        memberCount: z.ZodNumber;
        identityProfiles: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            contentPreview: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    "groups.list": z.ZodObject<{
        readonly items: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            description: z.ZodString;
            memory: z.ZodString;
            memberCount: z.ZodNumber;
            identityProfileName: z.ZodNullable<z.ZodString>;
            createdAt: z.ZodString;
        }, z.core.$strip>>;
        readonly total: z.ZodNumber;
        readonly limit: z.ZodNumber;
        readonly offset: z.ZodNumber;
    }, z.core.$strip>;
    "groups.list_for_entity": z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        description: z.ZodString;
        memory: z.ZodString;
        memberCount: z.ZodNumber;
        identityProfileName: z.ZodNullable<z.ZodString>;
        createdAt: z.ZodString;
    }, z.core.$strip>>;
    "groups.list_members": z.ZodArray<z.ZodObject<{
        entityId: z.ZodString;
        name: z.ZodNullable<z.ZodString>;
        schemaId: z.ZodString;
    }, z.core.$strip>>;
    "groups.create": z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        description: z.ZodString;
        memory: z.ZodString;
        memberCount: z.ZodNumber;
        identityProfileName: z.ZodNullable<z.ZodString>;
        createdAt: z.ZodString;
    }, z.core.$strip>;
    "groups.update": z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        description: z.ZodString;
        memory: z.ZodString;
        memberCount: z.ZodNumber;
        identityProfileName: z.ZodNullable<z.ZodString>;
        createdAt: z.ZodString;
    }, z.core.$strip>;
    "groups.delete": z.ZodObject<{
        status: z.ZodString;
    }, z.core.$strip>;
    "groups.add_member": z.ZodObject<{
        status: z.ZodString;
    }, z.core.$strip>;
    "groups.remove_member": z.ZodObject<{
        status: z.ZodString;
    }, z.core.$strip>;
    "groups.update_memory": z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        description: z.ZodString;
        memory: z.ZodString;
        memberCount: z.ZodNumber;
        identityProfileName: z.ZodNullable<z.ZodString>;
        createdAt: z.ZodString;
    }, z.core.$strip>;
    "groups.capabilities": z.ZodRecord<z.ZodString, z.ZodType<import("../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonValue, unknown>>>;
    "groups.resolve_identity": z.ZodArray<z.ZodObject<{
        groupId: z.ZodString;
        groupName: z.ZodString;
        description: z.ZodString;
        memory: z.ZodString;
        identityProfiles: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            contentPreview: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    "groups.update_bio": z.ZodObject<{
        status: z.ZodString;
    }, z.core.$strip>;
    "identity.list": z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        content: z.ZodString;
        isDefault: z.ZodBoolean;
        groupIds: z.ZodArray<z.ZodString>;
        groupNames: z.ZodArray<z.ZodString>;
        updatedAt: z.ZodString;
        createdAt: z.ZodString;
    }, z.core.$strip>>;
    "identity.create": z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        content: z.ZodString;
        isDefault: z.ZodBoolean;
        groupIds: z.ZodArray<z.ZodString>;
        groupNames: z.ZodArray<z.ZodString>;
        updatedAt: z.ZodString;
        createdAt: z.ZodString;
    }, z.core.$strip>;
    "identity.update": z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        content: z.ZodString;
        isDefault: z.ZodBoolean;
        groupIds: z.ZodArray<z.ZodString>;
        groupNames: z.ZodArray<z.ZodString>;
        updatedAt: z.ZodString;
        createdAt: z.ZodString;
    }, z.core.$strip>;
    "identity.delete": z.ZodObject<{
        status: z.ZodString;
    }, z.core.$strip>;
    "subagents.list": z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        systemPrompt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        status: z.ZodString;
        createdAt: z.ZodString;
    }, z.core.$strip>>;
    "subagents.create": z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        systemPrompt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        status: z.ZodString;
        createdAt: z.ZodString;
    }, z.core.$strip>;
    "subagents.update": z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        systemPrompt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        status: z.ZodString;
        createdAt: z.ZodString;
    }, z.core.$strip>;
    "subagents.delete": z.ZodObject<{
        status: z.ZodString;
    }, z.core.$strip>;
    "hooks.create": z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        triggerAction: z.ZodString;
        triggerScope: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        reviewAgentId: z.ZodOptional<z.ZodString>;
        onWarning: z.ZodString;
        groupIds: z.ZodArray<z.ZodString>;
        enabled: z.ZodBoolean;
    }, z.core.$strip>;
    "hooks.update": z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        triggerAction: z.ZodString;
        triggerScope: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        reviewAgentId: z.ZodOptional<z.ZodString>;
        onWarning: z.ZodString;
        groupIds: z.ZodArray<z.ZodString>;
        enabled: z.ZodBoolean;
    }, z.core.$strip>;
    "hooks.delete": z.ZodObject<{
        status: z.ZodString;
    }, z.core.$strip>;
    "hooks.list": z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        triggerAction: z.ZodString;
        triggerScope: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        reviewAgentId: z.ZodOptional<z.ZodString>;
        onWarning: z.ZodString;
        groupIds: z.ZodArray<z.ZodString>;
        enabled: z.ZodBoolean;
        createdAt: z.ZodString;
    }, z.core.$strip>>;
    "source.list": z.ZodObject<{
        sources: z.ZodArray<z.ZodObject<{
            sourceId: z.ZodString;
            displayName: z.ZodString;
            surfaces: z.ZodArray<z.ZodString>;
            authType: z.ZodEnum<{
                none: "none";
                oauth2: "oauth2";
                phoneCode: "phoneCode";
                apiKey: "apiKey";
                sharedProvider: "sharedProvider";
            }>;
            packageHash: z.ZodString;
            connectable: z.ZodBoolean;
            unavailableReason: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    "source.status.list": z.ZodObject<{
        sources: z.ZodArray<z.ZodObject<{
            sourceId: z.ZodString;
            displayName: z.ZodString;
            availability: z.ZodDiscriminatedUnion<[z.ZodObject<{
                state: z.ZodLiteral<"installedDisabled">;
                packageHash: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                state: z.ZodLiteral<"active">;
                packageHash: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                state: z.ZodLiteral<"unavailable">;
                packageHash: z.ZodString;
                reason: z.ZodString;
            }, z.core.$strict>], "state">;
            accounts: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
                authKind: z.ZodEnum<{
                    oauth2: "oauth2";
                    phoneCode: "phoneCode";
                    apiKey: "apiKey";
                    sharedProvider: "sharedProvider";
                }>;
                lifecycle: z.ZodLiteral<"authRequired">;
                repair: z.ZodEnum<{
                    reconnectOauth: "reconnectOauth";
                    reloginPhone: "reloginPhone";
                    enterKey: "enterKey";
                    replaceKey: "replaceKey";
                }>;
                accountId: z.ZodString;
                displayName: z.ZodString;
                providerAccountId: z.ZodNullable<z.ZodString>;
                generation: z.ZodNumber;
                invalidReason: z.ZodNullable<z.ZodString>;
                credential: z.ZodUnion<readonly [z.ZodObject<{
                    state: z.ZodLiteral<"unconfigured">;
                }, z.core.$strict>, z.ZodDiscriminatedUnion<[z.ZodObject<{
                    state: z.ZodLiteral<"ready">;
                    kind: z.ZodLiteral<"minted">;
                    revision: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    state: z.ZodLiteral<"ready">;
                    kind: z.ZodLiteral<"userKey">;
                    revision: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    state: z.ZodLiteral<"ready">;
                    kind: z.ZodLiteral<"deploymentKey">;
                    revision: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    state: z.ZodLiteral<"ready">;
                    kind: z.ZodLiteral<"fixture">;
                    revision: z.ZodNull;
                }, z.core.$strict>], "kind">, z.ZodObject<{
                    state: z.ZodLiteral<"unavailable">;
                    kind: z.ZodEnum<{
                        minted: "minted";
                        userKey: "userKey";
                        deploymentKey: "deploymentKey";
                        fixture: "fixture";
                    }>;
                    reason: z.ZodString;
                }, z.core.$strict>]>;
                runtime: z.ZodDiscriminatedUnion<[z.ZodObject<{
                    state: z.ZodLiteral<"absent">;
                }, z.core.$strict>, z.ZodObject<{
                    state: z.ZodLiteral<"starting">;
                }, z.core.$strict>, z.ZodObject<{
                    state: z.ZodLiteral<"ready">;
                }, z.core.$strict>, z.ZodObject<{
                    state: z.ZodLiteral<"stopping">;
                    reason: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    state: z.ZodLiteral<"failed">;
                    reason: z.ZodString;
                }, z.core.$strict>], "state">;
                messageProgress: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    saved: z.ZodNumber;
                    plan: z.ZodNullable<z.ZodObject<{
                        unit: z.ZodString;
                        planned: z.ZodNumber;
                        excludedScopes: z.ZodNumber;
                        excludedItems: z.ZodNumber;
                        uncountedScopes: z.ZodNumber;
                        measuredAt: z.ZodISODateTime;
                    }, z.core.$strict>>;
                    measuredAt: z.ZodISODateTime;
                }, z.core.$strict>>>;
                surfaces: z.ZodArray<z.ZodObject<{
                    surface: z.ZodString;
                    enrollment: z.ZodDiscriminatedUnion<[z.ZodObject<{
                        state: z.ZodLiteral<"notEnrolled">;
                    }, z.core.$strict>, z.ZodObject<{
                        state: z.ZodLiteral<"enabled">;
                        generation: z.ZodNumber;
                    }, z.core.$strict>, z.ZodObject<{
                        state: z.ZodLiteral<"paused">;
                        generation: z.ZodNumber;
                    }, z.core.$strict>], "state">;
                    sync: z.ZodDiscriminatedUnion<[z.ZodObject<{
                        state: z.ZodLiteral<"notStarted">;
                    }, z.core.$strict>, z.ZodObject<{
                        state: z.ZodLiteral<"current">;
                        status: z.ZodEnum<{
                            error: "error";
                            idle: "idle";
                            authRequired: "authRequired";
                            syncing: "syncing";
                            rateLimited: "rateLimited";
                        }>;
                        phase: z.ZodEnum<{
                            stopping: "stopping";
                            protectLive: "protectLive";
                            bootstrap: "bootstrap";
                            reconcile: "reconcile";
                            catchUp: "catchUp";
                            live: "live";
                            pollWait: "pollWait";
                            backfill: "backfill";
                            recoveryWait: "recoveryWait";
                        }>;
                        mode: z.ZodEnum<{
                            push: "push";
                            poll: "poll";
                        }>;
                        progress: z.ZodObject<{
                            scope: z.ZodNullable<z.ZodDiscriminatedUnion<[z.ZodObject<{
                                kind: z.ZodLiteral<"orderedRange">;
                                scopeId: z.ZodString;
                            }, z.core.$strict>, z.ZodObject<{
                                kind: z.ZodLiteral<"snapshot">;
                                scopeId: z.ZodString;
                                snapshotGeneration: z.ZodString;
                            }, z.core.$strict>, z.ZodObject<{
                                kind: z.ZodLiteral<"timeWindow">;
                                scopeId: z.ZodString;
                                from: z.ZodString;
                                to: z.ZodString;
                            }, z.core.$strict>, z.ZodObject<{
                                kind: z.ZodLiteral<"trackedIdentities">;
                                scopeId: z.ZodString;
                                identities: z.ZodArray<z.ZodString>;
                            }, z.core.$strict>], "kind">>;
                            forwardCheckpoint: z.ZodNullable<z.ZodType<import("../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonValue, unknown>>>;
                            activeWork: z.ZodNullable<z.ZodObject<{
                                target: z.ZodDiscriminatedUnion<[z.ZodObject<{
                                    kind: z.ZodLiteral<"forward">;
                                }, z.core.$strict>, z.ZodObject<{
                                    kind: z.ZodLiteral<"gap">;
                                    start: z.ZodNumber;
                                    end: z.ZodNumber;
                                }, z.core.$strict>, z.ZodObject<{
                                    kind: z.ZodLiteral<"olderHistory">;
                                    before: z.ZodNumber;
                                }, z.core.$strict>, z.ZodObject<{
                                    kind: z.ZodLiteral<"seededInitialHistory">;
                                    params: z.ZodType<import("../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonValue, unknown>>;
                                }, z.core.$strict>, z.ZodObject<{
                                    kind: z.ZodLiteral<"snapshot">;
                                    generation: z.ZodString;
                                }, z.core.$strict>, z.ZodObject<{
                                    kind: z.ZodLiteral<"timeWindow">;
                                    from: z.ZodString;
                                    to: z.ZodString;
                                }, z.core.$strict>, z.ZodObject<{
                                    kind: z.ZodLiteral<"trackedIdentities">;
                                    identities: z.ZodArray<z.ZodString>;
                                }, z.core.$strict>], "kind">;
                                continuationToken: z.ZodNullable<z.ZodType<import("../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonValue, unknown>>>;
                                targetGeneration: z.ZodNumber;
                            }, z.core.$strict>>;
                            liveFence: z.ZodNullable<z.ZodObject<{
                                subscriptionId: z.ZodString;
                                boundary: z.ZodType<import("../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonValue, unknown>>;
                                acknowledgedAt: z.ZodString;
                            }, z.core.$strict>>;
                            historyComplete: z.ZodBoolean;
                        }, z.core.$strict>;
                        lastAttemptAt: z.ZodNullable<z.ZodString>;
                        lastSuccessAt: z.ZodNullable<z.ZodString>;
                        nextRetryAt: z.ZodNullable<z.ZodString>;
                        error: z.ZodNullable<z.ZodObject<{
                            kind: z.ZodString;
                            message: z.ZodString;
                            attempts: z.ZodNumber;
                        }, z.core.$strict>>;
                    }, z.core.$strict>], "state">;
                }, z.core.$strict>>;
            }, z.core.$strict>, ...z.ZodObject<{
                lifecycle: z.ZodLiteral<"connected" | "disconnecting" | "revokePending" | "revoked" | "invalid">;
                repair: z.ZodNull;
                accountId: z.ZodString;
                displayName: z.ZodString;
                providerAccountId: z.ZodNullable<z.ZodString>;
                authKind: z.ZodEnum<{
                    none: "none";
                    oauth2: "oauth2";
                    phoneCode: "phoneCode";
                    apiKey: "apiKey";
                    sharedProvider: "sharedProvider";
                }>;
                generation: z.ZodNumber;
                invalidReason: z.ZodNullable<z.ZodString>;
                credential: z.ZodUnion<readonly [z.ZodObject<{
                    state: z.ZodLiteral<"unconfigured">;
                }, z.core.$strict>, z.ZodDiscriminatedUnion<[z.ZodObject<{
                    state: z.ZodLiteral<"ready">;
                    kind: z.ZodLiteral<"minted">;
                    revision: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    state: z.ZodLiteral<"ready">;
                    kind: z.ZodLiteral<"userKey">;
                    revision: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    state: z.ZodLiteral<"ready">;
                    kind: z.ZodLiteral<"deploymentKey">;
                    revision: z.ZodNumber;
                }, z.core.$strict>, z.ZodObject<{
                    state: z.ZodLiteral<"ready">;
                    kind: z.ZodLiteral<"fixture">;
                    revision: z.ZodNull;
                }, z.core.$strict>], "kind">, z.ZodObject<{
                    state: z.ZodLiteral<"unavailable">;
                    kind: z.ZodEnum<{
                        minted: "minted";
                        userKey: "userKey";
                        deploymentKey: "deploymentKey";
                        fixture: "fixture";
                    }>;
                    reason: z.ZodString;
                }, z.core.$strict>]>;
                runtime: z.ZodDiscriminatedUnion<[z.ZodObject<{
                    state: z.ZodLiteral<"absent">;
                }, z.core.$strict>, z.ZodObject<{
                    state: z.ZodLiteral<"starting">;
                }, z.core.$strict>, z.ZodObject<{
                    state: z.ZodLiteral<"ready">;
                }, z.core.$strict>, z.ZodObject<{
                    state: z.ZodLiteral<"stopping">;
                    reason: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    state: z.ZodLiteral<"failed">;
                    reason: z.ZodString;
                }, z.core.$strict>], "state">;
                messageProgress: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    saved: z.ZodNumber;
                    plan: z.ZodNullable<z.ZodObject<{
                        unit: z.ZodString;
                        planned: z.ZodNumber;
                        excludedScopes: z.ZodNumber;
                        excludedItems: z.ZodNumber;
                        uncountedScopes: z.ZodNumber;
                        measuredAt: z.ZodISODateTime;
                    }, z.core.$strict>>;
                    measuredAt: z.ZodISODateTime;
                }, z.core.$strict>>>;
                surfaces: z.ZodArray<z.ZodObject<{
                    surface: z.ZodString;
                    enrollment: z.ZodDiscriminatedUnion<[z.ZodObject<{
                        state: z.ZodLiteral<"notEnrolled">;
                    }, z.core.$strict>, z.ZodObject<{
                        state: z.ZodLiteral<"enabled">;
                        generation: z.ZodNumber;
                    }, z.core.$strict>, z.ZodObject<{
                        state: z.ZodLiteral<"paused">;
                        generation: z.ZodNumber;
                    }, z.core.$strict>], "state">;
                    sync: z.ZodDiscriminatedUnion<[z.ZodObject<{
                        state: z.ZodLiteral<"notStarted">;
                    }, z.core.$strict>, z.ZodObject<{
                        state: z.ZodLiteral<"current">;
                        status: z.ZodEnum<{
                            error: "error";
                            idle: "idle";
                            authRequired: "authRequired";
                            syncing: "syncing";
                            rateLimited: "rateLimited";
                        }>;
                        phase: z.ZodEnum<{
                            stopping: "stopping";
                            protectLive: "protectLive";
                            bootstrap: "bootstrap";
                            reconcile: "reconcile";
                            catchUp: "catchUp";
                            live: "live";
                            pollWait: "pollWait";
                            backfill: "backfill";
                            recoveryWait: "recoveryWait";
                        }>;
                        mode: z.ZodEnum<{
                            push: "push";
                            poll: "poll";
                        }>;
                        progress: z.ZodObject<{
                            scope: z.ZodNullable<z.ZodDiscriminatedUnion<[z.ZodObject<{
                                kind: z.ZodLiteral<"orderedRange">;
                                scopeId: z.ZodString;
                            }, z.core.$strict>, z.ZodObject<{
                                kind: z.ZodLiteral<"snapshot">;
                                scopeId: z.ZodString;
                                snapshotGeneration: z.ZodString;
                            }, z.core.$strict>, z.ZodObject<{
                                kind: z.ZodLiteral<"timeWindow">;
                                scopeId: z.ZodString;
                                from: z.ZodString;
                                to: z.ZodString;
                            }, z.core.$strict>, z.ZodObject<{
                                kind: z.ZodLiteral<"trackedIdentities">;
                                scopeId: z.ZodString;
                                identities: z.ZodArray<z.ZodString>;
                            }, z.core.$strict>], "kind">>;
                            forwardCheckpoint: z.ZodNullable<z.ZodType<import("../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonValue, unknown>>>;
                            activeWork: z.ZodNullable<z.ZodObject<{
                                target: z.ZodDiscriminatedUnion<[z.ZodObject<{
                                    kind: z.ZodLiteral<"forward">;
                                }, z.core.$strict>, z.ZodObject<{
                                    kind: z.ZodLiteral<"gap">;
                                    start: z.ZodNumber;
                                    end: z.ZodNumber;
                                }, z.core.$strict>, z.ZodObject<{
                                    kind: z.ZodLiteral<"olderHistory">;
                                    before: z.ZodNumber;
                                }, z.core.$strict>, z.ZodObject<{
                                    kind: z.ZodLiteral<"seededInitialHistory">;
                                    params: z.ZodType<import("../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonValue, unknown>>;
                                }, z.core.$strict>, z.ZodObject<{
                                    kind: z.ZodLiteral<"snapshot">;
                                    generation: z.ZodString;
                                }, z.core.$strict>, z.ZodObject<{
                                    kind: z.ZodLiteral<"timeWindow">;
                                    from: z.ZodString;
                                    to: z.ZodString;
                                }, z.core.$strict>, z.ZodObject<{
                                    kind: z.ZodLiteral<"trackedIdentities">;
                                    identities: z.ZodArray<z.ZodString>;
                                }, z.core.$strict>], "kind">;
                                continuationToken: z.ZodNullable<z.ZodType<import("../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonValue, unknown>>>;
                                targetGeneration: z.ZodNumber;
                            }, z.core.$strict>>;
                            liveFence: z.ZodNullable<z.ZodObject<{
                                subscriptionId: z.ZodString;
                                boundary: z.ZodType<import("../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonValue, unknown>>;
                                acknowledgedAt: z.ZodString;
                            }, z.core.$strict>>;
                            historyComplete: z.ZodBoolean;
                        }, z.core.$strict>;
                        lastAttemptAt: z.ZodNullable<z.ZodString>;
                        lastSuccessAt: z.ZodNullable<z.ZodString>;
                        nextRetryAt: z.ZodNullable<z.ZodString>;
                        error: z.ZodNullable<z.ZodObject<{
                            kind: z.ZodString;
                            message: z.ZodString;
                            attempts: z.ZodNumber;
                        }, z.core.$strict>>;
                    }, z.core.$strict>], "state">;
                }, z.core.$strict>>;
            }, z.core.$strict>[]], "lifecycle">>;
        }, z.core.$strict>>;
    }, z.core.$strict>;
    "source.accounts.disconnect": z.ZodObject<{
        ok: z.ZodLiteral<true>;
    }, z.core.$strip>;
    "source.accounts.provision": z.ZodObject<{
        readonly ok: z.ZodLiteral<true>;
        readonly accountId: z.ZodString;
        readonly subject: z.ZodString;
    }, z.core.$strip>;
    "source.sync.bootstrap": z.ZodObject<{
        readonly ok: z.ZodLiteral<true>;
        readonly seeded: z.ZodNumber;
    }, z.core.$strip>;
    "source.auth.session.open": z.ZodObject<{
        readonly sessionId: z.ZodString;
        readonly authType: z.ZodString;
        readonly redirectUrl: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    "source.auth.submit": z.ZodObject<{
        status: z.ZodString;
    }, z.core.$strip>;
    "source.auth.exec": z.ZodObject<{
        readonly status: z.ZodString;
        readonly identity: z.ZodOptional<z.ZodType<import("../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonValue, unknown>>>;
        readonly connectionId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, z.core.$strip>;
    "source.auth.oauth.complete": z.ZodObject<{
        readonly status: z.ZodString;
        readonly identity: z.ZodOptional<z.ZodType<import("../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonValue, unknown>>>;
        readonly connectionId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, z.core.$strip>;
    "source.keys.set": z.ZodObject<{
        ok: z.ZodLiteral<true>;
    }, z.core.$strip>;
    "source.auth.session.cancel": z.ZodObject<{
        readonly cancelled: z.ZodBoolean;
        readonly reason: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    "file.upload": z.ZodObject<{
        id: z.ZodString;
        schemaId: z.ZodString;
        name: z.ZodString;
        mimeType: z.ZodString;
        sizeBytes: z.ZodNumber;
    }, z.core.$strip>;
    "graph.entity.get": z.ZodObject<{
        id: z.ZodString;
        schemaId: z.ZodString;
        name: z.ZodNullable<z.ZodString>;
        createdAt: z.ZodString;
        isPinned: z.ZodNullable<z.ZodBoolean>;
        pinOrder: z.ZodNullable<z.ZodNumber>;
        isArchived: z.ZodNullable<z.ZodBoolean>;
        properties: z.ZodType<import("../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonValue, unknown>>;
        linkedEntities: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodNullable<z.ZodString>;
            schemaId: z.ZodString;
            linkKind: z.ZodString;
            createdAt: z.ZodString;
            data: z.ZodOptional<z.ZodType<import("../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonValue, unknown>>>;
            confidence: z.ZodNullable<z.ZodNumber>;
            origin: z.ZodEnum<{
                canonical: "canonical";
                agent: "agent";
            }>;
            validUntil: z.ZodNullable<z.ZodISODateTime>;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    "graph.entity.pin": z.ZodObject<{
        ok: z.ZodLiteral<true>;
    }, z.core.$strip>;
    "graph.entity.unpin": z.ZodObject<{
        ok: z.ZodLiteral<true>;
    }, z.core.$strip>;
    "graph.entity.archive": z.ZodObject<{
        ok: z.ZodLiteral<true>;
    }, z.core.$strip>;
    "graph.entity.unarchive": z.ZodObject<{
        ok: z.ZodLiteral<true>;
    }, z.core.$strip>;
    "graph.entity.update_properties": z.ZodObject<{
        ok: z.ZodLiteral<true>;
    }, z.core.$strip>;
    "graph.link.add": z.ZodObject<{
        id: z.ZodString;
        kind: z.ZodString;
        from: z.ZodString;
        to: z.ZodString;
        created: z.ZodBoolean;
    }, z.core.$strip>;
    "graph.approve": z.ZodUnion<readonly [z.ZodDiscriminatedUnion<[z.ZodObject<{
        origin: z.ZodLiteral<"canonical">;
        source: z.ZodObject<{
            source: z.ZodString;
            account: z.ZodString;
            externalId: z.ZodString;
        }, z.core.$strict>;
        id: z.ZodString;
        owner: z.ZodString;
        schemaId: z.ZodString;
        schemaVersion: z.ZodInt;
        createdAt: z.ZodISODateTime;
        name: z.ZodNullable<z.ZodString>;
        indexed: z.ZodBoolean;
        date: z.ZodISODateTime;
        idx: z.ZodNullable<z.ZodString>;
        isPinned: z.ZodNullable<z.ZodBoolean>;
        pinOrder: z.ZodNullable<z.ZodNumber>;
        isArchived: z.ZodNullable<z.ZodBoolean>;
        properties: z.ZodType<import("../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonValue, unknown>>;
    }, z.core.$strict>, z.ZodObject<{
        keys: z.ZodArray<z.ZodString>;
        origin: z.ZodLiteral<"agent">;
        confidence: z.ZodNumber;
        evidence: z.ZodTuple<[z.ZodString], z.ZodString>;
        validFrom: z.ZodNullable<z.ZodISODateTime>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
        id: z.ZodString;
        owner: z.ZodString;
        schemaId: z.ZodString;
        schemaVersion: z.ZodInt;
        createdAt: z.ZodISODateTime;
        name: z.ZodNullable<z.ZodString>;
        indexed: z.ZodBoolean;
        date: z.ZodISODateTime;
        idx: z.ZodNullable<z.ZodString>;
        isPinned: z.ZodNullable<z.ZodBoolean>;
        pinOrder: z.ZodNullable<z.ZodNumber>;
        isArchived: z.ZodNullable<z.ZodBoolean>;
        properties: z.ZodType<import("../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonValue, unknown>>;
    }, z.core.$strict>], "origin">, z.ZodDiscriminatedUnion<[z.ZodObject<{
        origin: z.ZodLiteral<"canonical">;
        metadata: z.ZodType<import("../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonValue, unknown>>;
        id: z.ZodString;
        owner: z.ZodString;
        from: z.ZodString;
        to: z.ZodString;
        kind: z.ZodString;
        createdAt: z.ZodISODateTime;
    }, z.core.$strict>, z.ZodObject<{
        origin: z.ZodLiteral<"agent">;
        confidence: z.ZodNumber;
        evidence: z.ZodTuple<[z.ZodString], z.ZodString>;
        validFrom: z.ZodNullable<z.ZodISODateTime>;
        validUntil: z.ZodNullable<z.ZodISODateTime>;
        id: z.ZodString;
        owner: z.ZodString;
        from: z.ZodString;
        to: z.ZodString;
        kind: z.ZodString;
        createdAt: z.ZodISODateTime;
    }, z.core.$strict>], "origin">]>;
    "graph.withdraw": z.ZodObject<{
        readonly entities: z.ZodNumber;
        readonly links: z.ZodNumber;
    }, z.core.$strip>;
    "graph.get": z.ZodObject<{
        entity: z.ZodObject<{
            id: z.ZodString;
            schemaId: z.ZodString;
            name: z.ZodNullable<z.ZodString>;
            date: z.ZodString;
            idx: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>;
        links: z.ZodArray<z.ZodObject<{
            from: z.ZodString;
            to: z.ZodString;
            confidence: z.ZodNullable<z.ZodNumber>;
            origin: z.ZodEnum<{
                canonical: "canonical";
                agent: "agent";
            }>;
            validUntil: z.ZodNullable<z.ZodISODateTime>;
            id: z.ZodString;
            kind: z.ZodString;
        }, z.core.$strip>>;
        linkCounts: z.ZodRecord<z.ZodString, z.ZodNumber>;
        linksTotal: z.ZodNumber;
        linksHasMore: z.ZodBoolean;
    }, z.core.$strip>;
    "graph.find": z.ZodObject<{
        items: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            schemaId: z.ZodString;
            name: z.ZodNullable<z.ZodString>;
            date: z.ZodString;
            idx: z.ZodNullable<z.ZodString>;
            linkKind: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        total: z.ZodNumber;
        hasMore: z.ZodBoolean;
    }, z.core.$strip>;
    "graph.links": z.ZodObject<{
        items: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            schemaId: z.ZodString;
            name: z.ZodNullable<z.ZodString>;
            date: z.ZodString;
            idx: z.ZodNullable<z.ZodString>;
            linkKind: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        total: z.ZodNumber;
        hasMore: z.ZodBoolean;
    }, z.core.$strip>;
    "graph.entity.links": z.ZodObject<{
        entityId: z.ZodString;
        links: z.ZodArray<z.ZodObject<{
            direction: z.ZodEnum<{
                from: "from";
                to: "to";
            }>;
            kind: z.ZodString;
            targetId: z.ZodOptional<z.ZodString>;
            targetName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            sourceId: z.ZodOptional<z.ZodString>;
            sourceName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            confidence: z.ZodNullable<z.ZodNumber>;
            origin: z.ZodEnum<{
                canonical: "canonical";
                agent: "agent";
            }>;
            validUntil: z.ZodNullable<z.ZodISODateTime>;
        }, z.core.$strip>>;
        total: z.ZodNumber;
    }, z.core.$strip>;
    "graph.capabilities": z.ZodRecord<z.ZodString, z.ZodType<import("../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonValue, unknown>>>;
    "graph.search": z.ZodObject<{
        items: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            schemaId: z.ZodString;
            name: z.ZodNullable<z.ZodString>;
            date: z.ZodString;
            idx: z.ZodNullable<z.ZodString>;
            linkKind: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        total: z.ZodNumber;
        hasMore: z.ZodBoolean;
    }, z.core.$strip>;
    "search.fast": z.ZodObject<{
        readonly results: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodNullable<z.ZodString>;
            schemaId: z.ZodString;
            score: z.ZodNumber;
            excerpt: z.ZodOptional<z.ZodString>;
            linkKind: z.ZodOptional<z.ZodString>;
            data: z.ZodOptional<z.ZodType<import("../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonValue, unknown>>>;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    "search.by_graph": z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodNullable<z.ZodString>;
        schemaId: z.ZodString;
        score: z.ZodNumber;
        excerpt: z.ZodOptional<z.ZodString>;
        linkKind: z.ZodOptional<z.ZodString>;
        data: z.ZodOptional<z.ZodType<import("../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonValue, unknown>>>;
    }, z.core.$strip>>;
    "search.capabilities": z.ZodRecord<z.ZodString, z.ZodType<import("../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonValue, unknown>>>;
    "search.combined": z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodNullable<z.ZodString>;
        schemaId: z.ZodString;
        score: z.ZodNumber;
        excerpt: z.ZodOptional<z.ZodString>;
        linkKind: z.ZodOptional<z.ZodString>;
        data: z.ZodOptional<z.ZodType<import("../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonValue, unknown>>>;
    }, z.core.$strip>>;
    "search.hybrid": z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodNullable<z.ZodString>;
        schemaId: z.ZodString;
        score: z.ZodNumber;
        excerpt: z.ZodOptional<z.ZodString>;
        linkKind: z.ZodOptional<z.ZodString>;
        data: z.ZodOptional<z.ZodType<import("../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonValue, unknown>>>;
    }, z.core.$strip>>;
    "search.indexing_status": z.ZodObject<{
        indexed: z.ZodInt;
        total: z.ZodInt;
        pending: z.ZodInt;
        percent: z.ZodInt;
        model: z.ZodString;
        status: z.ZodEnum<{
            idle: "idle";
            indexing: "indexing";
        }>;
        activeModelId: z.ZodNullable<z.ZodString>;
        lifecycleState: z.ZodEnum<{
            ready: "ready";
            failed: "failed";
            unconfigured: "unconfigured";
            catching_up: "catching_up";
            reconfiguring: "reconfiguring";
        }>;
        generation: z.ZodInt;
        lastFailure: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    "search.model_status": z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        downloaded: z.ZodBoolean;
        downloadSize: z.ZodNullable<z.ZodString>;
        diskUsage: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
    "memory.list": z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        memoryType: z.ZodString;
        title: z.ZodString;
        body: z.ZodString;
        confidence: z.ZodNumber;
        status: z.ZodString;
        origin: z.ZodString;
        sourceKind: z.ZodString;
        sourceEpisodeId: z.ZodNullable<z.ZodString>;
        sourceMessageIds: z.ZodArray<z.ZodString>;
        subjectEntityId: z.ZodNullable<z.ZodString>;
        projectEntityId: z.ZodNullable<z.ZodString>;
        validFrom: z.ZodString;
        lastVerifiedAt: z.ZodString;
        supersededBy: z.ZodNullable<z.ZodString>;
        archivedAt: z.ZodNullable<z.ZodString>;
        createdAt: z.ZodString;
    }, z.core.$strip>>;
    "memory.save": z.ZodObject<{
        id: z.ZodString;
        status: z.ZodLiteral<"saved">;
    }, z.core.$strip>;
    "memory.forget": z.ZodObject<{
        status: z.ZodLiteral<"forgotten">;
    }, z.core.$strip>;
    "memory.confirm": z.ZodObject<{
        status: z.ZodLiteral<"ok">;
        confidence: z.ZodNumber;
    }, z.core.$strip>;
    "memory.reject": z.ZodObject<{
        status: z.ZodLiteral<"rejected">;
    }, z.core.$strip>;
    "memory.search": z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        memoryType: z.ZodString;
        title: z.ZodString;
        body: z.ZodString;
        confidence: z.ZodNumber;
        status: z.ZodString;
        origin: z.ZodString;
        sourceKind: z.ZodString;
        sourceEpisodeId: z.ZodNullable<z.ZodString>;
        sourceMessageIds: z.ZodArray<z.ZodString>;
        subjectEntityId: z.ZodNullable<z.ZodString>;
        projectEntityId: z.ZodNullable<z.ZodString>;
        validFrom: z.ZodString;
        lastVerifiedAt: z.ZodString;
        supersededBy: z.ZodNullable<z.ZodString>;
        archivedAt: z.ZodNullable<z.ZodString>;
        createdAt: z.ZodString;
    }, z.core.$strip>>;
    "memory.capabilities": z.ZodRecord<z.ZodString, z.ZodType<import("../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonValue, unknown>>>;
    "memory.diagnostics": z.ZodObject<{
        totalActive: z.ZodNumber;
        totalRejected: z.ZodNumber;
        totalStale: z.ZodNumber;
        byType: z.ZodRecord<z.ZodString, z.ZodNumber>;
        avgConfidence: z.ZodNumber;
        lastConsolidation: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    "module_settings.list": z.ZodArray<z.ZodObject<{
        moduleId: z.ZodString;
        label: z.ZodString;
        schema: z.ZodNullable<z.ZodObject<{
            moduleId: z.ZodString;
            label: z.ZodString;
            description: z.ZodNullable<z.ZodString>;
            fields: z.ZodArray<z.ZodObject<{
                key: z.ZodString;
                label: z.ZodString;
                description: z.ZodNullable<z.ZodString>;
                fieldType: z.ZodDiscriminatedUnion<[z.ZodObject<{
                    type: z.ZodLiteral<"number">;
                    min: z.ZodNullable<z.ZodNumber>;
                    max: z.ZodNullable<z.ZodNumber>;
                }, z.core.$strip>, z.ZodObject<{
                    type: z.ZodLiteral<"string">;
                    maxLength: z.ZodNullable<z.ZodNumber>;
                }, z.core.$strip>, z.ZodObject<{
                    type: z.ZodLiteral<"boolean">;
                }, z.core.$strip>, z.ZodObject<{
                    type: z.ZodLiteral<"enum">;
                    options: z.ZodArray<z.ZodObject<{
                        value: z.ZodString;
                        label: z.ZodString;
                        description: z.ZodNullable<z.ZodString>;
                    }, z.core.$strip>>;
                }, z.core.$strip>], "type">;
                defaultValue: z.ZodString;
                confirmationMessage: z.ZodNullable<z.ZodString>;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
        values: z.ZodArray<z.ZodObject<{
            key: z.ZodString;
            value: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    "runtime.composer.setPresence": z.ZodObject<{
        ok: z.ZodLiteral<true>;
    }, z.core.$strip>;
    "setup.get": z.ZodObject<{
        document: z.ZodObject<{
            version: z.ZodNumber;
            completed: z.ZodBoolean;
            currentStep: z.ZodString;
            sources: z.ZodArray<z.ZodString>;
            engine: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>;
        plan: z.ZodObject<{
            steps: z.ZodReadonly<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
                kind: z.ZodLiteral<"welcome">;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"accounts">;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"connect">;
                source: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"agent">;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"syncing">;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"done">;
            }, z.core.$strict>], "kind">>>;
        }, z.core.$strict>;
        stage: z.ZodObject<{
            current: z.ZodNullable<z.ZodDiscriminatedUnion<[z.ZodObject<{
                kind: z.ZodLiteral<"welcome">;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"accounts">;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"connect">;
                source: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"agent">;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"syncing">;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"done">;
            }, z.core.$strict>], "kind">>;
            history: z.ZodReadonly<z.ZodArray<z.ZodObject<{
                step: z.ZodDiscriminatedUnion<[z.ZodObject<{
                    kind: z.ZodLiteral<"welcome">;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"accounts">;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"connect">;
                    source: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"agent">;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"syncing">;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"done">;
                }, z.core.$strict>], "kind">;
                outcome: z.ZodDiscriminatedUnion<[z.ZodObject<{
                    state: z.ZodLiteral<"answered">;
                }, z.core.$strict>, z.ZodObject<{
                    state: z.ZodLiteral<"skipped">;
                }, z.core.$strict>, z.ZodObject<{
                    state: z.ZodLiteral<"refused">;
                    reason: z.ZodString;
                }, z.core.$strict>], "state">;
                session: z.ZodNullable<z.ZodString>;
            }, z.core.$strict>>>;
        }, z.core.$strict>;
    }, z.core.$strict>;
    "setup.update": z.ZodObject<{
        document: z.ZodObject<{
            version: z.ZodNumber;
            completed: z.ZodBoolean;
            currentStep: z.ZodString;
            sources: z.ZodArray<z.ZodString>;
            engine: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>;
        plan: z.ZodObject<{
            steps: z.ZodReadonly<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
                kind: z.ZodLiteral<"welcome">;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"accounts">;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"connect">;
                source: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"agent">;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"syncing">;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"done">;
            }, z.core.$strict>], "kind">>>;
        }, z.core.$strict>;
        stage: z.ZodObject<{
            current: z.ZodNullable<z.ZodDiscriminatedUnion<[z.ZodObject<{
                kind: z.ZodLiteral<"welcome">;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"accounts">;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"connect">;
                source: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"agent">;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"syncing">;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"done">;
            }, z.core.$strict>], "kind">>;
            history: z.ZodReadonly<z.ZodArray<z.ZodObject<{
                step: z.ZodDiscriminatedUnion<[z.ZodObject<{
                    kind: z.ZodLiteral<"welcome">;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"accounts">;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"connect">;
                    source: z.ZodString;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"agent">;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"syncing">;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"done">;
                }, z.core.$strict>], "kind">;
                outcome: z.ZodDiscriminatedUnion<[z.ZodObject<{
                    state: z.ZodLiteral<"answered">;
                }, z.core.$strict>, z.ZodObject<{
                    state: z.ZodLiteral<"skipped">;
                }, z.core.$strict>, z.ZodObject<{
                    state: z.ZodLiteral<"refused">;
                    reason: z.ZodString;
                }, z.core.$strict>], "state">;
                session: z.ZodNullable<z.ZodString>;
            }, z.core.$strict>>>;
        }, z.core.$strict>;
    }, z.core.$strict>;
    "source.keys.list": z.ZodObject<{
        vaultAvailable: z.ZodBoolean;
        sources: z.ZodArray<z.ZodObject<{
            sourceId: z.ZodString;
            displayName: z.ZodString;
            keys: z.ZodArray<z.ZodObject<{
                key: z.ZodString;
                label: z.ZodString;
                helpUrl: z.ZodNullable<z.ZodString>;
                description: z.ZodNullable<z.ZodString>;
                vaultConfigured: z.ZodBoolean;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    "triggers.fire_now": z.ZodObject<{
        fired: z.ZodLiteral<true>;
        episodeId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, z.core.$strip>;
    "triggers.invalidate_cache": z.ZodObject<{
        invalidated: z.ZodLiteral<true>;
    }, z.core.$strip>;
    "triggers.resolve_watchable": z.ZodRecord<z.ZodString, z.ZodType<import("../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonValue, unknown>>>;
    "triggers.validate_schedule": z.ZodRecord<z.ZodString, z.ZodType<import("../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonValue, unknown>>>;
    "triggers.validate_watch": z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodType<import("../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonValue, unknown>>>>;
    "triggers.fire_history": z.ZodArray<z.ZodType<import("../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonValue, unknown>>>;
    "triggers.capabilities": z.ZodRecord<z.ZodString, z.ZodType<import("../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonValue, unknown>>>;
    "skills.capabilities": z.ZodRecord<z.ZodString, z.ZodType<import("../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonValue, unknown>>>;
    "skills.list": z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        description: z.ZodString;
    }, z.core.$strip>>;
    "skills.list_files": z.ZodObject<{
        files: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
    "skills.read": z.ZodObject<{
        content: z.ZodString;
        truncated: z.ZodBoolean;
    }, z.core.$strip>;
    "eval.capabilities": z.ZodRecord<z.ZodString, z.ZodType<import("../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonValue, unknown>>>;
    "eval.fixture.invoke": z.ZodRecord<z.ZodString, z.ZodType<import("../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonValue, unknown>>>;
    "web.link.get": z.ZodObject<{
        id: z.ZodString;
        url: z.ZodString;
        domain: z.ZodString;
        title: z.ZodNullable<z.ZodString>;
        description: z.ZodNullable<z.ZodString>;
        faviconUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        ogImageUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        createdAt: z.ZodString;
        hasContent: z.ZodBoolean;
        contentExtractedAt: z.ZodNullable<z.ZodString>;
        linkedEntities: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodNullable<z.ZodString>;
            schemaId: z.ZodString;
            linkKind: z.ZodString;
            createdAt: z.ZodString;
            data: z.ZodOptional<z.ZodType<import("../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonValue, unknown>>>;
            confidence: z.ZodNullable<z.ZodNumber>;
            origin: z.ZodEnum<{
                canonical: "canonical";
                agent: "agent";
            }>;
            validUntil: z.ZodNullable<z.ZodISODateTime>;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    "web.link.open": z.ZodObject<{
        id: z.ZodString;
        url: z.ZodString;
        title: z.ZodNullable<z.ZodString>;
        contentMarkdown: z.ZodString;
        contentLength: z.ZodNumber;
        extractedAt: z.ZodString;
        fromCache: z.ZodBoolean;
    }, z.core.$strip>;
    "web.search": z.ZodObject<{
        query: z.ZodString;
        results: z.ZodArray<z.ZodObject<{
            title: z.ZodString;
            url: z.ZodString;
            snippet: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    "web.capabilities": z.ZodRecord<z.ZodString, z.ZodType<import("../core/json.js").JsonValue, unknown, z.core.$ZodTypeInternals<import("../core/json.js").JsonValue, unknown>>>;
    "user_events.track": z.ZodObject<{
        status: z.ZodString;
    }, z.core.$strip>;
};
type NativeInputSchemaFor<Method extends NativeRpcMethod> = (typeof nativeInputSchemas)[Method];
type NativeOutputSchemaFor<Method extends NativeRpcMethod> = Method extends keyof typeof nativeOutputSchemas ? (typeof nativeOutputSchemas)[Method] : never;
type NativeParamsFor = "required";
type NativeContractFor<Method extends NativeRpcMethod> = RpcContract<Method, NativeInputSchemaFor<Method>, NativeOutputSchemaFor<Method>, NativeParamsFor>;
/** Complete native RPC contract map. */
export declare const rpcContracts: {
    readonly "ai_models.directory.language.list": RpcContract<"ai_models.directory.language.list", z.ZodObject<{}, z.core.$strip>, z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        displayName: z.ZodString;
        dataBoundary: z.ZodEnum<{
            device_only: "device_only";
            cloud_allowed: "cloud_allowed";
        }>;
        contextTokens: z.ZodNumber;
        capabilities: z.ZodObject<{
            tools: z.ZodBoolean;
            vision: z.ZodBoolean;
            reasoning: z.ZodBoolean;
            structuredOutput: z.ZodBoolean;
        }, z.core.$strip>;
        available: z.ZodBoolean;
        isGlobalDefault: z.ZodBoolean;
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
        providerConnectionId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, z.core.$strip>>, "required">;
    readonly "ai_models.directory.embedding.list": RpcContract<"ai_models.directory.embedding.list", z.ZodObject<{}, z.core.$strip>, z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        displayName: z.ZodString;
        dataBoundary: z.ZodEnum<{
            device_only: "device_only";
            cloud_allowed: "cloud_allowed";
        }>;
        dimensions: z.ZodNumber;
        normalization: z.ZodEnum<{
            none: "none";
            l2: "l2";
        }>;
        revision: z.ZodString;
        available: z.ZodBoolean;
    }, z.core.$strip>>, "required">;
    readonly "ai_models.directory.language_default.get": RpcContract<"ai_models.directory.language_default.get", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
        modelId: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>, "required">;
    readonly "ai_models.preferences.language.get": RpcContract<"ai_models.preferences.language.get", z.ZodObject<{}, z.core.$strip>, z.ZodDiscriminatedUnion<[z.ZodObject<{
        mode: z.ZodLiteral<"inherit">;
        modelId: z.ZodNull;
    }, z.core.$strip>, z.ZodObject<{
        mode: z.ZodLiteral<"model">;
        modelId: z.ZodString;
    }, z.core.$strip>], "mode">, "required">;
    readonly "ai_models.preferences.language.set": RpcContract<"ai_models.preferences.language.set", z.ZodObject<{
        modelId: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>, z.ZodDiscriminatedUnion<[z.ZodObject<{
        mode: z.ZodLiteral<"inherit">;
        modelId: z.ZodNull;
    }, z.core.$strip>, z.ZodObject<{
        mode: z.ZodLiteral<"model">;
        modelId: z.ZodString;
    }, z.core.$strip>], "mode">, "required">;
    readonly "credits.balance.get": RpcContract<"credits.balance.get", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
        userId: z.ZodString;
        limitMicros: z.ZodNumber;
        remainingMicros: z.ZodNumber;
    }, z.core.$strip>, "required">;
    readonly "search.indexing_status": RpcContract<"search.indexing_status", z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
        indexed: z.ZodInt;
        total: z.ZodInt;
        pending: z.ZodInt;
        percent: z.ZodInt;
        model: z.ZodString;
        status: z.ZodEnum<{
            idle: "idle";
            indexing: "indexing";
        }>;
        activeModelId: z.ZodNullable<z.ZodString>;
        lifecycleState: z.ZodEnum<{
            ready: "ready";
            failed: "failed";
            unconfigured: "unconfigured";
            catching_up: "catching_up";
            reconfiguring: "reconfiguring";
        }>;
        generation: z.ZodInt;
        lastFailure: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>, "required">;
    readonly "search.model_status": RpcContract<"search.model_status", z.ZodObject<{}, z.core.$strip>, z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        downloaded: z.ZodBoolean;
        downloadSize: z.ZodNullable<z.ZodString>;
        diskUsage: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>, "required">;
    readonly "skills.list": RpcContract<"skills.list", z.ZodObject<{}, z.core.$strip>, z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        description: z.ZodString;
    }, z.core.$strip>>, "required">;
    readonly "skills.list_files": RpcContract<"skills.list_files", z.ZodObject<{
        id: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        files: z.ZodArray<z.ZodString>;
    }, z.core.$strip>, "required">;
    readonly "skills.read": RpcContract<"skills.read", z.ZodObject<{
        id: z.ZodString;
        path: z.ZodDefault<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        content: z.ZodString;
        truncated: z.ZodBoolean;
    }, z.core.$strip>, "required">;
    readonly "agent.implementations": NativeContractFor<"agent.implementations">;
    readonly "agent.limits.get": NativeContractFor<"agent.limits.get">;
    readonly "agent.models.list": NativeContractFor<"agent.models.list">;
    readonly "ai_models.catalog": NativeContractFor<"ai_models.catalog">;
    readonly "ai_models.catalog_models": NativeContractFor<"ai_models.catalog_models">;
    readonly "ai_models.get_defaults": NativeContractFor<"ai_models.get_defaults">;
    readonly "ai_models.list_models": NativeContractFor<"ai_models.list_models">;
    readonly "ai_models.list_providers": NativeContractFor<"ai_models.list_providers">;
    readonly "ai_models.subscription_status": NativeContractFor<"ai_models.subscription_status">;
    readonly "allowlist.add": NativeContractFor<"allowlist.add">;
    readonly "allowlist.delete": NativeContractFor<"allowlist.delete">;
    readonly "allowlist.get": NativeContractFor<"allowlist.get">;
    readonly "allowlist.list": NativeContractFor<"allowlist.list">;
    readonly "allowlist.update_access": NativeContractFor<"allowlist.update_access">;
    readonly "billing.ledger.query": NativeContractFor<"billing.ledger.query">;
    readonly "billing.limits.get": NativeContractFor<"billing.limits.get">;
    readonly "eval.capabilities": NativeContractFor<"eval.capabilities">;
    readonly "eval.fixture.invoke": NativeContractFor<"eval.fixture.invoke">;
    readonly "episodes.append_message": NativeContractFor<"episodes.append_message">;
    readonly "episodes.archive": NativeContractFor<"episodes.archive">;
    readonly "episodes.ask_user": NativeContractFor<"episodes.ask_user">;
    readonly "episodes.capabilities": NativeContractFor<"episodes.capabilities">;
    readonly "episodes.complete": NativeContractFor<"episodes.complete">;
    readonly "episodes.create": NativeContractFor<"episodes.create">;
    readonly "episodes.get": NativeContractFor<"episodes.get">;
    readonly "episodes.link_entity": NativeContractFor<"episodes.link_entity">;
    readonly "episodes.list": NativeContractFor<"episodes.list">;
    readonly "episodes.list_for_entity": NativeContractFor<"episodes.list_for_entity">;
    readonly "episodes.model.set": NativeContractFor<"episodes.model.set">;
    readonly "episodes.search": NativeContractFor<"episodes.search">;
    readonly "episodes.set_status": NativeContractFor<"episodes.set_status">;
    readonly "episodes.set_title": NativeContractFor<"episodes.set_title">;
    readonly "episodes.stop": NativeContractFor<"episodes.stop">;
    readonly "episodes.subtree": NativeContractFor<"episodes.subtree">;
    readonly "episodes.summary.get": NativeContractFor<"episodes.summary.get">;
    readonly "episodes.summary.refresh": NativeContractFor<"episodes.summary.refresh">;
    readonly "episodes.todo.get": NativeContractFor<"episodes.todo.get">;
    readonly "episodes.todo.update": NativeContractFor<"episodes.todo.update">;
    readonly "episodes.unarchive": NativeContractFor<"episodes.unarchive">;
    readonly "episodes.usage.query": NativeContractFor<"episodes.usage.query">;
    readonly "episodes.wait.resolve": NativeContractFor<"episodes.wait.resolve">;
    readonly "extensions.get": NativeContractFor<"extensions.get">;
    readonly "extensions.list": NativeContractFor<"extensions.list">;
    readonly "file.upload": NativeContractFor<"file.upload">;
    readonly "graph.approve": NativeContractFor<"graph.approve">;
    readonly "graph.capabilities": NativeContractFor<"graph.capabilities">;
    readonly "graph.entity.archive": NativeContractFor<"graph.entity.archive">;
    readonly "graph.entity.get": NativeContractFor<"graph.entity.get">;
    readonly "graph.entity.links": NativeContractFor<"graph.entity.links">;
    readonly "graph.entity.pin": NativeContractFor<"graph.entity.pin">;
    readonly "graph.entity.unarchive": NativeContractFor<"graph.entity.unarchive">;
    readonly "graph.entity.unpin": NativeContractFor<"graph.entity.unpin">;
    readonly "graph.entity.update_properties": NativeContractFor<"graph.entity.update_properties">;
    readonly "graph.find": NativeContractFor<"graph.find">;
    readonly "graph.get": NativeContractFor<"graph.get">;
    readonly "graph.link.add": NativeContractFor<"graph.link.add">;
    readonly "graph.links": NativeContractFor<"graph.links">;
    readonly "graph.search": NativeContractFor<"graph.search">;
    readonly "graph.withdraw": NativeContractFor<"graph.withdraw">;
    readonly "groups.add_member": NativeContractFor<"groups.add_member">;
    readonly "groups.capabilities": NativeContractFor<"groups.capabilities">;
    readonly "groups.create": NativeContractFor<"groups.create">;
    readonly "groups.delete": NativeContractFor<"groups.delete">;
    readonly "groups.get": NativeContractFor<"groups.get">;
    readonly "groups.list": NativeContractFor<"groups.list">;
    readonly "groups.list_for_entity": NativeContractFor<"groups.list_for_entity">;
    readonly "groups.list_members": NativeContractFor<"groups.list_members">;
    readonly "groups.remove_member": NativeContractFor<"groups.remove_member">;
    readonly "groups.resolve_identity": NativeContractFor<"groups.resolve_identity">;
    readonly "groups.update": NativeContractFor<"groups.update">;
    readonly "groups.update_bio": NativeContractFor<"groups.update_bio">;
    readonly "groups.update_memory": NativeContractFor<"groups.update_memory">;
    readonly "hooks.create": NativeContractFor<"hooks.create">;
    readonly "hooks.delete": NativeContractFor<"hooks.delete">;
    readonly "hooks.list": NativeContractFor<"hooks.list">;
    readonly "hooks.update": NativeContractFor<"hooks.update">;
    readonly "identity.create": NativeContractFor<"identity.create">;
    readonly "identity.delete": NativeContractFor<"identity.delete">;
    readonly "identity.list": NativeContractFor<"identity.list">;
    readonly "identity.update": NativeContractFor<"identity.update">;
    readonly "memory.capabilities": NativeContractFor<"memory.capabilities">;
    readonly "memory.confirm": NativeContractFor<"memory.confirm">;
    readonly "memory.diagnostics": NativeContractFor<"memory.diagnostics">;
    readonly "memory.forget": NativeContractFor<"memory.forget">;
    readonly "memory.list": NativeContractFor<"memory.list">;
    readonly "memory.reject": NativeContractFor<"memory.reject">;
    readonly "memory.save": NativeContractFor<"memory.save">;
    readonly "memory.search": NativeContractFor<"memory.search">;
    readonly "module_settings.list": NativeContractFor<"module_settings.list">;
    readonly "runtime.composer.setPresence": NativeContractFor<"runtime.composer.setPresence">;
    readonly "search.by_graph": NativeContractFor<"search.by_graph">;
    readonly "search.capabilities": NativeContractFor<"search.capabilities">;
    readonly "search.combined": NativeContractFor<"search.combined">;
    readonly "search.fast": NativeContractFor<"search.fast">;
    readonly "search.hybrid": NativeContractFor<"search.hybrid">;
    readonly "setup.get": NativeContractFor<"setup.get">;
    readonly "setup.update": NativeContractFor<"setup.update">;
    readonly "skills.capabilities": NativeContractFor<"skills.capabilities">;
    readonly "source.accounts.disconnect": NativeContractFor<"source.accounts.disconnect">;
    readonly "source.accounts.provision": NativeContractFor<"source.accounts.provision">;
    readonly "source.auth.exec": NativeContractFor<"source.auth.exec">;
    readonly "source.auth.oauth.complete": NativeContractFor<"source.auth.oauth.complete">;
    readonly "source.auth.session.cancel": NativeContractFor<"source.auth.session.cancel">;
    readonly "source.auth.session.open": NativeContractFor<"source.auth.session.open">;
    readonly "source.auth.submit": NativeContractFor<"source.auth.submit">;
    readonly "source.keys.list": NativeContractFor<"source.keys.list">;
    readonly "source.keys.set": NativeContractFor<"source.keys.set">;
    readonly "source.list": NativeContractFor<"source.list">;
    readonly "source.status.list": NativeContractFor<"source.status.list">;
    readonly "source.sync.bootstrap": NativeContractFor<"source.sync.bootstrap">;
    readonly "subagents.create": NativeContractFor<"subagents.create">;
    readonly "subagents.delete": NativeContractFor<"subagents.delete">;
    readonly "subagents.list": NativeContractFor<"subagents.list">;
    readonly "subagents.update": NativeContractFor<"subagents.update">;
    readonly "subagents.roster": NativeContractFor<"subagents.roster">;
    readonly "episodes.delegate": NativeContractFor<"episodes.delegate">;
    readonly "episodes.report": NativeContractFor<"episodes.report">;
    readonly "triggers.capabilities": NativeContractFor<"triggers.capabilities">;
    readonly "triggers.fire_history": NativeContractFor<"triggers.fire_history">;
    readonly "triggers.fire_now": NativeContractFor<"triggers.fire_now">;
    readonly "triggers.invalidate_cache": NativeContractFor<"triggers.invalidate_cache">;
    readonly "triggers.resolve_watchable": NativeContractFor<"triggers.resolve_watchable">;
    readonly "triggers.validate_schedule": NativeContractFor<"triggers.validate_schedule">;
    readonly "triggers.validate_watch": NativeContractFor<"triggers.validate_watch">;
    readonly "user_events.track": NativeContractFor<"user_events.track">;
    readonly "web.capabilities": NativeContractFor<"web.capabilities">;
    readonly "web.link.get": NativeContractFor<"web.link.get">;
    readonly "web.link.open": NativeContractFor<"web.link.open">;
    readonly "web.search": NativeContractFor<"web.search">;
};
export type MagnisRpcMethod = keyof typeof rpcContracts & string;
export type MagnisRpcContracts = typeof rpcContracts;
export {};
//# sourceMappingURL=registry.d.ts.map