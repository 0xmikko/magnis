import type { ComponentType, ReactNode } from "react";
import type { StoreApi } from "zustand/vanilla";
import type { IconName } from "../../components/ui/Icon";
import type { AvatarColor, FacetSummary, LinkedEntitySummary } from "./sharedTypes";
import type { AgentRendererProps, AllowlistTarget, EntityRendererProps, ModuleAgentContribution, ToolCallRendererPayload } from "../../runtime/contracts/agent";
import type { AppRuntime } from "../../runtime/contracts/runtime";
import type { EntityLinkContribution } from "../../runtime/contracts/module";
export interface ListItem {
    readonly id: string;
    readonly name: string | null;
    readonly schema_id: string;
    readonly preview?: string | null;
    readonly timestamp?: string | null;
    readonly avatar_url?: string | null;
    readonly is_pinned?: boolean;
    readonly is_archived?: boolean;
    readonly unread_count?: number;
    readonly metadata?: Readonly<Record<string, unknown>>;
}
export interface ModuleQueryKeys {
    readonly all: readonly unknown[];
    list(params?: Record<string, unknown>): readonly unknown[];
    detail(id: string): readonly unknown[];
}
export interface ToolCallRendererRegistration {
    /** Action suffixes — module prefix added automatically.
     *  e.g. in notes module: ["create", "update"] → "notes.create", "notes.update" */
    readonly actions: readonly string[];
    readonly Render: ComponentType<AgentRendererProps<ToolCallRendererPayload>>;
}
export interface LinkedEntityDisplayConfig {
    readonly label?: string;
    readonly maxItems?: number;
    readonly linkKinds?: readonly string[];
    readonly sortBy?: "name" | "created_at";
    readonly hidden?: boolean;
}
export interface DetailPanelProps {
    readonly entityId: string;
    readonly moduleId: string;
    readonly runtime: AppRuntime;
}
export interface ListItemContentProps {
    readonly item: ListItem;
    readonly selected: boolean;
}
export interface HeaderComponentProps {
    readonly entityId: string | undefined;
    readonly entityName: string | null;
    readonly moduleId: string;
    readonly themeColor: AvatarColor;
    readonly runtime: AppRuntime;
    /** When provided, title is editable. Called with new name on commit. */
    readonly onRename?: (name: string) => void;
}
export interface RightPaneProps {
    readonly selectedId: string | undefined;
    readonly runtime: AppRuntime;
}
export type { ContextMenuEntry } from "../../components/ui/ContextMenu";
export type ModuleId = "companies" | "contacts" | "email" | "episodes" | "file" | "groups" | "inbox" | "meetings" | "notes" | "projects" | "settings" | "telegram" | "linkedin" | "x";
export interface ModuleConfig {
    readonly id: ModuleId;
    readonly title: string;
    readonly icon: ReactNode;
    readonly iconName: IconName;
    readonly themeColor: AvatarColor;
    /** Entity type suffixes — module id is prefix.
     *  e.g. id="contacts", entityTypes=["person"] → schema "contacts.person" */
    readonly entityTypes: readonly string[];
    /** Primary entity type suffix for list/detail. e.g. "person" → "contacts.person" */
    readonly primaryEntityType: string;
    /** Override auto-generated schema IDs. When set, these are used instead of
     *  `${id}.${entityType}` for invalidation and entity renderers.
     *  Use when a module displays entities owned by another module (e.g. Inbox → episodes.episode). */
    readonly schemas?: readonly string[];
    /** Per-entity-type visual info. Key = entity type suffix.
     *  e.g. { person: { icon: "user", label: "Contact" }, address: { icon: "mail", label: "Address", tabLabel: "Addresses" } }
     *  If omitted, uses module iconName + title as defaults. */
    readonly entityLabels?: Readonly<Record<string, {
        readonly icon?: import("../../components/ui/Icon").IconName;
        readonly label?: string;
        readonly tabLabel?: string;
        /**
         * Per-entity-type single renderer (see `docs/frontend/module-standard.md`).
         * Renders BOTH compact and expanded layouts internally via ExpansionContext.
         */
        readonly EntityCard?: ComponentType<EntityRendererProps>;
        /** Per-entity-type predicate deciding whether `ExpandableEntityCard`
         *  shows the chevron for this payload. */
        readonly hasMore?: (data: Readonly<Record<string, unknown>>, runtime: AppRuntime) => boolean;
    }>>;
    /** Extra params merged into every list RPC call (e.g. status filter for inbox) */
    readonly rpcListParams?: Readonly<Record<string, unknown>>;
    /** RPC method names — default: `${id}.list`, `${id}.get`, etc. */
    readonly rpc?: Partial<{
        list: string;
        get: string;
        create: string;
        update: string;
        delete: string;
    }>;
    /** Custom param builder for rename RPC. Default: `(id, name) => ({ id, name })`. */
    readonly mapRenameParams?: (id: string, name: string) => Record<string, unknown>;
    /** Enable "Rename" in list context menu. Requires rpc.update to be set. Default: false. */
    readonly enableListRename?: boolean;
    /** Custom list item content (default: BaseListItem) */
    readonly ListItemContent?: ComponentType<ListItemContentProps>;
    /** Custom detail panel (default: EntityDetailTabs) */
    readonly DetailPanel?: ComponentType<DetailPanelProps>;
    /** Custom content for a leading "Details" tab placed BEFORE the
     *  default Description / Memory tabs. Used by contacts to surface
     *  emails / phones / birthday in a Google-Contacts-style column. */
    readonly DetailsTabContent?: ComponentType<{
        readonly entityId: string;
        readonly facets: readonly FacetSummary[];
        readonly linkedEntities: readonly LinkedEntitySummary[];
    }>;
    /** Optional predicate — when present and returns false for the
     *  current entity, the Overview tab is suppressed and the entity
     *  shows the standard Description / Memory tabs instead. Used by
     *  companies: with zero enrichment the Overview tab degenerates
     *  to just a description, so we fall back to the plain layout. */
    readonly shouldShowDetailsTab?: (args: {
        readonly facets: readonly FacetSummary[];
        readonly linkedEntities: readonly LinkedEntitySummary[];
    }) => boolean;
    /**
     * THE single entity card for this module. Per `docs/frontend/module-standard.md`
     * the same component renders BOTH compact and expanded states by reading
     * `ExpansionContext` internally. Default: BaseEntityCard.
     */
    readonly EntityCard?: ComponentType<EntityRendererProps>;
    /** Predicate deciding whether `ExpandableEntityCard` shows the expand chevron.
     *  When omitted no chevron is shown — the card always renders compact. */
    readonly hasMore?: (data: Readonly<Record<string, unknown>>, runtime: AppRuntime) => boolean;
    /** Custom header component */
    readonly HeaderComponent?: ComponentType<HeaderComponentProps>;
    /** Detail type — "entity-tabs" uses EntityDetailTabs, "custom" uses DetailPanel as-is */
    readonly detailType?: "entity-tabs" | "custom";
    /** Header actions (e.g. "+" create button) rendered in list pane header.
     *  Can be a ReactNode or a component that receives runtime + selection helpers. */
    readonly HeaderActions?: ComponentType<{
        runtime: AppRuntime;
        onCreated?: (id: string) => void;
    }>;
    /** Icon-only header action button (replaces HeaderActions component) */
    readonly headerActionIcon?: IconName;
    /** Callback for icon-only header action button */
    readonly onHeaderAction?: (runtime: AppRuntime, onCreated: (id: string) => void) => void;
    /** Custom right pane component (replaces AgentPanel when visible) */
    readonly RightPaneComponent?: ComponentType<RightPaneProps>;
    /** Agent draft request handler */
    readonly onDraftRequest?: ModuleAgentContribution["onDraftRequest"];
    /** Additional context menu items */
    readonly contextMenuItems?: (entity: ListItem) => readonly import("../../components/ui/ContextMenu").ContextMenuEntry[];
    /** Declarative "Link to X" context-menu submenu this module contributes
     *  (e.g. groups → "Link to Group", projects → "Link to Project"). The
     *  generic entity context menu discovers all contributors automatically. */
    readonly entityLink?: EntityLinkContribution;
    /** Additional store state beyond selectedId + searchQuery */
    readonly extendStore?: (set: (partial: Record<string, unknown>) => void, get: () => Record<string, unknown>) => Record<string, unknown>;
    /** Additional setup beyond prefetch + invalidation */
    readonly extraSetup?: (runtime: AppRuntime) => void | (() => void);
    /** Transform backend response to ListItem */
    readonly mapListItem?: (item: Record<string, unknown>) => ListItem;
    /** Facet schema for description tab (default: `${id}.description`) */
    readonly descriptionSchema?: string;
    /** Facet schema for memory tab (default: `${id}.memory`) */
    readonly memorySchema?: string;
    /** Agent tool call renderers */
    readonly toolCallRenderers?: readonly ToolCallRendererRegistration[];
    /** Allowlist target extractor for agent tool approval */
    readonly extractAllowlistTarget?: (toolCall: {
        name: string;
        args: unknown;
    }) => AllowlistTarget | null;
    /** How each entity type appears in other modules' linked entity tabs */
    readonly linkedEntityDisplay?: Record<string, LinkedEntityDisplayConfig>;
    /** Group list items by date or first letter. Renders separators between groups. */
    readonly groupBy?: "date" | "letter";
    /** Extract date from list item — required when groupBy="date". */
    readonly getGroupDate?: (item: ListItem) => Date | null;
    /** Extract sort key from list item — required when groupBy="letter". */
    readonly getGroupLetter?: (item: ListItem) => string;
    /** Agent system prompt for this module */
    readonly systemPrompt?: string;
    /** Agent navigateToEntity override (default: router navigate) */
    readonly navigateToEntity?: ModuleAgentContribution["navigateToEntity"];
}
export interface SidebarModuleDefinition<TState = unknown> {
    readonly id: string;
    readonly title: string;
    readonly icon: ReactNode;
    readonly iconName: IconName;
    readonly themeColor: AvatarColor;
    readonly Component: ComponentType;
    createStore(runtime: AppRuntime): StoreApi<TState>;
    setup(runtime: AppRuntime, store: StoreApi<TState>): void | (() => void) | Promise<void | (() => void)>;
    readonly agent: ModuleAgentContribution & {
        readonly entityRenderers: readonly import("../../runtime/contracts/agent").EntityRendererRegistration[];
    };
    readonly schemas: readonly string[];
    readonly queryKeys: ModuleQueryKeys;
}
export interface HeadlessModuleDefinition {
    readonly id: string;
    readonly title: string;
    readonly agent: ModuleAgentContribution;
    readonly schemas: readonly string[];
    setup?(runtime: AppRuntime): void | (() => void);
}
export type StrictModuleDefinition = SidebarModuleDefinition | HeadlessModuleDefinition;
