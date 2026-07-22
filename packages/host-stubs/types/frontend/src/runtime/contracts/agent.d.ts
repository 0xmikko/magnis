import type { ComponentType } from "react";
import type { StoreApi } from "zustand/vanilla";
import type { AppRuntime } from "./runtime";
import type { ReplyToContext } from "../../modules/episodes/types";
export type { AgentContextDescriptor, AgentInvocationInput, AgentDraftRequest, AgentHistoryBlock, AgentTodoItem, AllowlistTarget, AgentRuntimeState, AgentChatStoreApi, } from "@magnis/agent-core";
import type { AgentContextDescriptor, AgentHistoryBlock, AgentTodoItem, AllowlistTarget, AgentRuntimeState, AgentChatStoreApi, AgentInvocationInput, AgentDraftRequest } from "@magnis/agent-core";
export interface AgentRendererProps<TPayload = unknown> {
    readonly payload: TPayload;
    readonly runtime: AppRuntime;
    readonly agent: AgentRuntime;
}
export interface AgentHistoryRendererRegistration<TPayload = unknown> {
    readonly id: string;
    readonly moduleId: string;
    readonly match: (block: AgentHistoryBlock) => boolean;
    readonly Render: ComponentType<AgentRendererProps<TPayload>>;
    readonly priority?: number;
}
export interface AgentTodoRendererRegistration<TPayload = unknown> {
    readonly id: string;
    readonly moduleId: string;
    readonly kind: string;
    readonly Render: ComponentType<AgentRendererProps<TPayload>>;
}
export interface AgentContextAction {
    readonly id: string;
    readonly label: string;
    readonly run: (input: {
        runtime: AppRuntime;
        context: AgentContextDescriptor;
        payload?: unknown;
    }) => void | Promise<void>;
}
export interface AgentEntityContextResolver {
    readonly entityType: string;
    resolve: (input: {
        entityId: string;
        runtime: AppRuntime;
    }) => AgentContextDescriptor | Promise<AgentContextDescriptor | null> | null;
}
export interface EntityRendererProps {
    readonly schemaId: string;
    readonly data: Readonly<Record<string, unknown>>;
    readonly runtime: AppRuntime;
    /**
     * Optional verb prefix injected by the chat surface when the card
     * represents the result of an approved tool-call ("Send", "Reply",
     * "Create", "Update"). Rendered bold before the title in the
     * compact layout. Cards that don't care simply ignore the prop.
     */
    readonly action?: string;
}
export interface EntityRendererRegistration {
    readonly id: string;
    readonly moduleId: string;
    readonly schemaMatch: string | ((schemaId: string) => boolean);
    /**
     * THE single renderer for the schema. Per `docs/frontend/module-standard.md`
     * ("ONE COMPONENT PER ENTITY"), this component must internally render BOTH
     * its compact and expanded layouts by reading `ExpansionContext`. No sibling
     * "expanded" component exists.
     */
    readonly Render: ComponentType<EntityRendererProps>;
    /**
     * Predicate controlling whether `ExpandableEntityCard` shows the chevron
     * for a given attachment payload. When false the card always renders in
     * its compact form; when true the wrapper toggles `ExpansionContext.expanded`
     * and the SAME `Render` re-renders its expanded layout in place. Must be pure.
     */
    readonly hasMore?: (data: Readonly<Record<string, unknown>>, runtime: AppRuntime) => boolean;
}
export type EntityNavigationHandler = (entityId: string, schemaId: string, data: Readonly<Record<string, unknown>>, runtime: AppRuntime, navigate: (moduleId: string, entityType?: string, entityId?: string) => void) => void | Promise<void>;
export interface ModuleAgentContribution {
    readonly systemPrompt?: string;
    readonly historyRenderers?: readonly AgentHistoryRendererRegistration[];
    readonly todoRenderers?: readonly AgentTodoRendererRegistration[];
    readonly contextActions?: readonly AgentContextAction[];
    readonly entityRenderers?: readonly EntityRendererRegistration[];
    readonly entityContextResolvers?: readonly AgentEntityContextResolver[];
    readonly navigateToEntity?: EntityNavigationHandler;
    readonly onDraftRequest?: (payload: unknown, runtime: AppRuntime) => void;
    readonly extractAllowlistTarget?: (toolCall: {
        name: string;
        args: unknown;
    }) => AllowlistTarget | null;
}
export interface ToolCallRendererPayload {
    readonly toolCall: {
        readonly id: string;
        readonly name: string;
        readonly args: unknown;
        readonly status: "pending" | "approved" | "denied";
        readonly chatName?: string;
    };
    readonly toolResult?: {
        readonly id: string;
        readonly result: unknown;
    };
    readonly isAllowlisted: boolean;
    readonly selectedChatName?: string;
    readonly superseded?: boolean;
    readonly onApprove: (argumentsOverride?: unknown) => Promise<void> | void;
    readonly onDeny: () => Promise<void> | void;
    readonly onEdit: () => void;
    readonly onAllowlistToggle: () => void;
}
export interface ComposerPresenceParams {
    readonly mode: "email" | "telegram";
    readonly thread_key: string;
}
/**
 * Payload of a `composer.apply` event as delivered to `onApply` subscribers.
 * Mirrors `ComposerApplyEvent` in `composerApplyHandler.ts` but lives on the
 * runtime contract so modules can subscribe without reaching into the
 * composer package.
 */
export interface ComposerApplyEventPayload {
    readonly mode: "email" | "telegram";
    readonly thread_key: string;
    readonly revision: number;
    readonly op: "set_text" | "append_text" | "set_attachments";
    readonly text?: string;
    readonly attachment_ids?: readonly string[];
}
export interface ComposerRuntimeSurface {
    /**
     * Announce or retire the currently-mounted composer.
     *
     * Backend stores the presence per user_id; scoped apply events are
     * filtered by matching (mode, thread_key) against the mounted composer.
     * Pass `null` on unmount (or before re-mounting on a different key).
     */
    setPresence(params: ComposerPresenceParams | null): void;
    /**
     * Subscribe to `composer.apply` events routed from the backend over the
     * WS event bus. Returns an unsubscribe fn. The WS filter on the backend
     * already restricts delivery to the authenticated user; subscribers only
     * need to filter on (mode, thread_key).
     */
    onApply(handler: (event: ComposerApplyEventPayload) => void): () => void;
}
export interface AgentRuntime {
    readonly store: StoreApi<AgentRuntimeState>;
    readonly chat: AgentChatStoreApi;
    registerContribution(moduleId: string, contribution: ModuleAgentContribution): () => void;
    setActiveContext(context: AgentContextDescriptor | null): void;
    setReplyTo(replyTo: ReplyToContext | null): void;
    send(input: AgentInvocationInput): Promise<void>;
    approveToolCall(contextKey: string, toolCallId: string, argumentsOverride?: unknown): Promise<void>;
    denyToolCall(contextKey: string, toolCallId: string): Promise<void>;
    requestDraft(request: AgentDraftRequest): void;
    resolveEntityRenderer(schemaId: string): EntityRendererRegistration | null;
    navigateToEntity(schemaId: string, entityId: string, data: Readonly<Record<string, unknown>>, runtime: AppRuntime, navigate: (moduleId: string, entityType?: string, entityId?: string) => void): boolean;
    resolveHistoryRenderer(block: AgentHistoryBlock): AgentHistoryRendererRegistration | null;
    resolveTodoRenderer(item: AgentTodoItem): AgentTodoRendererRegistration | null;
    resolveAllowlistTarget(toolCall: {
        name: string;
        args: unknown;
    }): AllowlistTarget | null;
    resolveSystemPrompt(moduleId: string): string | undefined;
    dispatchContextAction(moduleId: string, actionId: string, payload?: unknown): void;
}
