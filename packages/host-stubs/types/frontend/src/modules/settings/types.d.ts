export type { AiProviderConnectionInfo, AiLogicalModelAdminInfo, AiCatalogCandidateInfo, OllamaLibraryPage, OllamaLibraryFamily, OllamaLibraryVariantsPage, OllamaLibraryVariant, OllamaModelPull, AiModel, AiProvider, CatalogModel, CatalogProvider, ModelCatalogPage as CatalogResponse, ModelDefault, } from "@magnis/sdk/core/ai-model";
import type { rpcContracts } from "@magnis/sdk";
import type { RpcOutputFor } from "@magnis/sdk/rpc/contract";
export type Hook = RpcOutputFor<(typeof rpcContracts)["hooks.create"]>;
export type SubscriptionStatus = RpcOutputFor<(typeof rpcContracts)["ai_models.subscription_status"]>;
export type AllowlistEntry = RpcOutputFor<(typeof rpcContracts)["allowlist.get"]>;
export type { EnumOption, ModuleSettingField, ModuleSettingFieldType, ModuleSettingsEntry, ModuleSettingsSchema, ModuleSettingValue, } from "@magnis/sdk";
