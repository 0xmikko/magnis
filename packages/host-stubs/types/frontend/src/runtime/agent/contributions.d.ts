/**
 * Agent contribution registry — runtime implementation.
 *
 * Modules register their agent contributions (history renderers, todo renderers,
 * context actions, entity resolvers, draft handlers) through this registry.
 * The AgentPanel host resolves renderers through this registry instead of
 * hardcoding module-specific branches.
 */
import type { AgentHistoryBlock, AgentHistoryRendererRegistration, AgentTodoItem, AgentTodoRendererRegistration, ModuleAgentContribution, AgentContextAction, AgentEntityContextResolver, AllowlistTarget, AppRuntime, EntityRendererRegistration } from "../contracts";
export declare class AgentContributionRegistry {
    private readonly contributions;
    register(moduleId: string, contribution: ModuleAgentContribution): () => void;
    resolveHistoryRenderer(block: AgentHistoryBlock): AgentHistoryRendererRegistration | null;
    resolveTodoRenderer(item: AgentTodoItem): AgentTodoRendererRegistration | null;
    resolveSystemPrompt(moduleId: string): string | undefined;
    getContextActions(moduleId: string): readonly AgentContextAction[];
    getEntityContextResolvers(): readonly AgentEntityContextResolver[];
    resolveEntityRenderer(schemaId: string): EntityRendererRegistration | null;
    navigateToEntity(schemaId: string, entityId: string, data: Readonly<Record<string, unknown>>, runtime: AppRuntime, navigate: (moduleId: string, entityType?: string, entityId?: string) => void): boolean;
    resolveAllowlistTarget(toolCall: {
        name: string;
        args: unknown;
    }): AllowlistTarget | null;
    handleDraftRequest(targetModuleId: string, payload: unknown, runtime: AppRuntime): boolean;
    hasContribution(moduleId: string): boolean;
    listModuleIds(): string[];
}
