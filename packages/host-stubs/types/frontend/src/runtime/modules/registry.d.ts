import type { AppRuntime, ModuleAgentContribution, ModuleRegistry, ModuleStoreRegistry } from "../contracts";
interface ExtensionAgentRegistry {
    registerContribution(moduleId: string, contribution: ModuleAgentContribution): () => void;
}
export declare function createModuleRegistry(runtimeRef: {
    current: AppRuntime | null;
}, stores: ModuleStoreRegistry, agent: ExtensionAgentRegistry): ModuleRegistry;
export declare function createModuleStoreRegistry(): ModuleStoreRegistry;
export {};
