# Adopt the knowledge graph contracts

Status: APPROVED  
Spec lock: sha256:86bdd075418f6d513691ea0e934ea58b82e9556e1f6abc81f2e425e47b2e54b2 owner:Минимальная модель (рекомендую)  
Implementation lock: sha256:894f3cd6d76575b899b51e56445f0e9f240cb7169b209075d5487ef94b9d50d4 owner:$blueprint-start  
Active Delivery: D1  
Unattended decisions: allowed  

<!-- plan:spec:start -->
## The Goal

1. Establish one English developer reference in `docs/vision.md`, with each type next to its behavior and exceptions, and use it as the migration contract for the app and plugin catalog.
2. Adopt explicit persistent/transient and derived types across the shared SDK and its consumers, then separate domain Entity values from requested operational extras without changing identity, evidence or access scope.
3. Migrate pin, archive, privacy, configured model trust and indexing projections and consolidate organizational membership relations into `belongs_to`; register domain-specific Link kinds in their modules, preserving sync choices, temporal history and repeat-ingestion behavior.
4. Give each Magnis auth user a canonical `users.user` Entity, connect people to it through `identity`, and maintain protected temporal `owner` Links through system GraphService functions only.
5. Bring Graph reads, Search, merge, extraction and workspace transfer onto those same boundaries; preserve deterministic replay and protected ownership. Generalize creation provenance to created and define communication facts. Describe the event/subscription/action boundary and the later migration from watches to subscriptions, reusing existing Trigger and Episode execution.
6. Publish compatible app/catalog changes through the existing SDK and package activation mechanism, with migration fixtures, scoped checks and the complete affected repository gates. Implementation begins only after the owner approves the SPEC and the resulting Delivery/Stage contract.

## Why now

The owner has defined the target graph in a sustained design discussion. Public Entity currently mixes knowledge with pin/archive/indexing state; identity, Source records and security users are represented at different boundaries. The request is to translate and restructure that reference, commit it, and prepare the migration plan. This commit changes documentation only.

The reference retains the inspected October 3–5 behavior and labels target/open rules. App `staging` inspected on October 6 at `3579a8fff765293bb14b421212552fca9800706b` still has Entity.owner, nullable isPinned/isArchived, boolean indexed and no canonicalKey in its Entity declaration. The earlier entity-one-type checkout is no longer present. Identity, entity-sync, auto-modules and WebSource work must be reconciled with their current owners before implementation; their presence in the document is not evidence they are merged into staging. Do not reimplement their approved work from an older snapshot.

Evidence owners:

| Finding | Inspected code / reference |
| --- | --- |
| Public flags and owner are part of Entity | App `packages/sdk/src/core/entity.ts`, `backend/src/core/entity.ts` |
| Viewer preference and domain rows differ | App `backend/src/db/schema/graph.ts`, `backend/src/db/repository-helpers.ts` |
| Auth users have secrets and a nil-ID default account | App `backend/src/db/schema/users.ts`, `services/users/default-user.ts`, `users.service.ts` |
| Exact identity/preparation and hub merge replay already exist in working branches | Reference sections 6–7; inspected identity/entity-one-type graph repository and merge PG scenarios 054/055 |
| Claims, pending/indexed/refused and temporal derivation exist in inspected working code | Reference sections 10–11; SDK indexing, Graph derive/claim.repository and search graph-indexer |
| Earlier privacy work is a contract, not a completed implementation | App `feat/private-entity-flag`, commit `2ea08b25957bbb3d60bdeb144d19f2d24d3d4665`; model trust replaces its local/cloud eligibility test by owner decision |
| Model execution metadata already exists; model trust does not | Identity checkout `packages/sdk/src/core/ai-model.ts`, `backend/src/agent/models/types.ts`, `ai-model-directory.service.ts` and `provider-model-catalog.source.ts`; existing `dataBoundary` comes from catalog metadata |
| Shared organizational membership and creation provenance | Owner retains belongs_to and replaces Episode → triggered_by → Trigger with Trigger → created → Episode; projects.belongs_to has matching member → project semantics |
| Communication changes the earlier chat-membership proposal | Current Telegram in_chat supplies conversation membership, not delivery direction/time; Google folds Date/internalDate into sent_at; email schema allows received_at |
| Trigger delivery requires a graph event contract | Identity Graph EventRepository/owner mutation revision and TriggersService; current EventBus is in-process, trigger.check is module-produced and live-only |
| Execution can be reused; selection and identity must change | October 7 inspection: TriggersService already calls EpisodesService.createTriggeredChild with action_prompt; firing identity uses Trigger ID plus event Entity ID; trigger_execution stores history |
| Current time admission differs from recording new knowledge | TriggersService requires context.occurred_at and compares it with Trigger creation time; the scheduler also emits trigger.check |
| Ending evidence can exist without a Link | GraphClaim.kind ending is persisted; deriveRelation returns no matching period without an assertion. GraphService.end updates an existing Link and emits link_updated |

## The target

### Interfaces

The following signatures declare migration differences, not new parallel SDKs. Definitions belong in the existing SDK owner files. Persistent-ID and Derived naming follow the owner decisions. Other proposals remain explicitly marked; the New names table records their reasons.

```typescript
// SDK core/entity.ts; Id and UuidShapeSchema remain canonical imports.
export const PersistentEntityIdSchema = UuidShapeSchema
  .refine((id: string) => id !== NIL_ID, "Persistent Entity ID must not be nil")
  .brand<"PersistentEntityId">();
export type PersistentEntityId = z.output<typeof PersistentEntityIdSchema>;
export type EntityId = PersistentEntityId | NilId;

// Auth identity is intentionally separate from the graph user's node.
export type AuthUserId = Id;
export type UserId = PersistentEntityId;

export interface UserEntityBinding {
  authUserId: AuthUserId;
  entityId: UserId;
}

export type Origin = "canonical" | "derived";

export interface DerivedStatement {
  origin: "derived";
  confidence: number;
  evidence: [PersistentEntityId, ...PersistentEntityId[]];
  validFrom: DateTimeUtc | null;
  validUntil: DateTimeUtc | null;
}
export interface DerivedEntity<P extends JsonValue = JsonValue>
  extends EntityBase<P>, DerivedStatement {
  keys: string[];
}
// Existing schemas keep their wire fields while their exported names become PascalCase.
export type SourceRef = z.output<typeof SourceRefSchema>;
export type LinkBase = z.output<typeof LinkBaseSchema>;
export type CanonicalLink = z.output<typeof CanonicalLinkSchema>;
export interface DerivedLink extends LinkBase, DerivedStatement {}
export type Link = CanonicalLink | DerivedLink;

// Existing compile-time proof; its diagnostic property follows SDK naming.
export type AssertEqual<A, B> = Equal<A, B> extends true
  ? true
  : { error: "schema drifted from type"; A: A; B: B };

// Internal deriveEntity result; not a graph Entity.
export interface EntityDerivation {
  eligible: boolean;
  reason: string | null;
  confidence: number;
  evidence: PersistentEntityId[];
}
export declare function deriveEntity(
  claims: readonly GraphClaim[],
  withdrawn: boolean,
): EntityDerivation;

export const derivedStatementSchema = z.strictObject({
  origin: z.literal("derived"),
  confidence: z.number().gt(0).lte(1),
  evidence: z.tuple([PersistentEntityIdSchema], PersistentEntityIdSchema),
  validFrom: dateTimeSchema.nullable(),
  validUntil: dateTimeSchema.nullable(),
});

// Existing generic Entity variants are renamed, not duplicated.
export type Entity<P extends JsonValue = JsonValue> =
  | CanonicalEntity<P>
  | DerivedEntity<P>;
export type PersistentEntity<P extends JsonValue = JsonValue> =
  Entity<P> & { id: PersistentEntityId };
export type TransientEntity<P extends JsonValue = JsonValue> =
  Entity<P> & { id: NilId };

// Same flat operational contract as reference section 2.
export type IndexingStatus = "pending" | "indexed" | "refused";
export interface EntityExtrasBase {
  pinOrder: number | null;
  archived: boolean;
  readonly indexed: IndexingStatus;
  private: boolean;
}
export interface Syncable {
  syncEnabled: boolean;
  syncRevision: string;
}
export type EntityExtras = EntityExtrasBase & (
  | Syncable
  | { syncEnabled: null; syncRevision: null }
);

export interface EntityRead<P extends JsonValue = JsonValue> {
  entity: PersistentEntity<P>;
  extras: EntityExtras;
}
export interface GraphReader {
  get(id: PersistentEntityId): Promise<PersistentEntity>;
  get(id: PersistentEntityId, options: { extras: true }): Promise<EntityRead>;
}

// Catalog plugin-sdk/contract/module.ts: existing methods keep their names.
// Commands accept canonical SDK schema inputs; the host validates and brands IDs.
export interface GraphService {
  getEntity(id: string, options: { extras: true }): Promise<EntityRead | null>;
  getEntity(id: string): Promise<PersistentEntity | null>;
  getEntities(ids: string[], options: { extras: true }): Promise<EntityRead[]>;
  getEntities(ids: string[]): Promise<PersistentEntity[]>;
  // Existing list, window, search and neighbor methods follow the same rule.
}
export interface SearchEntitiesPageParams<T = PersistentEntity> {
  extras?: true;
  query: string;
  schemaId: string;
  limit: number;
  offset: number;
  filter?: (entities: T[]) => Promise<T[]>;
}
// Test doubles use the final overload's argument/result union. Fixture builders
// construct complete SDK-validated values; response parsers supply no defaults.
export type GraphOverrides = {
  [K in keyof GraphService]?: (...args: Parameters<GraphService[K]>) => ReturnType<GraphService[K]>;
};

// Existing module DTO excerpts; unchanged fields remain in their owning files.
export interface ContactListItem { extras: EntityExtras; }
export interface NoteListItem { extras: EntityExtras; }
export interface NoteDetailView { extras: EntityExtras; }
export interface ProjectListItem { extras: EntityExtras; }
export interface ProjectDetailView { extras: EntityExtras; }
// Modules request extras themselves; their list/get RPC inputs stay unchanged.
// Detail DTOs preserve operational state when the selected row is outside the list page.
// modules/email/types.ts
export interface MessageListItem { extras: EntityExtras; }
export interface MessageDetailView {
  extras: EntityExtras;
  senderSync: (Syncable & { id: string }) | null;
}
export interface ContactSyncTarget {
  identityId: string;
  schemaId: string;
  name: string | null;
  state: ({ kind: "ready"; id: string } & Syncable)
    | { kind: "unavailable"; message: string };
}
export interface TelegramChatListItem {
  extras: EntityExtras & Syncable;
  // syncEnabled is the single Telegram message/attachment admission choice.
  // No downloadMedia or separate processing permission is exposed by this DTO.
}


// Existing Telegram UI types retain their other fields; remove isIndexed and
// onToggleIndexing. Retire SetIndexedParams and chats.set_indexed.
export interface TelegramChat { readonly syncEnabled: boolean; }
export interface TelegramChatDetails {
  // Stored legacy choice for initial selection/migration only.
  is_indexed?: boolean;
}
export interface TelegramChatViewProps {
  readonly syncEnabled?: boolean;
  readonly onToggleSync?: () => void;
}
// Owner decision: Telegram source admission via syncEnabled also admits automatic
// attachment downloads. Stopped chats cause neither message writes nor new file
// registrations. Keep stored data and syncRevision unchanged. Legacy is_indexed
// may only inform the existing one-time sync migration/initial-selection rule;
// after initialization it cannot override the saved sync choice. No new Graph
// processing-permission read API or EntityExtras field is introduced. The native
// legacy processing flag remains internal for other existing index/search uses.

// Add this required field to the existing SDK core/ai-model.ts types.
// These excerpts omit their unchanged fields.
export interface EmbeddingModelInfo {
  readonly private: boolean;
}
export interface LlmModelInfo {
  readonly private: boolean;
}

export type CreatedLink = Link & { kind: "created" };
export type BelongsToLink = Link & { kind: "belongs_to" };

// Existing SDK neighbor projection; unchanged fields omitted.
export interface LinkedEntitySummary {
  linkKind: LinkType;
  direction: "out" | "in";
}

// Account-scoped provider-message anchor; schema is email.message or telegram.message.
// Encoding: schemaId + ':' + JSON.stringify(accountId) + ':' + JSON.stringify(remoteId).
export function communicationMessageExternalId(
  schemaId: "email.message" | "telegram.message",
  accountId: string,
  remoteId: string,
): string;

// Runtime schemas: CommunicationMetadataSchema and CommunicationLinkSchema.
// Metadata keys are required; missing is not the same as explicitly unknown.
export interface EmailMailboxDetails {
  address: string | null;
}
export interface EmailThreadDetails {
  threadId: string;
}

// Email RPC parameter excerpts; Telegram already exposes account_id.
// Omission resolves only a single connected account; ambiguity is an error.
export interface SendParams { account_id?: string; }
export interface ReplyParams { account_id?: string; }
export interface BatchSendParams { account_id?: string; }

// Gmail domain payload extension; envelope, cursor and error protocol stay unchanged.
// Empty means the provider record does not establish transmission/delivery.
export interface MailMessage {
  communication: readonly {
    kind: "sent" | "received";
    occurredAt: string | null;
  }[];
}
// Telegram emits the same communication property on its message payload.
// An older Source payload without this property establishes no observation.

export type CommunicationLink = CanonicalLink & {
  kind: "sent" | "received";
  from: PersistentEntityId;
  to: PersistentEntityId;
  metadata: {
    occurredAt: DateTimeUtc | null;
    conversationId: PersistentEntityId | null;
  };
};

// GraphMutationEvent, GraphEventFilter, GraphSubscription and the event-driven
// TriggerExecution excerpt are declared in reference section 12.
// They describe the later logic story; this migration does not implement it.

export interface EntitySystemState {
  owner: AuthUserId; // Hidden existing SQL ownership scope.
}
export type UserEntityProperties = {
  name: string;
  surname: string | null;
};
export type UserEntity = CanonicalEntity<UserEntityProperties> & {
  id: UserId;
  schemaId: "users.user";
};
export interface TransferOwnershipRequest {
  entityId: PersistentEntityId;
  newOwnerId: UserId;
}
```

The Stage D1-S1/D1-S2 propagation uses the existing backend command, query, derivation and transfer types below. These excerpts declare the affected fields; omitted fields keep their canonical definitions in the named files. The existing auth owner types keep their current meaning until D1-S5 introduces the separate graph-user binding.

```typescript
// SDK core/id.ts: the existing unsaved sentinel, named for the EntityId union.
export type NilId = typeof NIL_ID;

// Backend core/graph-commands.ts. The existing bases retain their other fields.
interface CreateEntityBase<P extends JsonValue = JsonValue> {
  clientId: PersistentEntityId | null;
}
export type CreateEntityCommand<P extends JsonValue = JsonValue> =
  | (CreateEntityBase<P> & { origin: "canonical"; source: SourceRef })
  | (CreateEntityBase<P> & DerivedStatement & { keys: string[] });
interface AddLinkBase {
  from: PersistentEntityId;
  to: PersistentEntityId;
}
export type AddLinkCommand =
  | (AddLinkBase & CanonicalPeriod & { origin: "canonical"; metadata: JsonValue })
  | (AddLinkBase & DerivedStatement);
export interface EndLinkCommand {
  evidence: PersistentEntityId | null;
}
export interface HostGraphBatchResult extends GraphBatchResult {
  readonly stampMoves: readonly {
    readonly id: PersistentEntityId;
    readonly schema: SchemaId;
    readonly from: string;
  }[];
}

// Backend core/graph-query.ts.
export interface LinkedWindow extends GraphValidity {
  parent_id: PersistentEntityId;
}
export interface GraphTraversalQuery extends GraphValidity {
  startEntityIds: readonly PersistentEntityId[];
}
export interface GraphTraversalResult<T = PersistentEntity> {
  readonly entities: readonly T[];
  readonly links: readonly Link[];
}

// Backend services/graph/{claim.repository,derive,merge,types}.ts.
export interface ClaimTargets {
  entities: PersistentEntityId[];
  relations: Pick<ClaimedLink, "from" | "to" | "kind">[];
}
export interface DerivedPeriod {
  validFrom: DateTimeUtc | null;
  validUntil: DateTimeUtc | null;
  eligible: boolean;
  reason: string | null;
  confidence: number;
  evidence: PersistentEntityId[];
}
export interface MergeState {
  readonly survivor: PersistentEntity;
  readonly retired: PersistentEntity;
  readonly archivedIds: ReadonlySet<PersistentEntityId>;
  readonly links: readonly Link[];
  readonly symmetricKinds: ReadonlySet<string>;
  readonly canonicalIdentityHubs: ReadonlySet<PersistentEntityId>;
}
export interface GraphAuditQuery {
  readonly entityId: PersistentEntityId | null;
}

// Backend services/search/{types,graph-indexer}.ts.
export interface SearchSpec extends GraphValidity {
  extras?: true;
}
export interface GlobalSearchRequest extends GraphValidity {
  readonly extras?: true;
}
export interface StructuredSearchPage {
  items: (PersistentEntity & { extras?: EntityExtras })[];
  total: number | null;
  next: CursorPos | null;
}
export type SearchExecutionItem = PersistentEntity & {
  readonly extras?: EntityExtras;
  readonly relevance?: SearchExecutionEvidence;
};
export interface IndexingVocabulary {
  readonly schemas: readonly string[];
  readonly linkKinds: readonly string[];
  readonly candidates: readonly {
    readonly id: PersistentEntityId;
    readonly schemaId: string;
    readonly name: string | null;
  }[];
}
export type IndexingContextSource =
  (owner: string, source: PersistentEntity) => Promise<IndexingContext | null>;

// Existing configured model storage and administration hook.
export interface AiLogicalModelRecord {
  readonly private: boolean;
}
export interface UseAiModelsResult {
  readonly setPrivate: (modelId: string, trusted: boolean) => Promise<void>;
}

// Search carries freshly read model trust through its existing admission,
// selection and ranked-query boundaries, independently of index identity.
export interface SearchIndexStatusContext {
  readonly modelPrivate: boolean;
}
export interface ActiveSearchEmbeddingModel {
  readonly private: boolean;
}
export interface RankedSearchScope extends GraphValidity {
  readonly modelPrivate: boolean;
}

// Backend services/web/web.service.ts. Raw plugin URL inputs are admitted
// before their parent is decoded; a skipped URL does not use its parent.
export interface WebLinkRegistration {
  readonly url: string;
  readonly parentEntityId: PersistentEntityId | null;
  readonly linkKind: string | null;
}

// Backend core/workspace-transfer.ts and services/graph/types.ts.
// The v7 workspace format carries stored operational values explicitly.
// indexed remains the nullable SQL processing permission; it is not a read status.
interface WorkspaceEntityBase {
  key: PortableKey;
  created_at: WorkspaceTimestamp;
  indexed: boolean | null;
  pin_order: number | null;
  archived: boolean;
  private: boolean;
  sync_enabled: boolean | null;
  sync_revision: string | null;
  date: WorkspaceTimestamp | null;
}
export type WorkspaceDerivedStatement =
  SnakeFields<Omit<DerivedStatement, "evidence" | "validFrom" | "validUntil">> & {
    evidence: [string, ...string[]];
    valid_from: WorkspaceTimestamp | null;
    valid_until: WorkspaceTimestamp | null;
  };
export type WorkspaceEntity = WorkspaceEntityBase & (
  | SnakeFields<Omit<CanonicalEntity, "id" | "owner" | "createdAt" | "date" | "indexed">>
  | (SnakeFields<Omit<DerivedEntity,
      "id" | "owner" | "createdAt" | "date" | "indexed" | keyof DerivedStatement>>
      & WorkspaceDerivedStatement)
);
export type WorkspaceLink = WorkspaceLinkBase & (
  | (SnakeFields<Omit<CanonicalLink,
      "id" | "owner" | "from" | "to" | "createdAt" | "validFrom" | "validUntil">>
      & { valid_from: WorkspaceTimestamp | null; valid_until: WorkspaceTimestamp | null })
  | (SnakeFields<Omit<DerivedLink,
      "id" | "owner" | "from" | "to" | "createdAt" | keyof DerivedStatement>>
      & WorkspaceDerivedStatement)
);
interface TransferEntityFields {
  date: string | null;
  indexed: boolean | null;
  pinOrder: number | null;
  archived: boolean;
  private: boolean;
  syncEnabled: boolean | null;
  syncRevision: string | null;
}
export type EntityTransferRow = (
  | Omit<CanonicalEntity, TransferEntityOmissions>
  | Omit<DerivedEntity, TransferEntityOmissions>
) & TransferEntityFields;
export interface WorkspaceDocument {
  api_version: "magnis.dataset/v7";
}

// Auth-scoped consumers retain their existing names and all other members.
// These excerpts declare the compiler-discovered UserId -> AuthUserId positions;
// wire strings and authentication policy do not change. SDK UserId names a graph Entity.
// backend/src/agent/runtime/native-agent.ts (changed members)
export interface NativeAgentRequest {
  readonly userId: AuthUserId;
}

// backend/src/core/ai-runtime.ts (changed members)
export interface AiStreamText {
  <
    TOOLS extends ToolSet = ToolSet,
    RUNTIME_CONTEXT extends Context = Context,
    OUTPUT extends OutputInterface = OutputInterface<string, string, never>,
  >(
    userId: AuthUserId,
    modelId: string,
    options: AiStreamTextOptions<TOOLS, RUNTIME_CONTEXT, OUTPUT>,
  ): AiStreamTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT>;
}

// backend/src/core/auth.ts (changed members)
export interface AuthClaims {
  sub: AuthUserId;
}

// backend/src/core/credit-reservation.ts (changed members)
export interface CreditReservation {
  user_id: AuthUserId;
}

// backend/src/core/llm-call.ts (changed members)
export interface LlmCallRecord {
  user_id: AuthUserId;
}

// backend/src/core/sync-state.ts (changed members)
export interface SourceWorkerKey {
  readonly userId: AuthUserId;
}

// backend/src/core/tools.ts (changed members)
export interface ToolExecutionPort {
  callTool: (
    userId: AuthUserId,
    name: string,
    args: JsonValue,
    profile: ToolProfile,
    agentStreamId: string | null,
  ) => Promise<JsonValue>;
}

// backend/src/core/tools.ts (changed members)
export interface ApprovedToolDispatchBinding {
  readonly dispatch: (
    userId: AuthUserId,
    method: string,
    params: JsonValue,
    scope?: ToolExecutionScope,
  ) => Promise<JsonValue>;
}

// backend/src/core/user.ts (changed members)
export interface User {
  id: AuthUserId;
}

// backend/src/plugin-runtime/host-state.ts (changed members)
export interface PluginHostState {
  dispatchRpc: (userId: AuthUserId, method: string, params: JsonValue, rpcContext?: PluginRpcContext) => Promise<JsonValue>;
}

// backend/src/services/auth/auth.config.ts (changed members)
export interface AuthConfig {
  defaultUserId: AuthUserId;
}

// backend/src/services/modules/types.ts (changed members)
export interface ModuleController {
  handle: (
    userId: AuthUserId,
    method: string,
    input: unknown,
    scope?: ToolExecutionScope,
  ) => Promise<unknown>;
}

// backend/src/services/sources/types.ts
export type SourceRpcHandler = (
  userId: AuthUserId,
  params: JsonValue,
) => Promise<JsonValue>;

// backend/src/services/sources/types.ts (changed members)
export interface SourceRpcRouter {
  registerNative<Contract extends RpcContractLike>(
    contract: Contract,
    handler: (
      userId: AuthUserId,
      input: RpcHandlerInputFor<Contract>,
    ) => Promise<RpcOutputFor<Contract>>,
  ): void;
}

// backend/src/services/sources/types.ts (changed members)
export interface SyncSurface {
  syncSelection?: (request: SyncSelectionRequest, userId: AuthUserId) => Promise<SyncSelection>;
}

// backend/src/services/tools/execution-port.ts (changed members)
export interface ApprovedToolExecutionPort {
  readonly execute: (
    userId: AuthUserId,
    name: string,
    args: JsonValue,
    scope?: ToolExecutionScope,
  ) => Promise<JsonValue>;
}

// backend/src/services/workspace/types.ts (changed members)
export interface UserContext {
  readonly userId: AuthUserId;
}

// backend/src/transport/mcp/mcp-runtime.ts (changed members)
export interface McpRuntimeBinding {
  dispatch: (userId: AuthUserId, method: string, params: JsonValue) => Promise<JsonValue>;
}

// backend/src/transport/websocket/operation-registry.ts
export type CapturedRpcHandler = (
  userId: AuthUserId,
  params: JsonValue,
  scope?: ToolExecutionScope,
  rpcContext?: PluginRpcContext,
) => Promise<JsonValue>;

// backend/src/transport/websocket/operation-registry.ts
export type NativeRpcHandler<Contract extends RpcContractLike> = (
  userId: AuthUserId,
  input: RpcHandlerInputFor<Contract>,
  scope?: ToolExecutionScope,
) => Promise<RpcOutputFor<Contract>>;

// backend/test/harness/mock-ai-runtime.ts (changed members)
export interface MockLanguageCall {
  readonly userId: AuthUserId;
}

// backend/test/harness/websocket.ts (changed members)
export interface RouterCall {
  readonly userId: AuthUserId;
}

// backend/test/harness/websocket.ts (changed members)
export interface WebSocketStand {
  token(userId?: AuthUserId, workspaceId?: string): string;
}

// Frontend modules/_base/types.ts: presentation flags remain view fields.
export interface ListItem {
  readonly pinOrder?: number | null;
  readonly isArchived?: boolean;
}
```

EntityBase.id becomes EntityId; Link endpoints and every saved evidence/reference become PersistentEntityId. Other Source/account/schema IDs retain their existing domains. DerivedEntity, DerivedLink and DerivedStatement replace AgentEntity, AgentLink and AgentStatement throughout compiler-reported consumers. The target discriminator is `origin: "derived"`, covering extraction, aggregation and inference. `GraphClaim` remains the source assertion, while DerivedStatement carries the graph result supported by those claims. Rename the existing internal `DerivedEntity` computation result to `EntityDerivation`, matching `RelationDerivation`, before reusing DerivedEntity for the full graph value.

EntityExtras is the reference's flat required shape: `pinOrder: number | null`, `archived: boolean`, `private: boolean`, read-only `indexed: "pending" | "indexed" | "refused"`, plus either `{syncEnabled: boolean; syncRevision: string}` or the complete pair of nulls. There is no pinned boolean, trigger array, owner or independent indexingPending. Public parsers reject missing fields and half-present sync pairs. The Graph read projection maps a missing graph_index row to pending.

Model `private` means authorized to process private data at the configured execution endpoint. Apply the same required field to the existing logical-model record and administration response; keep model-directory execution metadata `dataBoundary` independently. Known local execution qualifies automatically; an authorized configuration owner may declare another endpoint, including their own cluster, private. Unclassified endpoints do not qualify. The privacy eligibility condition is `!extras.private || model.private`, alongside ordinary access, availability and processing checks.

**Proposed bootstrap choice for approval:** preserve existing auth IDs and foreign keys; add a unique `users.entity_id` mapping to a non-nil graph user. The default nil auth user therefore gets a distinct assigned Entity ID. Existing `entities.owner` and `links.owner` remain private auth-scope projections, resolved to the graph user through that mapping. This refines the reference's previously open storage mapping; it avoids rewriting every auth/session/workspace reference. The graph-user schema exposes only name/surname in this scope; login email, password hashes, admin privileges, sessions and provisioning state stay in auth storage.

### A. Publish the core SDK and extras projection together

```mermaid
flowchart LR
  DB[Typed storage columns] --> R[Graph reader]
  R --> E[Domain Entity]
  R --> X[Requested EntityRead with extras]
  X --> C[SDK clients and module UI]
```

#### Adopt the agreed extras shape at every boundary

| Current or discussed field | Target response | Storage and migration |
| --- | --- | --- |
| Entity.isPinned and pinOrder | extras.pinOrder only | Viewer-specific entity_preferences.pin_order; null is unpinned, zero is a valid order. Apply B's explicit legacy mapping before dropping the boolean |
| Entity.isArchived | extras.archived: boolean | Keep entities.is_archived; normalize legacy null to false at storage/read boundary |
| Privacy draft isPrivate | extras.private: boolean | Add typed entities.is_private; Entity-wide, not a viewer preference; apply B's private-model policy |
| Entity.indexed processing boolean | extras.indexed: IndexingStatus | Read graph_index.status, with pending for no row. Keep the old processing permission internal and distinct; never translate true into indexed or false into pending |
| Entity sync fields / Syncable base | Flat extras.syncEnabled and extras.syncRevision | Preserve entities.sync_enabled and bigint sync_revision; serialize the revision as a decimal string. Unsupported sync uses both nulls |
| Public owner / proposed trigger list | Neither Entity nor extras | Owner remains protected system storage and owner Links; Triggers and execution history have separate paginated reads |

Remove the nested preferences/lifecycle/indexing/sync objects, the pinned flag and indexingPending from the target public shape. Extras remains a requested read projection over typed columns; there is no extras JSONB store. Its fields are required when extras is requested, and public parsers never repair a missing value with a default.

Migrate read consumers to EntityRead where they need operational state: Graph detail/list/traversal and search responses, SDK/RPC serializers, plugin graph adapters and UI pin/archive/sync controls. Workspace codecs preserve stored operational values separately, as specified in F. Domain ingestion, identity, merge and extraction use the domain Entity projection; Source writes must not reset viewer preferences or prepared sync choices. Keep scoped pin/archive/privacy/sync mutations and their permissions; moving their read values into extras does not grant a generic domain-properties write authority over them. indexed status remains read-only; the legacy processing-permission command must retain its distinct boolean meaning while its public naming is reconciled before API activation.

Reuse existing Graph queries and response schemas. Persisted internal rows may contain owner and operational columns; they are not serialized by spreading a storage object into Entity. Ordinary reads can omit preference/index-status joins while still enforcing ACL, archive and privacy. Detail, traversal, lists, tools and transfer must each declare their projection explicitly; no accidental second Entity shape in plugins.

| Implementation map | Core and extras |
| --- | --- |
| Owner | SDK entity/link/statement definitions; GraphService and repository readers |
| Target files | CREATE `../../../magnis-app/backend/migrations/20261006000000_graph_derived_origin.sql`; MODIFY `../../../magnis-app/packages/sdk/src/core/entity.ts`, `../../../magnis-app/packages/sdk/src/core/link.ts`, `../../../magnis-app/packages/sdk/src/core/statement.ts`, `../../../magnis-app/packages/sdk/src/rpc/registry.ts`, `../../../magnis-app/backend/src/core/entity.ts`, `../../../magnis-app/backend/src/services/graph/entity.repository.ts`, `../../../magnis-app/backend/src/services/graph/graph.service.ts`, `../../../magnis-app/backend/src/services/graph/graph.controller.ts`, `../../../magnis-app/backend/src/db/repository-helpers.ts` |
| Input / wake | Known-ID reads, list/detail requests, explicit extras request, existing mutation commands |
| Output / durable state | One domain type, explicit extras responses, hidden auth owner; existing sync revision and processing permission retained |
| RED test | Extend `backend/test/tst_bts_graph_entity_repo_contract.test.ts`, `tst_bts_graph_pins.test.ts` and SDK `test/graph.contract.test.ts`: bare read omits operational fields; extras read preserves two viewers' distinct preferences; current parsers accept derived and reject agent |

Use `/rename` during implementation for symbol changes: change the owning declaration, follow compiler errors and run the affected project typecheck; do not perform text-search-driven symbol replacement. Runtime strings such as relation kinds and stored JSON need explicit migration fixtures independently of the compiler.

Migrate Entity and Link origin values from `agent` to `derived` with a dedicated SQL migration. Update the origin-value and statement constraints, SQL predicates, SDK discriminated unions and the agentStatementSchema export (renamed derivedStatementSchema). Preserve IDs, evidence, confidence, keys, eligibility and periods. GraphClaim.origin remains indexed/manual; auth agent settings, event producers and domain properties containing the string agent are unrelated.

Versioned workspace import translates the legacy Entity/Link discriminator explicitly; new exports and current public parsers use derived only. Update app and catalog artifacts together at the existing compatibility boundary. Stop old writers for the database cutover and validate the new constraints before activating the new runtime. A repeated upgrade changes no additional rows; an unrecognized origin aborts the transaction. No permanent third origin or silent generic string replacement is introduced.


### B. Migrate operational storage without inventing input values

Keep typed columns; do not introduce a JSONB extras table. Normalize archived null/false to false and retain true. Add private using the previously approved privacy contract's initial false. Keep the current internal processing-permission boolean separate from read-only indexed status. Move sync fields only in the public projection, preserving stored booleans, decimal revisions and pending/applied selections.

Telegram uses syncEnabled for both message ingestion and automatic attachments. Retire its obsolete chat indexing toggle completely: the one-time extras SQL migration and legacy workspace upgrade through v6 change stored indexed=false to true only for telegram.chat. Preserve initialized sync choices and exact revisions, chat/message data, legacy selection properties and all other schemas' processing permissions. Current v7 workspace documents keep their explicit storage values. This normalization removes the hidden legacy search/index gate; it does not mark graph_index successful or resume a stopped chat.

**Proposed legacy pin rule for approval:** pin status follows the old pinned flag. Preserve numeric orders of actually pinned rows. Append pinned rows lacking an order after existing pinned orders, deterministically by Entity createdAt then ID for each viewer; when no ordered pin exists, this migration starts the sequence at zero. An order-only unpinned row becomes null. Keep the old columns as deprecated migration evidence during this rollout and export the pre-migration fixture/backup for rollback. Removing those columns is a later cleanup after migrated counts and UI ordering pass, not part of the four migrations below. If appending would overflow the storage integer, fail preflight and request an explicit resequencing decision. Runtime pin commands require a supplied integer, including zero; no missing-value default.

Implement the embedding privacy scope using the owner's revised model-trust rule. A private Entity is eligible only when the selected model has private true; otherwise exclude it from selection, audit, counts and ranked hydration. A declared-private cluster is eligible even with dataBoundary cloud_allowed. This supersedes the older draft's local/cloud test. Stop excludes a scope's new Source changes, not its saved graph or local manual writes. The same trust principle applies to language models, but enforcement in chat/completion and extraction remains a follow-up contract; this migration does not claim those paths are protected.

| Implementation map | State migration |
| --- | --- |
| Owner | Database migration, Graph lifecycle/preferences and search policy |
| Target files | CREATE `../../../magnis-app/backend/migrations/20261006000001_graph_extras.sql`; MODIFY `../../../magnis-app/backend/src/db/schema/graph.ts`, `../../../magnis-app/backend/src/services/graph/entity.repository.ts`, `../../../magnis-app/backend/src/services/search/search-index.repository.ts`, `../../../magnis-app/backend/src/services/search/search-indexer.service.ts`, `../../../magnis-app/backend/src/services/search/search-query-compiler.repository.ts`, `../../../magnis-app/backend/src/services/search/search-query-helpers.ts`, `../../../magnis-app/backend/src/services/search/ranked-search-scope.repository.ts`, `../../../magnis-app/backend/src/services/search/entity-search.repository.ts` (DB schema regenerated) |
| Input / wake | Upgrade with legacy preference rows, archive nulls, existing sync choices and index records |
| Output / durable state | Deterministic nullable pin order; required archive/private projection; no false claim that processing succeeded |
| RED test | Extend `backend/test/tst_bts_graph_pins.test.ts`, `tst_bts_search_visibility.test.ts`, `tst_bts_search_indexer.test.ts` with migration/zero-order/privacy cases |

#### Configure model trust through the existing model settings

Extend the existing logical-model storage, model-settings mutation and SDK directory/admin responses with a required private boolean. Persist it in a typed ai_models.private column in the same extras migration. Known local execution is private automatically. For non-local or unclassified existing bindings, migration initializes private false; the configuration owner can explicitly authorize a cluster afterward. Do not copy dataBoundary device_only blindly: the current Ollama catalog labels a tag without remote_host as device_only even when the configured provider endpoint is remote. Reuse the installed local adapter/binding metadata to establish known local execution.

Use existing settings permissions; model output, discovery metadata and generic graph writes cannot declare an endpoint trusted. The declaration belongs to the configured logical model and endpoint, not a global model name. Preserve it across restart and catalog refresh at the same endpoint. An endpoint change requires fresh classification. Trust writes use the existing model configuration event to invalidate execution caches, and Search reads current trust at each admission. Trust alone does not change the embedding revision or require rebuilding unchanged vectors. The existing administrator-only Settings route adds setAiModelPrivateContract, with a required boolean and the saved logical-model response; discovery cannot call this mutation. After a completed change, subsequent indexing/search uses the new policy; ordering against requests already in flight remains explicitly open. Public response validators require the boolean, and explicit trust writes reject missing/null values. Keep dataBoundary for execution metadata and existing Local captions.

| Implementation map | Model trust |
| --- | --- |
| Owner | Existing model configuration/storage, SDK model contracts and Settings UI; model services below are prerequisite definitions in the identity checkout, to be modified only on the integrated app head |
| Target files | MODIFY `../../../magnis-app/packages/sdk/src/core/ai-model.ts`, `../../../magnis-app/packages/sdk/src/rpc/registry.ts`, `../../../magnis-app/backend/src/db/schema/ai.ts`, `../../../magnis-app/.worktrees/identity/backend/src/agent/models/types.ts`, `../../../magnis-app/.worktrees/identity/backend/src/agent/models/ai-model.repository.ts`, `../../../magnis-app/.worktrees/identity/backend/src/agent/models/ai-model-management.service.ts`, `../../../magnis-app/.worktrees/identity/backend/src/agent/models/ai-model-directory.service.ts`, `../../../magnis-app/backend/src/services/settings/settings.service.ts`, `../../../magnis-app/frontend/src/modules/settings/ModelsPanel.tsx`, `../../../magnis-app/frontend/src/modules/settings/hooks/useAiModels.ts`; reuse migration `20261006000001_graph_extras.sql` and existing settings RPC and registration callers identified before Stage approval; DB schema regenerated |
| Input / wake | Upgrade, local model materialization, explicit trust change, endpoint change, catalog refresh |
| Output / durable state | Required model private boolean, persisted declaration for the current endpoint, updated model-policy revision |
| RED test | Extend `backend/test/tst_bts_ai_models_contract.test.ts`, `tst_bts_ai_models_control_plane.test.ts`, `tst_bts_search_visibility.test.ts` and frontend `hooks/__tests__/useAiModels.test.tsx`: known local, declared-private cluster, unknown endpoint, restart/refresh and subsequent work after revocation |

### C. Consolidate shared relations and declare module-owned kinds

Register host-owned belongs_to for organizational membership. Convert triggers.belongs_to without reversing endpoints; projects.belongs_to → belongs_to is an explicit review proposal with the same member → container direction. Preserve endpoint schemas, periods, claims and producer metadata, and replace implicit prefix grants with explicit module permissions. Retain child_of for Episode hierarchy. Trigger parent lookup must filter belongs_to targets to episodes.episode and reject zero or multiple distinct active parents; project membership must not affect it.

The owner's communication correction supersedes the earlier blanket in_chat → belongs_to migration. Preserve historical in_chat until section G establishes how to retain conversation context and whether transmission/delivery facts can be recovered. A chat-membership edge alone cannot establish a received fact, an observer account or a receipt time.

Replace Episode → triggered_by → Trigger with Trigger → created → Episode. created now covers a producing Episode or Trigger. Register the Trigger-to-Episode pair and update the trigger writer, replay path, SDK ranks, readers and versioned import/export. Preserve Link IDs unless collision handling produces an explicit mapping, and retain metadata, evidence, origin, periods and timestamps. Rewrite effective claim/withdrawal identities consistently, while leaving raw source text and immutable audit history in their original versioned form. Non-Episode/Trigger historical endpoints require explicit review before conversion.

Move the domain-only built-ins to registered module names: attendee → meetings.attendee, observed_in → telegram.observed_in and observed_participant → telegram.observed_participant. Preserve each kind's meaning and direction. Meetings owns the meeting-to-email.address contract; Telegram owns the account-to-chat contracts. Participation does not imply the connected account's observed access, and Telegram's observer metadata carries sync state, unread counts and pins that must remain intact. The existing registry provides discovery, module ownership, endpoint validation and writer permissions; no parallel registry or global SDK union of every module kind is introduced. Verify namespace ownership from installed-module identity, not a caller-supplied prefix.

Inventory old rows by producer and endpoint schema. Convert supported cases in the same relation migration, preserving IDs, claims, periods and metadata; ambiguous producers or conflicting conversions fail preflight. Update module declarations, writers, readers, search filters, workspace import/export and compatibility together. Register the replacement kinds before changing foreign keys. Never delete orphaned historical kinds while rows still reference them, and do not let module uninstall authorize new writes. Existing Trigger candidate notifications remain compatible; no new event engine is required by this change.

The existing LinkedEntitySummary gains direction out/in relative to the viewed Entity and retains the stored linkKind. TriggerRepositoryPort.ensureCreatedLink(userId, episodeId, triggerId, actor): Promise<void> replaces ensureTriggeredByLink, preserving its argument order while writing Trigger → created → Episode. Stop serializing inverse presentation labels as kinds. The Trigger displays outgoing created results; its Episode displays incoming created provenance. Existing reverse labels such as watched_by and child_episodes are view labels only. A self-link emits one out summary; same_as uses a symmetric label. These are projections over one stored edge, not additional inverse relations.

The migration records graph_relation_migrations rows keyed by recordKind (link, claim or withdrawal) and recordId, with originalRecord and currentRecord JSON snapshots. The exported Drizzle table graphRelationMigrations declares those four fields. Link snapshots preserve explicit duplicate-ID mappings, claim snapshots preserve original statements, and withdrawal snapshots project the current identity by exact audit-event ID without modifying the original event. This is migration evidence, not a kind alias or a new graph write API.

Before rewriting, enumerate duplicate keys caused by convergence. Identical pair/origin/period duplicates may use the existing deterministic Link collapse mechanism with an ID mapping; differing overlapping periods or conflicting producer provenance fail migration preflight without changing rows. Do not silently discard temporal history. Old workspace input is upgraded at its versioned import boundary; new organizational-membership exports and writes use belongs_to, and new creation provenance uses created. No permanent runtime alias namespace is introduced.

| Implementation map | Shared relations and module ownership |
| --- | --- |
| Owner | Graph registry, workspace codecs, Trigger/Episode writers and readers, Projects/Triggers/Meetings/Telegram modules |
| Target files | CREATE `../../../magnis-app/backend/migrations/20261006000002_graph_membership.sql`; MODIFY `../../../magnis-app/packages/sdk/src/core/link.ts`, `../../../magnis-app/packages/sdk/src/core/episode.ts`, `../../../magnis-app/packages/sdk/src/core/linked-entity.ts`, `../../../magnis-app/backend/src/core/episode.ts`, `../../../magnis-app/backend/src/core/graph-view.ts`, `../../../magnis-app/backend/src/services/graph/graph-contracts.ts`, `../../../magnis-app/backend/src/services/graph/link.repository.ts`, `../../../magnis-app/backend/src/services/graph/graph.transfer.ts`, `../../../magnis-app/backend/src/services/triggers/triggers.repository.ts`, `../../../magnis-app/backend/src/services/triggers/triggers.service.ts`, `../../../magnis-app/.worktrees/identity/backend/src/agent/episodes/episode.ts`, `../../../magnis-app/.worktrees/identity/backend/src/agent/episodes/episodes.service.ts`, `../../../magnis-app/.worktrees/identity/backend/src/agent/episodes/episodes-dataset-contract.ts`, `../../../magnis-app/frontend/src/modules/episodes/helpers.ts`, `modules/triggers/manifest.toml`, `modules/triggers/schema.ts`, `modules/triggers/module/service.ts`, `modules/projects/manifest.toml`, `modules/projects/schema.ts`, `modules/projects/module/service.ts`, `modules/meetings/manifest.toml`, `modules/meetings/schema.ts`, `modules/meetings/entities.ts`, `modules/meetings/types.ts`, `modules/meetings/module/service.ts`, `modules/meetings/module/helpers.ts`, `modules/meetings/ui/EntityCards.tsx`, `modules/telegram/manifest.toml`, `modules/telegram/schema.ts`, `modules/telegram/entities.ts`, `modules/telegram/types.ts`, `modules/telegram/module/service.ts`; identity paths name prerequisite owners on the integrated app head |
| Input / wake | Upgrade, module activation, message/trigger creation, import and relation queries |
| Output / durable state | Shared organizational membership, module-owned domain kinds, created provenance in the correct direction, direction-preserving views, retained temporal/provenance data and unresolved communication history |
| RED test | Extend app `backend/test/tst_bts_graph_link_kinds.test.ts`, `tst_bts_graph_merge_pg.test.ts`, `tst_bts_dataset_format.test.ts`, `tst_bts_triggers_repository.test.ts`, `tst_bts_triggers_service.test.ts`, `tst_bts_episodes_snapshot.test.ts`; catalog `modules/projects/module/__tests__/projectsCrud.test.ts` and trigger CRUD/read scenarios; existing Meetings attendee tests and Telegram ingest/read/sync-plan tests |

### D. Bootstrap graph users and protect ownership at every writer

```mermaid
sequenceDiagram
  participant A as Auth user service
  participant G as System GraphService
  participant DB as Database
  A->>G: Ensure graph identity for auth user
  G->>DB: Lock auth row and resolve or create users.user
  G->>DB: Bind auth ID, self-owner link and audit
  G-->>A: Stable non-nil graph UserId
```

The proposed user node is a non-mergeable, non-generic-deletable, non-syncable host identity_channel. Bootstrap is idempotent under a unique mapping and row lock. A user's root node is owned by that auth user and has the system-only self-owner Link; this is an explicit root case, not permission for generic self-owned Links. Backfill existing users, including nil auth user, before enabling public owner traversal. Add a person → user identity Link only when the user/account mapping supplies an unambiguous person; never select one by name alone.

Backfilled owner periods start at the migration's recorded timestamp. Existing ownerId supplies current ownership, not evidence of ownership since createdAt; ownership before that timestamp remains unknown unless an authoritative historical record is available. Newly created entities start their owner period at creation. Complete bootstrap in one system transaction: create the graph node for the existing auth row, set its unique binding, then record the protected self-owner Link and audit.

Every new Entity gets its current owner Link in the same transaction. Generic add/end/unlink/patch, plugin batch, extraction, registration, import and merge must reject or route protected mutations to the system function. Import restores auth bindings for the target workspace and system ownership through GraphService instead of inserting arbitrary owner rows. The existing `TargetIdMap` adds `bindExisting(key: PortableKey, target: string): void`: replace an allocated portable-key target with an existing system row, retaining unique target IDs and refusing unknown keys. After system ownership is restored, exported owner keys resolve to the actual target owner Link IDs before participant references are restored; the target user's self-owner Link remains stable. Exact transfer input uses graph UserId; Graph resolves both auth scopes internally. Lock participating auth scopes in stable order.

**Proposed bounded transfer policy for approval:** implement transfer for a non-user Entity only if it has no ordinary incident Links, no claims/evidence dependencies, and no non-owner references requiring transfer. Inventory relational and structured-JSON references on the integrated head before enabling transfer; if completeness cannot be established, leave transfer unavailable. Otherwise return an explicit conflict for any such dependency, with no mutation. Bounded transfer also depends on the historical ownership read/export contract below. This first contract does not guess a transfer closure or grant access across users. At one service-chosen timestamp, close prior owner, insert new owner, update internal scope/projection and audit atomically. Same-owner transfer is a no-op. Transfer/user-node deletion and connected cross-owner moves require a later owner-approved contract, not an external allowSystemLinks switch.

**Before enabling bounded transfer:** decide who may read closed owner periods and how those references are represented in each user's workspace export. After a transfer, the old user node and the owned Entity are in different auth scopes. Current LinkRepository reads require both endpoints in the Link's scope, while allForTransfer selects by links.owner alone; leaving that path unchanged can hide history or export a Link whose endpoint is absent. Declare the system-only history projection/export mapping before implementation approval. Until that decision, transfer remains unavailable; ordinary owner creation and same-owner bootstrap can proceed. Do not relax generic endpoint ACL or copy another user's graph node into a workspace to make export pass.

| Implementation map | User and ownership |
| --- | --- |
| Owner | Existing UsersService and system GraphService methods |
| Target files | CREATE `../../../magnis-app/backend/migrations/20261006000003_graph_user_ownership.sql`; MODIFY `../../../magnis-app/backend/src/db/schema/users.ts`, `../../../magnis-app/backend/src/db/schema/graph.ts`, `../../../magnis-app/backend/src/core/user.ts`, `../../../magnis-app/packages/sdk/src/core/user.ts`, `../../../magnis-app/packages/sdk/src/core/entity.ts`, `../../../magnis-app/packages/sdk/src/core/link.ts`, `../../../magnis-app/backend/src/services/users/users.service.ts`, `../../../magnis-app/backend/src/services/users/user.repository.ts`, `../../../magnis-app/backend/src/services/users/default-user.ts`, `../../../magnis-app/backend/src/services/graph/graph.registrar.ts`, `../../../magnis-app/backend/src/services/graph/graph.service.ts`, `../../../magnis-app/backend/src/services/graph/graph.repository.ts`, `../../../magnis-app/backend/src/services/graph/link.repository.ts`, `../../../magnis-app/backend/src/services/graph/graph.transfer.ts`, `../../../magnis-app/backend/src/services/search/search-query-compiler.repository.ts`, `../../../magnis-app/packages/sdk/src/rpc/registry.ts` (DB schemas regenerated) |
| Input / wake | Auth bootstrap, existing-user upgrade, Entity creation, authorized transfer, import and ownership query |
| Output / durable state | Stable graph user mapping, one current protected owner relation, hidden consistent auth projection and audit |
| RED test | Extend `backend/test/tst_bts_users_service.test.ts`, `tst_bts_workspace_identity.test.ts`, `tst_bts_graph_batch.test.ts`, `tst_bts_graph_merge_pg.test.ts`; CREATE `backend/test/tst_bts_graph_owner.test.ts` for cross-entry-point protection and atomic transfer |

### E. Preserve identity and temporal claims through the new boundary

Do not turn this migration into a new entity resolver. Reuse exact Source/canonical keys, preparation, identity Links, merge preview/execute and deterministic derive functions. Preserve the canonical identity-hub exception and repeated ensure after merge. Add the ordinary domain validator and protected-kind checks at extraction commit and merge result validation, so repository use cannot bypass them. Canonical/derived origin separation, explicit field conflicts, interval overlap refusal and source-claim replacement remain intact.

For this migration, same-schema different-version merge fails explicitly unless an existing approved version conversion is available. Keep current property merge behavior documented; do not silently add field claims or promote derived values. **Proposed conservative extras rule:** refuse merge when privacy, syncEnabled or per-viewer pinOrder differ (absent viewer preference means null); do not add an undeclared extras override to the properties-only MergeOverride. Equal choices survive; keep the survivor's syncRevision as its own counter, rather than comparing counters from different entities. Both participants must already be unarchived. Reconcile/invalidate derived indexing through the existing graph mutation path, never choose the better-looking status. A richer extras arbitration command remains a separate contract. System merge retains the survivor owner and retires the duplicate same-owner relationship through the protected path; it does not transfer ownership. Replay must still resolve both representations to the survivor.

Keep pending/indexed/refused with the existing owner revision fence. The revision-based search queue remains a follow-up design already described in the reference: requested/processed and configuration revisions, dependency invalidation, retry/refusal and crash recovery must be completed before that queue replaces digest selection. Do not claim it has been implemented by exposing the status field.

| Implementation map | Process consistency |
| --- | --- |
| Owner | Graph domain decision functions and the existing indexer |
| Target files | MODIFY `../../../magnis-app/backend/src/services/graph/merge.ts`, `../../../magnis-app/backend/src/services/graph/graph.repository.ts`, `../../../magnis-app/backend/src/services/graph/graph.service.ts`, `../../../magnis-app/backend/src/services/graph/graph.transfer.ts`, `../../../magnis-app/backend/src/core/merge.ts`; prerequisite owners currently in identity checkout: `../../../magnis-app/.worktrees/identity/backend/src/services/graph/claim.repository.ts`, `../../../magnis-app/.worktrees/identity/backend/src/services/graph/derive.ts`, `../../../magnis-app/.worktrees/identity/backend/src/services/search/graph-indexer.ts`, `../../../magnis-app/.worktrees/identity/packages/sdk/src/core/indexing.ts` |
| Input / wake | Preview/execute, model proposal, changed source, repeated ensure and workspace replay |
| Output / durable state | Validated new projection with preserved identity/provenance and deterministic temporal results |
| RED test | Extend existing graph merge, batch and workspace scenarios; CREATE `backend/test/tst_bts_graph_contract_admission.test.ts` to reject malformed domain proposals and protected owner writes at every affected commit boundary |

### F. Migrate consumers and publish compatible artifacts

Use the SDK build and existing generated host-stub workflow. Convert app frontend/client-core and plugin SDK callers from direct flags to EntityRead/extras where the UI actually needs them; domain-only processing remains on Entity. Trigger lists remain separate paginated resources.

WorkspaceEntity/WorkspaceEntitySchema remain a versioned storage-transfer contract, not an EntityRead response. They currently derive fields from EntitySchema, including its boolean indexed shape; replace that dependency for operational fields when the public Entity loses them. Explicitly carry the stored processing permission (boolean or legacy null), archive/privacy, the workspace viewer's pin order and the sync pair in the existing transfer definitions. Keep stored permission distinct from extras.indexed and preserve source nulls except for the deliberate migrations in B. A projected pending value must not create a graph_index row or become a processing-permission value during restore. Retain the existing index rebuild policy; adding index-cache export is not part of this change. Extend the existing document/transfer tests alongside the serializers and row readers.

Update relation consumers and declared permissions before activating packages against the new contract.

The compatible module API is `0.3.0`; the shared `@magnis/sdk` package is `0.2.0`. Source protocol versions remain unchanged. Public schema exports use PascalCase: `SyncRevisionSchema`, `SourceRefSchema`, `DateTimeSchema`, `DerivedStatementSchema`, `LinkBaseSchema`, `CanonicalLinkSchema`, `DerivedLinkSchema`, and the existing `EntitySchema` / `LinkSchema`. Remove their lowercase aliases through compiler-reported consumers. The nil sentinel is published as `nilId` (the value and `NilId` type are unchanged); earlier `NIL_ID` examples denote this same sentinel. The compile-time diagnostic uses `error` consistently:

```typescript
export type AssertEqual<A, B> = Equal<A, B> extends true
  ? true
  : { error: "schema drifted from type"; A: A; B: B };
```

These spelling changes add no wire fields or new Graph behavior.

Do not support two permanent public Entity formats. Version the shared SDK/package activation boundary and reject an incompatible package as one activation, retaining the previous accepted version. Stored legacy values and old workspace exports are translated only by explicit migration/import boundaries. Stage the app runtime and catalog artifact versions together; rollout starts only after their compatibility matrix and restore fixture pass.

| Implementation map | Consumers and publication |
| --- | --- |
| Owner | SDK publisher, app transport/client-core and catalog SDK/UI owners |
| Target files | MODIFY `../../../magnis-app/frontend/src`, `../../../magnis-app/packages/client-core/src`, `../../../magnis-app/cli/src`, `../../../magnis-app/scripts/sdk-contract-audit.ts`, `../../../magnis-app/scripts/sdk-package-smoke.ts`, `../../../magnis-app/backend/src/services/workspace/workspace-document.ts`, `../../../magnis-app/backend/src/core/workspace-transfer.ts`, `packages/plugin-sdk/contract/module.ts`, `packages/plugin-sdk/__tests__/graphContract.test.ts`, `packages/host-stubs/types`; exact module and UI callers derived by compiler before Stage approval |
| Input / wake | New SDK build, module installation/upgrade, UI reads, export/import |
| Output / durable state | Compatible artifacts and strict runtime contracts, no handwritten replacement host stubs |
| RED test | Existing package smoke, plugin graph contract and affected module/UI scenarios; MODIFY app `backend/test/tst_bts_workspace_document.test.ts` and `backend/test/tst_bts_workspace_transfer.test.ts` for explicit stored operational fields and one migrated-workspace integration fixture |

### G. Communication facts and the automation boundary

The owner's current scope is a simpler graph contract. Implement communication facts and declarations as part of the graph migration; retain the subscription/Trigger chain as its documented boundary. Connecting subscriptions to the existing execution mechanism belongs to the next logic story and does not block the graph release.

Communication records use sent/received with an occurrence time, independently of graph createdAt and validity periods. The working direction is concrete mailbox/account → message, with conversation context separately identified. A shared chat has no account-independent incoming/outgoing direction. A successful send or authoritative source observation can establish sent; recipient headers alone cannot establish received. Keep authorship, creation and reply context distinct from communication. The communication vocabulary has two pairs: account/mailbox → sent/received → message records observed transmission/delivery; message → sent_to/received_from → address/account records the addressed recipient and source-reported sender. received_from is not the inverse of received and does not establish a sent event from an email From header. sent_by stays retired: incoming sent traversal already resolves an observed sending endpoint. The inspected email writer uses authored_by for from_address; migrate that sender-only fact to received_from for the known email producer/schema pair, preserving provenance and history. Update its registry permissions, manifest and UI readers together; do not globally rename authored_by or emit both from one sender field. Other adapters must distinguish known content authorship from reported sender information.

Remove watches, account, prospect and supports from the target standard vocabulary as well. Runtime retirement of watches/triggerable waits for the later Trigger cutover so existing automation keeps working. After each supported kind's cutover, ordinary writes/registration reject that retired kind; explicit legacy import/read compatibility preserves historical rows. Reverse old sent_by only when its endpoints and evidence establish the target sent fact; an Episode sender or an unknown contract stays unresolved, not silently rewritten.

Validate conversation references through Graph, including merge/deletion handling; do not hide unchecked IDs in metadata. Choose a concrete mailbox Entity when email.address does not identify the receiving endpoint uniquely. Repeated physical deliveries of the same message/endpoint need an occurrence identity before they can be represented; current Link period constraints do not supply one.

Modules declare kinds, endpoint schemas, metadata and write permissions through the existing registry. The basic subscription contract selects link_added/link_updated by kind and optional endpoints, and entity_updated by schema and optional ID. Updates match the committed after state; the event carries before/after for the handler. Graph records the event; Triggers matches accessible subscriptions and runs the existing action_prompt through Episode execution. A TriggerExecution refers to the source Event ID and any resulting Episode. There is no field-predicate language, condition engine or module-specific event name. Current property writes use both entity_properties_updated and entity_updated, and sync settings also use the latter, so the later subscription producer must select actual domain changes without altering audit history. Extras are outside this contract.

The target records the mutation and event together, dispatches after commit and deduplicates one Trigger's handling by source Event ID. Recording new information is the wake, independently of source occurrence and relation-validity dates; an unchanged sync creates no event. Historical-import admission remains an explicit cutover decision. Event delivery is connected to the existing execution owners in the later logic story; this graph migration does not add a queue.

The inspected TriggerGate is an auto-pass stub. No classification context or classifier is specified for implementation here. Keep existing Trigger notifications and capability contracts working during graph adoption; translate their readers/writers only where required by the agreed Link changes. Retiring watch-based selection and replacing trigger.check belongs to the later coordinated cutover.

**Owner-approved minimal communication model (2026-10-08):** email.mailbox represents one connected Source account, with required nullable address; email.thread represents a conversation, with required threadId and identity scoped by source/account. Telegram reuses telegram.account and telegram.chat, without per-account chat copies. Message-instance identity is scoped by its producing domain and connected account; replay of one provider message reuses one sent/received fact per endpoint and direction. A new provider message ID is a new instance. Multiple deliveries of the same instance to the same endpoint are unsupported in this release; do not manufacture occurrence IDs or replace an established occurrence time with another delivery.

Communication metadata has exactly occurredAt: DateTimeUtc | null and conversationId: PersistentEntityId | null. Use canonical account/mailbox and message endpoints owned by the caller. Validate email account/source agreement and conversation schema/account through Graph. The existing manual tool write carries a module/user source stamp until sync confirms it: accept that explicit local branch only when its account-qualified provider-message key names the observing account; it cannot borrow another account's key. Manual sends use an already-discovered mailbox/account and an existing conversation or explicit null, never invent source credentials or provider timestamps; Telegram conversation identity stays shared while direction belongs to the observing account. Validity bounds are null for these point observations. A replay may fill unknown metadata but cannot erase known values or overwrite conflicting observations. Referenced canonical conversations cannot be retired by generic deletion/merge; refuse atomically rather than leave a dangling metadata ID. Workspace restore remaps conversation IDs and validates the same contract. Preserve unresolved historical sent Episode links on read/transfer without treating them as observed delivery; new Episode provenance uses created. Legacy in_chat remains context only. The communication migration changes registry declarations and scopes existing message anchors without changing entity IDs or inventing delivery facts. Queues, prompts, model context and the Trigger state machine remain outside this scope.

| Implementation map | Communication facts and graph boundary |
| --- | --- |
| Owner | Existing graph registry/communication owners and source adapters; reference authors for the automation boundary |
| Target files | MODIFY `../../../magnis-app/packages/sdk/src/core/link.ts`, `../../../magnis-app/backend/src/services/graph/graph-contracts.ts`, `../../../magnis-app/backend/src/services/graph/graph.transfer.ts`, `modules/email/entities.ts`, `modules/email/types.ts`, `modules/email/manifest.toml`, `modules/email/module/service.ts`, `modules/email/ui/helpers.ts`, `modules/email/ui/EntityCards.tsx`, `modules/telegram/module/service.ts`, `sources/google/src/surfaces/email/gmail.ts`, `sources/google/src/surfaces/email/imap.ts`, `sources/telegram/src/surfaces/telegram/envelope.ts`, `docs/vision.md`; declare exact endpoint and metadata schemas and any communication-data migration after domain decisions, before Stage approval |
| Input / wake | Domain declarations, confirmed source observations, sending results, historical import and graph reads |
| Output / durable state | Validated communication facts and timestamps, preserved history and existing runtime compatibility; a documented subscription/execution boundary |
| RED test | Extend catalog `modules/email/module/__tests__/emailIngest.test.ts`, `emailSend.test.ts`, `modules/telegram/module/__tests__/telegramIngest.test.ts`, `sources/google/src/surfaces/email/gmail.test.ts` and existing app graph registration/batch/import tests; failed sends, header-only observations, replay and atomic message/Link persistence |

### Adoption order and proposed Delivery boundaries

This is the graph migration sequence. The executable Delivery/Stage/Task graph is authored after SPEC approval and the relevant domain decisions through planctl; none is approved or running in this commit. The later logic story is outside these release dependencies.

| Order | Proposed PR boundary | Depends on | Completion evidence |
| --- | --- | --- | --- |
| 0 | Reconcile SDK/identity/entity-sync/claims/module-dependency prerequisites on the actual integration head | Their existing owners' work | Record integrated commits and compile the baseline; do not duplicate their implementations |
| 1 | App SDK names, derived-origin migration, persistent IDs, strict Entity/extras, model trust and storage migration | 0, approval of legacy pin proposal | Core parser, viewer preference, sync and read-projection scenarios; matched client changes in the same releasable boundary |
| 2 | App + catalog shared relations and module-owned kinds | 1; project-membership proposal | Direction reversal, temporal collision preflight, permissions and Trigger/Project/Episode/Meetings/Telegram scenarios; no invented chat delivery facts |
| 3 | App graph users, protected ownership and bounded transfer | 1–2, approval of bootstrap/mapping proposals; transfer additionally requires its history/export contract | Nil-auth-user bootstrap, all-writer rejection matrix, rollback/race and owner-search isolation |
| 4 | App merge/extraction/import validation and catalog consumer completion | 1–3 | Canonical/derived and period scenarios, repeated ensure, exported/restored workspace equivalence |
| 5 | App + catalog communication facts and declarations | 1–4; resolve G's endpoint/conversation contracts | Confirmed observations, atomic message/Link writes, historical mapping and compatibility with the existing Trigger runtime |
| 6 | Compatible runtime/SDK/catalog release and reference reconciliation | All above | Full affected gates, package/API compatibility, migration and restore verification; release approval remains separate |

Cross-repository implementation uses one shared plan. App Deliveries name repository `app`, catalog Deliveries name `catalog`; implementation setup configures `code-production.repository.app` / `.catalog` to the owner's intended checkouts. This authoring turn does not repoint shared repository configuration or create implementation worktrees. Active-time estimates and concrete Stage writes will be derived from the integrated baseline, not guessed across unmerged prerequisite branches.

## Target tree

App paths in the maps are relative to this plan checkout: `../../../magnis-app`. Identity-checkout paths identify prerequisite definitions currently absent from app staging; those changes will target the integrated app checkout after prerequisite reconciliation. They do not authorize edits to a colleague's worktree. Catalog paths are relative to this repository. Delivery repository bindings will replace these inspection locations before executable Stage approval.

| Action | Owner/path | Why this scope is necessary |
| --- | --- | --- |
| MODIFY | Catalog `docs/vision.md`, `README.md`, `docs/typing.md` | English reference, navigation, historical-status clarification |
| CREATE | Catalog `docs/plans/2026-10-06-entity-docs.md` | One migration plan, authored and journaled through planctl |
| MODIFY | App existing SDK, core and RPC files enumerated in maps A–G | Single shared definitions and runtime validators; no parallel type package |
| MODIFY | App existing Graph, Search, Users, transport and compiler-reported client files in A–G | Remove leaked operational fields and enforce the same authority in every writer and reader |
| MODIFY | App existing AI model contracts, model configuration services, Settings and model UI files in B | Persist configured model trust and expose it through existing administration and directory contracts |
| CREATE | `../../../magnis-app/backend/migrations/20261006000000_graph_derived_origin.sql` | Entity and Link origin discriminator and constraint migration |
| CREATE | `../../../magnis-app/backend/migrations/20261006000001_graph_extras.sql` | Typed extras, logical-model trust and legacy pin conversion |
| CREATE | `../../../magnis-app/backend/migrations/20261006000002_graph_membership.sql` | Shared and module-owned Link kinds, creation direction and history conversion |
| CREATE | `../../../magnis-app/backend/migrations/20261006000003_graph_user_ownership.sql` | Auth-to-graph-user binding and protected ownership |
| MODIFY, generated | App DB schema files and catalog host stubs | Regenerate from canonical SQL and SDK; never hand-edit generated declarations |
| MODIFY | Existing catalog plugin SDK, affected modules and manifests in maps C and F | Consume the new SDK and shared membership permissions |
| MODIFY | Existing scoped tests named in A–G | Reuse Graph, workspace, User and Source harnesses and fixtures |
| CREATE | `../../../magnis-app/backend/test/tst_bts_graph_owner.test.ts`, `../../../magnis-app/backend/test/tst_bts_graph_contract_admission.test.ts` | Missing cross-writer ownership and domain-admission behavioral scenarios |

This bounds owners rather than guessing every compiler caller. Before executable Stage approval, enumerate the actual affected caller paths on the integrated head; unexpected files require an explicit Stage update. Reuse the existing graph Event and Trigger services. Section G's communication schemas/data migration must be declared after its domain decisions and before Stage approval. Durable event delivery and Trigger admission storage belong to the later logic story, not this release. No unrelated runner, auth system or generic resolver framework is introduced.

## Invariants

1. Nil is an unsaved sentinel; only assigned IDs can be Link endpoints, evidence or mutation targets. Existing auth nil IDs remain valid in their own domain.
2. Entity domain meaning is independent of whether extras is requested. Omitting extras never bypasses ACL, archive or privacy.
3. Nullable pin order is the only pin state; archive/private booleans and complete sync pairs are strict required response values. Read defaults occur at the specified storage projection only.
4. Owner is hidden system state and a protected canonical temporal Link. Generic RPC, plugins, model output, import and ordinary merge never acquire ownership-writing authority.
5. Source identity, domain identity, identity Links and physical merge retain distinct meanings. No automatic person merge by name, shared address or same_as chain.
6. Merge and extraction validate final domain data and registered endpoint rules under the same transaction/fence that records the result; stale model work cannot overwrite a newer graph.
7. Human approval does not change derived origin; repeated evidence does not add to confidence; a changed ending source cannot silently reopen a relation.
8. Migration preserves explicit sync decisions, applicable periods, auth bindings and access scope. Destructive ambiguity fails preflight rather than choosing silently.
9. Private Entity processing requires model private true. Known local execution and an explicit declaration for a configured cluster both qualify; physical location metadata alone does not authorize private-data processing.
10. Creation provenance, organizational membership and observed communication are distinct. A reversed created Link replaces triggered_by; belonging to a chat does not prove delivery.
11. The future Trigger boundary consumes committed, authorized graph events. Occurrence time differs from insertion time; event-driven replay identity is an Event ID, not an Entity ID. This graph migration does not claim that the future engine is implemented.

### Acceptance cases

| ID | Behavioral scenario |
| --- | --- |
| KG-01 | Step 1 → parse two different unsaved Web results with nil. Step 2 → attempt a Link/evidence/save-by-ID using nil. Verify → both values remain representable, while saved-reference operations reject nil and valid assigned references still resolve |
| KG-02 | Step 1 → read one Entity without extras. Step 2 → read it as two viewers with different preferences using extras. Verify → equal domain values, distinct pin orders, no owner/trigger list leakage, unchanged access checks |
| KG-03 | Step 1 → upgrade fixtures for pinned numeric zero, pinned unordered, unpinned order-only and no preference row. Step 2 → repeat migration and read/order/unpin. Verify → deterministic approved mapping, zero stays pinned, second migration makes no new change, original state remains recoverable during rollout |
| KG-04 | Step 1 → omit/null an archived/private/indexed field or supply a half sync pair to the public parser. Verify → rejection. Step 2 → read an actual missing graph_index row. Verify → explicit pending without inserting status or inventing metadata |
| KG-05 | Step 1 → Stop a scope while a fetched page waits to commit. Step 2 → release the page and restart worker. Verify → no new content/triggers after the committed Stop; saved choice/revision survives and old acknowledgement does not apply a newer choice |
| KG-06 | Step 1 → migrate Trigger and proposed Project membership with adjacent/duplicate periods. Step 2 → read, repeat ingestion and import an old workspace. Verify → shared belongs_to, retained periods/provenance and no repeat rows. Step 3 → inspect historical in_chat. Verify → retained until its communication/context mapping is defined; no invented received fact. Conflicting overlapping membership conversion aborts atomically |
| KG-07 | Step 1 → bootstrap the default nil auth user concurrently twice. Step 2 → restart and authenticate/read existing data. Verify → one assigned users.user, one binding and self-owner Link; auth ID and existing workspace access unchanged; no secrets in properties. Step 3 → query ownership before the backfill timestamp without historical evidence. Verify → no invented past owner |
| KG-08 | Step 1 → try owner add/end/unlink/patch through RPC, aliases, plugin batch, model output, registration, import and merge. Verify → rejection or the defined system route, with no forged owner. Step 2 → normal Entity creation. Verify → exactly one owner and matching internal scope/audit |
| KG-09 | Prerequisite → approve the closed-owner-history read/export contract; before it, verify transfer is unavailable. Step 1 → transfer an isolated non-user Entity at T. Verify → old interval ends at T, new starts at T, one current owner, old user gains no current read right. Step 2 → retry same owner and test rollback midway. Verify → no extra interval; failure leaves original state. Step 3 → transfer a connected/claimed/user Entity. Verify → explicit conflict, no partial reassignment. Step 4 → read history and export/restore each affected user's workspace. Verify → the approved history scope, no foreign Entity disclosure and no dangling exported endpoints |
| KG-10 | Step 1 → create two internal people through different addresses and merge after preview. Step 2 → repeat ensure through both addresses. Verify → one survivor returned, representations retained, no new people; distinct provider canonical records still reject merge |
| KG-11 | Step 1 → preview conflicting properties then introduce another conflict. Step 2 → execute old overrides. Verify → refusal/rollback. Step 3 → provide explicit values but invalid domain output or incompatible schema version. Verify → refusal before mutation; valid override commits and old ID is not falsely promised as a redirect |
| KG-12 | Step 1 → feed identical claim sets as start→ending and ending→start. Step 2 → change the ending source. Verify → same interval in both orders, then hidden unresolved relation rather than invented reopening; repeated confidence never reaches one |
| KG-13 | Step 1 → return a model proposal with invalid domain properties, unauthorized endpoint roles or system owner kind. Verify → whole attempt rejected at commit. Step 2 → change graph revision during a valid model response. Verify → no stale nodes/claims/status completion |
| KG-14 | Step 1 → mark data private and select a model with private false, including an unclassified endpoint. Verify → no selection/audit/count/ranked hydration of private content. Step 2 → use a known local model. Verify → private true and processing allowed. Step 3 → explicitly authorize a cluster whose dataBoundary remains cloud_allowed. Verify → the same private data is eligible. Step 4 → read as an unauthorized graph user. Verify → ordinary ACL still refuses access. Step 5 → repeat with a non-private Entity and model private false. Verify → this flag imposes no restriction |
| KG-15 | Step 1 → export upgraded workspace and restore for its target auth user. Step 2 → compare domain identities, claims, periods, preferences, sync choices and protected owner bindings. Verify → intentional ID mappings only, no cross-owner disclosure or direct owner injection. Step 3 → install incompatible module artifact. Verify → rejected activation leaves prior accepted module active |
| KG-16 | Step 1 → preview/execute a merge with differing privacy, syncEnabled or viewer pinOrder. Verify → refusal without mutation, even if all property conflicts were resolved. Step 2 → equalize the choices through existing explicit commands and merge. Verify → survivor revision and equal choices retained; indexing invalidated/reconciled through the normal mutation path |
| KG-17 | Step 1 → upgrade a workspace with agent-origin Entity and Link rows, canonical rows, claims and unrelated domain properties containing agent. Verify → only Entity/Link discriminators become derived; IDs, evidence, confidence, periods and other origin domains stay intact; constraints validate. Step 2 → repeat the upgrade and import an old-version export. Verify → stable mapping without duplicates. Step 3 → parse current responses with derived, then agent. Verify → derived succeeds, agent is rejected; unknown stored origins abort migration without partial updates |
| KG-18 | Step 1 → upgrade known local and unclassified model bindings. Verify → local private true, unclassified private false; missing/null directory values are rejected. Step 2 → authorize a cluster through model settings, restart and refresh its catalog. Verify → trust survives at the same endpoint; an unauthorized settings write fails. Step 3 → revoke trust and await the saved configuration change. Verify → subsequent indexing/search excludes private content using the new policy. Step 4 → change the trusted model's endpoint. Verify → the old declaration does not authorize the new endpoint without fresh classification |
| KG-19 | Step 1 → migrate Episode → triggered_by → Trigger beside existing Trigger → created → Episode rows. Verify → correct direction, preserved IDs or explicit duplicate mapping, periods/claims/metadata retained; ambiguous collision aborts. Step 2 → replay a firing and read both endpoints. Verify → one created edge, correct incoming/outgoing meaning, child_of retained and no runtime triggered_by write |
| KG-20 | Step 1 → give a Trigger one parent Episode and a project membership. Verify → parent lookup selects the Episode. Step 2 → add a second active Episode parent and attempt firing. Verify → explicit ambiguity before any child is created. Step 3 → read organizational, authored_by, sent_to and observed-participant facts. Verify → none confers ownership or proves receipt |
| KG-21 | Step 1 → observe confirmed inbound delivery and commit its message/received Link. Verify → both are visible together with the source occurrence time. Step 2 → roll back the batch or fail a send. Verify → no partial message/Link write or invented communication. Step 3 → ingest To/CC headers without delivery evidence. Verify → recipient facts only; unknown receipt time remains unknown |
| KG-28 | Step 1 → create a sent fact and read the message's incoming Links. Verify → sender is resolved through sent with direction in, without a sent_by row. Step 2 → ingest an addressed recipient with no delivery evidence, then observe actual receipt. Verify → sent_to exists independently; received appears only for the observed delivery. Step 3 → upgrade historical sent_by/account/prospect/supports rows and attempt ordinary new writes or registration under retired names. Verify → evidence-backed conversion or readable unresolved history; no new retired kinds or fabricated communication facts |
| KG-29 | Step 1 → ingest a message with a reported From address and no observed sending account. Verify → received_from identifies the sender; no invented sent event or duplicate authored_by from the sender field. Step 2 → upgrade the known email-producer authored_by rows beside non-email authorship. Verify → only sender-only email relations become received_from, preserving provenance/history and repeat-ingestion identity; independent authorship stays unchanged. Step 3 → read message sender, recipient and delivery facts. Verify → correct received_from/sent_to display; sender information alone creates no received fact |
| KG-30 | Step 1 → migrate attendee and both Telegram observation kinds from known producers beside existing target rows. Verify → namespaced module ownership, preserved IDs or explicit collision mapping, periods/claims/metadata retained and repeat upgrade is stable. Step 2 → query Meetings attendees and Telegram observed chat state/participants. Verify → equivalent reads; participant edges gain no observer state. Step 3 → try an undeclared kind, claim another module's namespace or write without permission, then perform an authorized cross-module write. Verify → invalid operations fail and the authorized write satisfies the same contract. Step 4 → uninstall the declaring module. Verify → historical rows stay readable and orphan declarations authorize no new writes. Unknown-producer conversion aborts atomically |
| KG-31 | Step 1 → prepare stored processing permission false beside a graph_index indexed status, and legacy null beside no status row. Step 2 → read with extras and export/restore using the versioned workspace codec. Verify → public statuses remain distinct from permission; the dump carries false/null permissions, no status-to-boolean conversion occurs and projection alone creates no graph_index row. Step 3 → round-trip non-default archive/privacy, pin order zero and a stopped sync pair. Verify → values survive the declared ID/viewer mapping and status follows the existing rebuild policy rather than a copied response default |

### Next logic story — migrate selection, reuse execution

This is a concrete continuation of the graph migration, not an additional release gate or a new automation engine. No implementation Delivery is approved here. The reference separates Graph events, subscriptions in Trigger configuration and actions through the existing TriggersService/EpisodesService path.

| Order | Migration work | Existing mechanism retained |
| --- | --- | --- |
| 1 | Produce typed committed events for domain Entity updates and Link additions/updates, including ordinary and batch writers | EventRepository and Graph mutation transactions; modules keep producing domain facts |
| 2 | Add subscriptions to the existing Trigger configuration, validators, CRUD, RPC and UI; replace watches-based candidate lookup for converted definitions | TriggersRepository and schema/kind registry; action_prompt, status, limits and existing schedule configuration |
| 3 | Feed selected events to TriggersService; use source Event ID for event-driven admission, child identity and execution history | Existing trigger_execution storage, createTriggeredChild, agent wake, parent context and created provenance |
| 4 | Convert supported legacy definitions without broadening their meaning; enable exactly one execution route for each converted Trigger | Old definitions remain on the legacy route until mapped; historical executions remain readable |
| 5 | Retire converted Email/Telegram trigger_checks and then obsolete watches/triggerable APIs and UI | Manual and scheduled execution; the scheduler also uses trigger.check, so the bus route is not removed indiscriminately |

A mailbox receipt subscription is not a replacement for an old sender watch. Email currently supplies sender-based candidates; Telegram supplies chat/sender candidates. Convert only definitions whose selection can be preserved with the available event payload and handler context. Inventory the remaining definitions and settle their mapping before retiring the old route. No hidden predicate language or new action configuration is introduced by this migration.

For event-driven runs, replace the current Trigger-ID-plus-Entity-ID firing key with Trigger ID plus Event ID. Record the input before action execution and attach the resulting Episode using the existing execution store. Preserve the old event_entity_id as context/history where applicable; never invent graph Event IDs for historical, manual or scheduled runs. Reuse current recovery behavior while adapting its identity, rather than introducing a second worker/state machine.

The new event wake is when information is committed to Graph. Current source-date admission must not silently discard newly learned past facts, and unknown occurrence time must remain unknown. Decide initial historical-import behavior explicitly before enabling actions on imported data; source recording is not evidence of fresh delivery. Keep existing access/private-data checks. TriggerGate currently always returns relevant; retaining gate_prompt does not establish semantic classification.

**Ending without a prior Link:** preserve the owner's Katya scenario as a required extension of this same path. Existing GraphClaim.kind ending can record an unknown start or end date without a Link row. The later contract must expose the accepted ending with endpoints/kind and source evidence even when deriveRelation produces no Link. link_ended is a discussed name; its payload and admission are still open, and neither link_updated nor a created historical Link alone proves a new departure. Resolve this before enabling ending subscriptions; do not add an employment-start date, use sync time for a missing end or mistake evidence withdrawal for departure.

| Follow-up change map | Existing owners; these are later-story writes |
| --- | --- |
| MODIFY: event production | App backend/src/core/event.ts and services/graph/event.repository.ts, graph.service.ts, graph.repository.ts, entity.repository.ts, link.repository.ts; claim.repository.ts and derive.ts for the ending decision |
| MODIFY: selection and execution | App backend/src/core/trigger.ts, services/triggers/types.ts, triggers.repository.ts, triggers.service.ts, triggers.controller.ts; extend db/schema/triggers.ts through the existing SQL migration/generation workflow |
| MODIFY: configuration and consumers | Catalog modules/triggers/entities.ts, types.ts, schema.ts, manifest.toml, module/service.ts and existing ui readers; SDK/RPC declarations on the integrated head |
| MODIFY: producer cutover | Catalog modules/email and modules/telegram service/type/manifest contracts; app backend/src/plugin-runtime/plugin-module-controller.ts and sync-receipt.ts; retain scheduler compatibility |

Before the later implementation is approved, name the SQL migration and exact compiler-reported callers on the integrated head. Reuse existing app backend/test/tst_bts_triggers_service.test.ts, tst_bts_triggers_repository.test.ts, tst_bts_triggers_executions.test.ts, tst_bts_triggers_schedule.test.ts and graph writer tests, plus catalog Trigger CRUD/history and Email/Telegram ingest tests. Focus verification on a received message reaching the existing Episode path, two distinct updates of one Entity, duplicate delivery of one Event, unchanged sender/chat selection, manual/schedule compatibility and an ending learned without a prior Link. This retains the concrete checks without specifying a new general rules engine.

### Test strategy and publication

Use existing repo scripts; new behavioral tests must first reproduce the missing guarantee. App scoped commands start with `bun run agent:test:backend -- test/<named-test>.test.ts`; SDK renames use the existing `bun run --cwd packages/sdk typecheck` and `bun run build:sdk`, followed by affected `typecheck:backend` / frontend `typecheck` callers. App staging currently has no agent:typecheck or agent:build:sdk alias; do not invent commands. Catalog module tests use `bun run agent:test:modules -- <test-path>` and catalog typechecking uses `bun run agent:typecheck`. Reuse harnesses rather than building another test runner.

For this documentation commit, verify preserved declarations, English text, Markdown/local links and TypeScript snippets. The normal commit hooks run `agent:verify:docs` and `agent:verify:commit`. For later implementation publication run each affected repository's complete `agent:verify:pr` once on the release inputs; preserve hooks and reuse passing results when inputs are unchanged. PostgreSQL migration/concurrency tests and package compatibility smoke are required evidence, not replaced by typecheck. A code version mismatch is investigated, not automatically a dependency upgrade.

## Reuse

Reuse SDK Entity/Link/statement/model/RPC schemas; existing UuidShapeSchema and GraphRef preparation; typed SQL tables, unique constraints and owner mutation fence; link_kinds registry; deterministic merge and derive functions; GraphClaim replacement; UsersService/UserRepository; workspace codecs; SDK build/host-stub generation; Graph/Search/User/Source test harnesses. Generated schema files follow the repository SQL introspection workflow. No alternate graph service, auth table, resolver or public extras JSONB store is introduced.

## New names

| Proposed name | Replaces / reason |
| --- | --- |
| PersistentEntityId / PersistentEntityIdSchema | Makes non-nil validation explicit instead of hiding it behind the general EntityId name |
| EntityId as assigned-or-nil | Represents a domain value before persistence; retires ambiguous NullableId terminology without admitting JavaScript null |
| DerivedEntity / DerivedLink / DerivedStatement | Owner-selected names for graph values derived from claims through extraction, aggregation or inference |
| EntityDerivation | Frees the existing helper name DerivedEntity for the graph Entity; parallels RelationDerivation |
| derivedStatementSchema / origin: derived | Aligns the runtime validator and serialized discriminator with DerivedStatement; migrates the legacy agent spelling explicitly |
| EntityExtras / EntityRead / IndexingStatus | Flat requested operational projection: pinOrder, archived, private, indexed status and the sync pair; typed columns and separate mutation authority |
| Model private | Required boolean on existing configured model types; authorizes private-data processing, including a declared-private cluster, independently of dataBoundary |
| AuthUserId / UserEntityBinding | Separates existing auth scope, including nil, from the new graph node; maps through users.entity_id instead of rekeying sessions |
| UserEntityProperties | Minimal public graph-user shape; deliberately excludes auth/admin/secrets fields |
| belongs_to | Shared organizational membership: triggers.belongs_to and proposed projects.belongs_to; chat communication needs its own evidence-backed mapping |
| CreatedLink / created | Generalizes the existing creation relation to Trigger → Episode and retires the inverse triggered_by spelling |
| meetings.attendee / telegram.observed_in / telegram.observed_participant | Move domain meanings from unqualified built-ins into the declaring module's namespace; preserve semantics and observer state |
| LinkedEntitySummary.direction | Distinguishes incoming provenance from outgoing results without additional stored inverse kinds |
| CommunicationLink / sent / received / sent_to / received_from | Two communication pairs: observed transmission/delivery and reported recipient/sender; received_from replaces sender-only email use of authored_by, not general content authorship. No stored inverse sent_by. Account/conversation representation remains a proposal |
| GraphMutationEvent | Identified Link addition/update or Entity domain-data update; recorded-time notification connects to existing execution in the later story |
| GraphSubscription / GraphEventFilter | Select a Link kind and endpoints or an Entity schema and ID; runtime replacement of watches/trigger.check is deferred |
| TriggerExecution event excerpt | Adds source Event identity to existing execution history; retains Episode/action_prompt and separate manual/schedule paths |
| owner | Protected system relationship, with ordinary write rejection on every route |

## Not verified

No product changes or migrations were executed in this authoring turn. The exact integration head after the prerequisite work, complete compiler-derived consumer file list, migration row counts, data-dependent overlap conflicts, generated API version and release artifact compatibility must be measured before executable Stage approval. No PR publication or deployment is authorized by this documentation commit.

Persistent-ID and Derived naming and the configured-model trust rule reflect owner decisions. Legacy pin ordering, auth-user mapping/self-owned bootstrap, bounded transfer and refusal of conflicting extras on merge are explicit proposals presented for SPEC approval, not claims of prior owner approval. Wider ACL, connected cross-owner transfer, field-level derived provenance, richer merge extras arbitration, unmerge, general alias consolidation, revision-queue storage/recovery and cloud policy beyond the existing embedding scope remain follow-up contracts. Bounded ownership transfer additionally requires the closed-owner-history read/export decision in D and remains unavailable until it is defined. Section G requires endpoint/conversation and repeated-delivery identity decisions for communication. The subscription migration is documented as a follow-up using existing Trigger execution and is not a graph-release gate. Historical-import policy, faithful sender/chat mapping and the ending-without-Link event contract remain explicit decisions before their affected paths are enabled. Project-membership consolidation and the direction-preserving neighbor projection are review proposals. Creation-link reversal and event-based Trigger selection reflect the owner's requests. The plan does not silently manufacture missing facts or promise these changes are implemented.
<!-- plan:spec:end -->

<!-- plan:implementation:start -->
## Implementation contract

<!-- plan:delivery:D1:start -->
<!-- plan:delivery-meta:{"active":true,"depends":[],"predictedExternalWaitMinutes":0,"repository":"app"} -->
### PR Delivery D1 — Adopt domain Entity, extras and protected graph ownership

Branch: `feat/knowledge-graph-contracts`; Depends: none; Gate: backend, frontend, sdk, core, cli, e2e.

Stage graph: `D1-S1 -> D1-S2 -> D1-S3 -> D1-S4 -> D1-S5 -> D1-S6 -> D1-S7 -> D2-S1 -> D2-S2 -> D1-S8 -> D2-S3 -> D2-S4 -> D1-S9`.

Forecast: 1335 active min / 0 credits across 9 Stages; longest dependency path 1170 active min; external waits 0 min.

Separate the knowledge graph value from operational extras across SDK, storage and app reads. Migrate persistent/derived naming, private-model trust, temporal relation kinds and graph users while preserving auth scope, identity and workspace data. Existing merge, extraction, Search, GraphService and Trigger/Episode runtime paths remain the implementation owners.

This plan has two coordinated PRs, one in each repository. They are peer Deliveries; the explicit cross-repository Stage dependencies determine execution order. Neither new runtime nor catalog package is released independently. Existing owner merge/release authority remains in place.

Implementation baseline reconciliation is complete: app origin/staging 3ac048c5a7bb549591a982a6b07aa95aa2e72bb4 and catalog origin/staging 6a9e8d5ae744b1e2b1d06823562c87e002396258 include entity-one-type, entity-sync, module dependencies and contact-identity prerequisites. Refresh both refs at implementation start and inspect any new delta. These observations supersede the dated checkout/path/script observations in the approved SPEC; they do not change its behavior. SDK linked-entity.ts and merge.ts now own the old backend graph-view/merge contracts.

Before starting a Task, create a dedicated app checkout at /mnt/movies/dev/home/Coding/magnis-app/.worktrees/knowledge-graph-contracts on feat/knowledge-graph-contracts from the verified app integration head. Retain the current catalog docs checkout/branch and merge its current origin/staging after committing this plan. Resolve documentation conflicts while preserving the locked contract. Do not edit or reuse the entity-sync/identity worktrees.

Bind repository names app and catalog for this plan checkout with worktree-local Git configuration, using extensions.worktreeConfig after checking existing core.worktree/core.bare settings, then git config --worktree code-production.repository.app and .catalog. The shared app binding currently points to entity-sync and must remain unchanged. Verify resolved branch and root for both Deliveries before start_task.

Estimates cover 26 Tasks and 13 sequential Stages: 1,585 active implementation minutes plus 285 verification minutes, 1,870 total (about 31 hours). They are scope estimates, not measured execution or a calendar promise. Owner decisions, CI/review waits and migration preflight repairs are unestimated. Numeric zero credits/external waits are placeholders required by the plan format, not a claim of free execution or no waiting.

Approval of this draft authorizes no inference of the open communication decisions. D1-S8 and D2-S3 remain gated until mailbox/account, conversation and repeated-delivery identity are decided and the exact contract is amended and approved. Bounded ownership transfer stays unavailable pending its closed-history read/export contract. Event/subscription/action execution, ending notifications, revision-queue redesign and wider privacy enforcement remain the documented next stories.

Coverage: D1-S1 covers KG-01/17; D1-S2 and D2-S1 cover KG-02–05; D1-S3 covers KG-14/18; D1-S4 and D2-S2 cover KG-06/19/20/28–30; D1-S5 covers KG-07/08 and KG-09's unavailable prerequisite; D1-S6 covers KG-10–13/15/16/31; D1-S8 and D2-S3 cover KG-21/28/29 only after the communication amendment. D1-S7/D2-S4/D1-S9 verify compatibility and release inputs. KG-22–27 are not acceptance IDs in the approved SPEC. Future Trigger and enabled-transfer behavior is not reported as implemented.

Use the current repositories' existing agent:* scripts. On the integrated app, agent:build:sdk and agent:typecheck now exist. Catalog agent:test:backend accepts exact Vitest or Bun target paths; execute those runners separately. Verify prerequisites with the current baseline build and preserve hooks. Run scoped checks per Stage and the full affected gate once on final publication inputs, reusing unchanged passes. All declared write paths are repository-relative; generated host stubs and channel fixtures use their existing generators.

<!-- plan:stage:D1-S1:start -->
<!-- plan:stage-meta:{"deliveryId":"D1","depends":[],"parallelWith":[],"writes":["packages/sdk/src/core/entity.ts","packages/sdk/src/core/id.ts","packages/sdk/src/core/link.ts","packages/sdk/src/core/statement.ts","packages/sdk/src/core/indexing.ts","packages/sdk/src/core/graph-commands.ts","packages/sdk/src/rpc/native/graph.ts","packages/sdk/src/rpc/native/search.ts","packages/sdk/src/index.ts","packages/sdk/test/graph.contract.test.ts","backend/test/tst_bts_core_entity.test.ts","backend/test/tst_bts_core_link.test.ts","backend/migrations/20261006000000_graph_derived_origin.sql","backend/src/db/schema/graph.ts","backend/src/services/graph/derive.ts","backend/src/services/graph/claim.repository.ts","backend/src/services/graph/entity.repository.ts","backend/src/services/graph/link.repository.ts","backend/src/services/graph/graph.repository.ts","backend/src/services/graph/graph.service.ts","backend/src/services/search/graph-indexer.ts","backend/src/services/search/search-query-compiler.repository.ts","backend/test/tst_bts_graph_statement_checks.test.ts","backend/test/tst_bts_graph_statement_integration.test.ts","backend/src/core/entity.ts","backend/src/core/graph-commands.ts","backend/src/core/link.ts","backend/src/core/workspace-transfer.ts","backend/src/services/graph/graph.transfer.ts","backend/src/services/graph/types.ts","frontend/src/runtime/agent/contributions.ts","frontend/src/runtime/contracts/__tests__/contracts.test.ts","frontend/src/runtime/contracts/agent.ts","frontend/src/runtime/contracts/index.ts","backend/test/tst_bts_agents_memory_repositories.test.ts","backend/test/tst_bts_graph_approval.test.ts","backend/test/tst_bts_graph_batch.test.ts","backend/test/tst_bts_graph_end.test.ts","backend/test/tst_bts_graph_merge.test.ts","backend/test/tst_bts_graph_merge_pg.test.ts","backend/test/tst_bts_graph_overlay.test.ts","backend/test/tst_bts_graph_relations_table.test.ts","backend/test/tst_bts_graph_statement_write.test.ts","backend/test/tst_bts_modules_registry.test.ts","backend/test/tst_bts_prt_link_gates.test.ts","backend/test/tst_bts_search_statement.test.ts","backend/test/tst_bts_workspace_document.test.ts","backend/test/tst_bts_workspace_export.test.ts","frontend/src/panels/context/__tests__/panelRegions.test.tsx","packages/sdk/test/contract-kernel.test.ts","backend/src/services/workspace/workspace-document.ts","backend/src/agent/episodes/episodes.service.ts","backend/src/core/event.ts","backend/src/plugin-runtime/ops/graph-entity-ops.ts","backend/src/plugin-runtime/ops/graph-integration-ops.ts","backend/src/plugin-runtime/ops/graph-mutation-ops.ts","backend/src/plugin-runtime/ops/graph-op-support.ts","backend/src/plugin-runtime/ops/graph-query-ops.ts","backend/src/plugin-runtime/ops/graph-targeted-ops.ts","backend/src/plugin-runtime/ops/graph-window-ops.ts","backend/src/services/file/file.service.ts","backend/src/services/graph/graph-index.repository.ts","backend/src/services/graph/graph.controller.ts","backend/src/services/graph/merge.ts","backend/src/services/groups/groups-module.service.ts","backend/src/services/search/entity-search.repository.ts","backend/src/services/search/graph-neighbor-search.ts","backend/src/services/search/indexing-model.ts","backend/src/services/search/search-ablation.service.ts","backend/src/services/search/search-indexer.service.ts","backend/src/services/search/search.service.ts","backend/src/services/triggers/triggers.controller.ts","backend/src/services/triggers/triggers.repository.ts","backend/src/services/triggers/triggers.service.ts","backend/src/services/web/web-module.controller.ts","backend/src/services/web/web.service.ts","backend/src/transport/http/debug.controller.ts","backend/src/transport/http/files.helpers.ts","backend/src/transport/websocket/controllers/graph.ts","backend/test/harness/graph.ts","backend/test/tst_bts_agents_attachments.test.ts","backend/test/tst_bts_agents_tasktodo.test.ts","backend/test/tst_bts_api_rpc_manifest.test.ts","backend/test/tst_bts_core_event.test.ts","backend/test/tst_bts_file_service.test.ts","backend/test/tst_bts_graph_derive.test.ts","backend/test/tst_bts_graph_pins.test.ts","backend/test/tst_bts_graph_search_contract.test.ts","backend/test/tst_bts_graph_service.test.ts","backend/test/tst_bts_graph_window.test.ts","backend/test/tst_bts_groups_module.test.ts","backend/test/tst_bts_modules_native.test.ts","backend/test/tst_bts_prt_lifecycle.test.ts","backend/test/tst_bts_prt_sync_atomic_001.test.ts","backend/test/tst_bts_prt_user_001.test.ts","backend/test/tst_bts_search_ablation.test.ts","backend/test/tst_bts_search_chunker.test.ts","backend/test/tst_bts_search_combined.test.ts","backend/test/tst_bts_search_indexer.test.ts","backend/test/tst_bts_search_module.test.ts","backend/test/tst_bts_search_multicriteria.test.ts","backend/test/tst_bts_search_service.test.ts","backend/test/tst_bts_triggers_repository.test.ts","backend/test/tst_bts_triggers_service.test.ts","backend/test/tst_bts_web_service.test.ts","packages/sdk/src/core/plugin.ts","packages/sdk/src/core/merge.ts","backend/src/core/graph-query.ts","backend/src/services/graph/graph-contracts.ts","backend/src/plugin-runtime/ops/source-control-ops.ts","backend/src/services/file/download-worker.ts","backend/test/tst_bts_entity_one_type_events.test.ts","backend/test/tst_bts_graph_wire_pins.test.ts","backend/src/services/search/types.ts","packages/sdk/test/rpc-registry.test.ts","backend/src/services/search/declared-card.ts","backend/test/tst_bts_dataset_document.test.ts","backend/test/tst_bts_eval_fixture.test.ts","backend/test/tst_bts_workspace_transfer.test.ts","backend/test/tst_bts_workspace_template.test.ts","backend/test/tst_bts_triggers_module.test.ts","backend/test/tst_bts_search_visibility.test.ts","docs/datasets.md","docs/architecture/entity-lifecycle.md","docs/agent/memory-roadmap.md","docs/agent/speculative-graph-overlay.md","docs/plugins/authoring.md","docs/backend/ai-models.md","docs/backend/workspace-transfer.md","docs/backend/episodes.md","docs/search.md","backend/test/tst_bts_agent_loop.test.ts"],"tempRoot":".tmp/code-production/entity-docs/D1-S1","predictedActiveMinutes":190,"predictedCredits":0,"verifyActiveMinutes":20,"verifyCredits":0} -->
#### Stage D1-S1 — Make persistence and derived origin explicit

- Owner: Codex; Profile: strong; Depends: none; Parallel with: none.
- Writes: `packages/sdk/src/core/entity.ts`, `packages/sdk/src/core/id.ts`, `packages/sdk/src/core/link.ts`, `packages/sdk/src/core/statement.ts`, `packages/sdk/src/core/indexing.ts`, `packages/sdk/src/core/graph-commands.ts`, `packages/sdk/src/rpc/native/graph.ts`, `packages/sdk/src/rpc/native/search.ts`, `packages/sdk/src/index.ts`, `packages/sdk/test/graph.contract.test.ts`, `backend/test/tst_bts_core_entity.test.ts`, `backend/test/tst_bts_core_link.test.ts`, `backend/migrations/20261006000000_graph_derived_origin.sql`, `backend/src/db/schema/graph.ts`, `backend/src/services/graph/derive.ts`, `backend/src/services/graph/claim.repository.ts`, `backend/src/services/graph/entity.repository.ts`, `backend/src/services/graph/link.repository.ts`, `backend/src/services/graph/graph.repository.ts`, `backend/src/services/graph/graph.service.ts`, `backend/src/services/search/graph-indexer.ts`, `backend/src/services/search/search-query-compiler.repository.ts`, `backend/test/tst_bts_graph_statement_checks.test.ts`, `backend/test/tst_bts_graph_statement_integration.test.ts`, `backend/src/core/entity.ts`, `backend/src/core/graph-commands.ts`, `backend/src/core/link.ts`, `backend/src/core/workspace-transfer.ts`, `backend/src/services/graph/graph.transfer.ts`, `backend/src/services/graph/types.ts`, `frontend/src/runtime/agent/contributions.ts`, `frontend/src/runtime/contracts/__tests__/contracts.test.ts`, `frontend/src/runtime/contracts/agent.ts`, `frontend/src/runtime/contracts/index.ts`, `backend/test/tst_bts_agents_memory_repositories.test.ts`, `backend/test/tst_bts_graph_approval.test.ts`, `backend/test/tst_bts_graph_batch.test.ts`, `backend/test/tst_bts_graph_end.test.ts`, `backend/test/tst_bts_graph_merge.test.ts`, `backend/test/tst_bts_graph_merge_pg.test.ts`, `backend/test/tst_bts_graph_overlay.test.ts`, `backend/test/tst_bts_graph_relations_table.test.ts`, `backend/test/tst_bts_graph_statement_write.test.ts`, `backend/test/tst_bts_modules_registry.test.ts`, `backend/test/tst_bts_prt_link_gates.test.ts`, `backend/test/tst_bts_search_statement.test.ts`, `backend/test/tst_bts_workspace_document.test.ts`, `backend/test/tst_bts_workspace_export.test.ts`, `frontend/src/panels/context/__tests__/panelRegions.test.tsx`, `packages/sdk/test/contract-kernel.test.ts`, `backend/src/services/workspace/workspace-document.ts`, `backend/src/agent/episodes/episodes.service.ts`, `backend/src/core/event.ts`, `backend/src/plugin-runtime/ops/graph-entity-ops.ts`, `backend/src/plugin-runtime/ops/graph-integration-ops.ts`, `backend/src/plugin-runtime/ops/graph-mutation-ops.ts`, `backend/src/plugin-runtime/ops/graph-op-support.ts`, `backend/src/plugin-runtime/ops/graph-query-ops.ts`, `backend/src/plugin-runtime/ops/graph-targeted-ops.ts`, `backend/src/plugin-runtime/ops/graph-window-ops.ts`, `backend/src/services/file/file.service.ts`, `backend/src/services/graph/graph-index.repository.ts`, `backend/src/services/graph/graph.controller.ts`, `backend/src/services/graph/merge.ts`, `backend/src/services/groups/groups-module.service.ts`, `backend/src/services/search/entity-search.repository.ts`, `backend/src/services/search/graph-neighbor-search.ts`, `backend/src/services/search/indexing-model.ts`, `backend/src/services/search/search-ablation.service.ts`, `backend/src/services/search/search-indexer.service.ts`, `backend/src/services/search/search.service.ts`, `backend/src/services/triggers/triggers.controller.ts`, `backend/src/services/triggers/triggers.repository.ts`, `backend/src/services/triggers/triggers.service.ts`, `backend/src/services/web/web-module.controller.ts`, `backend/src/services/web/web.service.ts`, `backend/src/transport/http/debug.controller.ts`, `backend/src/transport/http/files.helpers.ts`, `backend/src/transport/websocket/controllers/graph.ts`, `backend/test/harness/graph.ts`, `backend/test/tst_bts_agents_attachments.test.ts`, `backend/test/tst_bts_agents_tasktodo.test.ts`, `backend/test/tst_bts_api_rpc_manifest.test.ts`, `backend/test/tst_bts_core_event.test.ts`, `backend/test/tst_bts_file_service.test.ts`, `backend/test/tst_bts_graph_derive.test.ts`, `backend/test/tst_bts_graph_pins.test.ts`, `backend/test/tst_bts_graph_search_contract.test.ts`, `backend/test/tst_bts_graph_service.test.ts`, `backend/test/tst_bts_graph_window.test.ts`, `backend/test/tst_bts_groups_module.test.ts`, `backend/test/tst_bts_modules_native.test.ts`, `backend/test/tst_bts_prt_lifecycle.test.ts`, `backend/test/tst_bts_prt_sync_atomic_001.test.ts`, `backend/test/tst_bts_prt_user_001.test.ts`, `backend/test/tst_bts_search_ablation.test.ts`, `backend/test/tst_bts_search_chunker.test.ts`, `backend/test/tst_bts_search_combined.test.ts`, `backend/test/tst_bts_search_indexer.test.ts`, `backend/test/tst_bts_search_module.test.ts`, `backend/test/tst_bts_search_multicriteria.test.ts`, `backend/test/tst_bts_search_service.test.ts`, `backend/test/tst_bts_triggers_repository.test.ts`, `backend/test/tst_bts_triggers_service.test.ts`, `backend/test/tst_bts_web_service.test.ts`, `packages/sdk/src/core/plugin.ts`, `packages/sdk/src/core/merge.ts`, `backend/src/core/graph-query.ts`, `backend/src/services/graph/graph-contracts.ts`, `backend/src/plugin-runtime/ops/source-control-ops.ts`, `backend/src/services/file/download-worker.ts`, `backend/test/tst_bts_entity_one_type_events.test.ts`, `backend/test/tst_bts_graph_wire_pins.test.ts`, `backend/src/services/search/types.ts`, `packages/sdk/test/rpc-registry.test.ts`, `backend/src/services/search/declared-card.ts`., `backend/test/tst_bts_dataset_document.test.ts`, `backend/test/tst_bts_eval_fixture.test.ts`, `backend/test/tst_bts_workspace_transfer.test.ts`, `backend/test/tst_bts_workspace_template.test.ts`, `backend/test/tst_bts_triggers_module.test.ts`, `backend/test/tst_bts_search_visibility.test.ts`, `docs/datasets.md`, `docs/architecture/entity-lifecycle.md`, `docs/agent/memory-roadmap.md`, `docs/agent/speculative-graph-overlay.md`, `docs/plugins/authoring.md`, `docs/backend/ai-models.md`, `docs/backend/workspace-transfer.md`, `docs/backend/episodes.md`, `docs/search.md`, `backend/test/tst_bts_agent_loop.test.ts`.
- Temp root: `.tmp/code-production/entity-docs/D1-S1` (must be absent at handoff).
- Of which verification: 20 active min / 0 credits.

Declare and migrate the persistence and derived-origin contracts before separating operational state. The baseline is app 3ac048c5a7bb549591a982a6b07aa95aa2e72bb4; it already contains entity-sync, module dependencies and contact-identity repairs. Reuse those definitions rather than restoring older checkout copies.

Compiler scope update: the first persistence typecheck reported 424 errors across 77 backend files. The additional paths below are callers of the approved ID contract; they add no product behavior beyond that contract. Parse IDs at existing admission/storage boundaries and propagate the validated types; do not widen the branded type or insert unchecked casts.

Acceptance: KG-01, KG-17 and unchanged human-approval evidence. Commit: refactor(graph): distinguish persistent IDs and derived statements.

##### Tasks

- [x] KG_CORE_001 — Saved graph references reject nil while unsaved Entity values remain representable. (55 min) — 1d617022fd9b68c39498fefb54dfd1367ca21f3f
<!-- plan:task-meta:{"writes":["packages/sdk/src/core/entity.ts","packages/sdk/src/core/id.ts","packages/sdk/src/core/link.ts","packages/sdk/src/core/statement.ts","packages/sdk/src/core/indexing.ts","packages/sdk/src/core/graph-commands.ts","packages/sdk/src/rpc/native/graph.ts","packages/sdk/src/rpc/native/search.ts","packages/sdk/src/index.ts","packages/sdk/test/graph.contract.test.ts","backend/test/tst_bts_core_entity.test.ts","backend/test/tst_bts_core_link.test.ts"],"predictedActiveMinutes":55,"predictedCredits":0,"how":"1. Reproduce KG-01 with two unsaved nil Entities and rejected persisted references in the existing contract tests. 2. Use the approved PersistentEntityIdSchema and keep auth/source/schema domains separate. Follow compiler-reported reference boundaries; nil remains legal only for unsaved Entity values. 3. Apply /rename to the owning DerivedStatement/DerivedLink/DerivedEntity declarations and rename the existing derive result to EntityDerivation. Compile each affected project; preserve GraphClaim indexed/manual origins.","red":"bun run agent:test:backend -- test/tst_bts_core_entity.test.ts test/tst_bts_core_link.test.ts"} -->
- [x] KG_CORE_002 — Existing agent-origin records migrate to derived without changing evidence or periods. (65 min) — 1d617022fd9b68c39498fefb54dfd1367ca21f3f
<!-- plan:task-meta:{"writes":["backend/migrations/20261006000000_graph_derived_origin.sql","backend/src/db/schema/graph.ts","backend/src/services/graph/derive.ts","backend/src/services/graph/claim.repository.ts","backend/src/services/graph/entity.repository.ts","backend/src/services/graph/link.repository.ts","backend/src/services/graph/graph.repository.ts","backend/src/services/graph/graph.service.ts","backend/src/services/search/graph-indexer.ts","backend/src/services/search/search-query-compiler.repository.ts","backend/test/tst_bts_graph_statement_checks.test.ts","backend/test/tst_bts_graph_statement_integration.test.ts"],"predictedActiveMinutes":65,"predictedCredits":0,"how":"1. Add KG-17 fixtures for both Entity and Link, unrelated agent strings, legacy workspace origins and repeat upgrades; unknown discriminators abort without partial mutation. 2. Migrate stored discriminators and constraints in one SQL transaction, then regenerate DB declarations. Convert origin predicates in the owning Graph and Search paths. 3. Coordinate cutover with the final paired artifacts; no old process writes while the migration runs. Do not replace source producer names, claims origins or arbitrary JSON strings.","red":"bun run agent:test:backend -- test/tst_bts_graph_statement_checks.test.ts test/tst_bts_graph_statement_integration.test.ts"} -->
- [x] KG_CORE_003 — All current app callers compile against the renamed graph statements. (50 min) — dbf1f237650f8ef8cb85d815c25a7239ec2a54df
<!-- plan:task-meta:{"writes":["backend/src/core/entity.ts","backend/src/core/graph-commands.ts","backend/src/core/link.ts","backend/src/core/workspace-transfer.ts","backend/src/services/graph/graph.transfer.ts","backend/src/services/graph/types.ts","frontend/src/runtime/agent/contributions.ts","frontend/src/runtime/contracts/__tests__/contracts.test.ts","frontend/src/runtime/contracts/agent.ts","frontend/src/runtime/contracts/index.ts","packages/sdk/src/core/entity.ts","packages/sdk/src/core/link.ts","packages/sdk/src/core/statement.ts","packages/sdk/src/index.ts","backend/test/tst_bts_agents_memory_repositories.test.ts","backend/test/tst_bts_core_link.test.ts","backend/test/tst_bts_graph_approval.test.ts","backend/test/tst_bts_graph_batch.test.ts","backend/test/tst_bts_graph_end.test.ts","backend/test/tst_bts_graph_merge.test.ts","backend/test/tst_bts_graph_merge_pg.test.ts","backend/test/tst_bts_graph_overlay.test.ts","backend/test/tst_bts_graph_relations_table.test.ts","backend/test/tst_bts_graph_statement_checks.test.ts","backend/test/tst_bts_graph_statement_integration.test.ts","backend/test/tst_bts_graph_statement_write.test.ts","backend/test/tst_bts_modules_registry.test.ts","backend/test/tst_bts_prt_link_gates.test.ts","backend/test/tst_bts_search_statement.test.ts","backend/test/tst_bts_workspace_document.test.ts","backend/test/tst_bts_workspace_export.test.ts","frontend/src/panels/context/__tests__/panelRegions.test.tsx","packages/sdk/test/contract-kernel.test.ts","packages/sdk/test/graph.contract.test.ts","backend/src/services/workspace/workspace-document.ts","backend/src/agent/episodes/episodes.service.ts","backend/src/core/event.ts","backend/src/plugin-runtime/ops/graph-entity-ops.ts","backend/src/plugin-runtime/ops/graph-integration-ops.ts","backend/src/plugin-runtime/ops/graph-mutation-ops.ts","backend/src/plugin-runtime/ops/graph-op-support.ts","backend/src/plugin-runtime/ops/graph-query-ops.ts","backend/src/plugin-runtime/ops/graph-targeted-ops.ts","backend/src/plugin-runtime/ops/graph-window-ops.ts","backend/src/services/file/file.service.ts","backend/src/services/graph/entity.repository.ts","backend/src/services/graph/graph-index.repository.ts","backend/src/services/graph/graph.controller.ts","backend/src/services/graph/graph.repository.ts","backend/src/services/graph/graph.service.ts","backend/src/services/graph/link.repository.ts","backend/src/services/graph/merge.ts","backend/src/services/groups/groups-module.service.ts","backend/src/services/search/entity-search.repository.ts","backend/src/services/search/graph-indexer.ts","backend/src/services/search/graph-neighbor-search.ts","backend/src/services/search/indexing-model.ts","backend/src/services/search/search-ablation.service.ts","backend/src/services/search/search-indexer.service.ts","backend/src/services/search/search.service.ts","backend/src/services/triggers/triggers.controller.ts","backend/src/services/triggers/triggers.repository.ts","backend/src/services/triggers/triggers.service.ts","backend/src/services/web/web-module.controller.ts","backend/src/services/web/web.service.ts","backend/src/transport/http/debug.controller.ts","backend/src/transport/http/files.helpers.ts","backend/src/transport/websocket/controllers/graph.ts","backend/test/harness/graph.ts","backend/test/tst_bts_agents_attachments.test.ts","backend/test/tst_bts_agents_tasktodo.test.ts","backend/test/tst_bts_api_rpc_manifest.test.ts","backend/test/tst_bts_core_entity.test.ts","backend/test/tst_bts_core_event.test.ts","backend/test/tst_bts_file_service.test.ts","backend/test/tst_bts_graph_derive.test.ts","backend/test/tst_bts_graph_pins.test.ts","backend/test/tst_bts_graph_search_contract.test.ts","backend/test/tst_bts_graph_service.test.ts","backend/test/tst_bts_graph_window.test.ts","backend/test/tst_bts_groups_module.test.ts","backend/test/tst_bts_modules_native.test.ts","backend/test/tst_bts_prt_lifecycle.test.ts","backend/test/tst_bts_prt_sync_atomic_001.test.ts","backend/test/tst_bts_prt_user_001.test.ts","backend/test/tst_bts_search_ablation.test.ts","backend/test/tst_bts_search_chunker.test.ts","backend/test/tst_bts_search_combined.test.ts","backend/test/tst_bts_search_indexer.test.ts","backend/test/tst_bts_search_module.test.ts","backend/test/tst_bts_search_multicriteria.test.ts","backend/test/tst_bts_search_service.test.ts","backend/test/tst_bts_triggers_repository.test.ts","backend/test/tst_bts_triggers_service.test.ts","backend/test/tst_bts_web_service.test.ts","packages/sdk/src/core/plugin.ts","packages/sdk/src/core/merge.ts","backend/src/core/graph-query.ts","backend/src/services/graph/graph-contracts.ts","backend/src/plugin-runtime/ops/source-control-ops.ts","backend/src/services/file/download-worker.ts","backend/test/tst_bts_entity_one_type_events.test.ts","backend/test/tst_bts_graph_wire_pins.test.ts","backend/src/services/search/types.ts","packages/sdk/test/rpc-registry.test.ts","backend/src/services/search/declared-card.ts","backend/test/tst_bts_dataset_document.test.ts","backend/test/tst_bts_eval_fixture.test.ts","backend/test/tst_bts_workspace_transfer.test.ts","backend/test/tst_bts_workspace_template.test.ts","backend/test/tst_bts_triggers_module.test.ts","backend/test/tst_bts_search_visibility.test.ts","docs/datasets.md","docs/architecture/entity-lifecycle.md","docs/agent/memory-roadmap.md","docs/agent/speculative-graph-overlay.md","docs/plugins/authoring.md","docs/backend/ai-models.md","docs/backend/workspace-transfer.md","docs/backend/episodes.md","docs/search.md","backend/test/tst_bts_agent_loop.test.ts"],"predictedActiveMinutes":50,"predictedCredits":0,"how":"1. Update only compiler-reported consumers and fixtures of the changed declarations; preserve deliberate legacy-import fixtures using agent. 2. Update versioned workspace origin conversion in the existing codec and retain source IDs, timestamps and raw assertions. 3. Run the SDK build and affected backend/frontend typechecks. If compilation identifies an unlisted file, declare that exact path through planctl before editing it; do not add unrelated refactors. 4. Reconcile documentation anchors and affected origin/Workspace descriptions reported by the publication gate.","red":"bun run agent:test:backend -- test/tst_bts_graph_approval.test.ts test/tst_bts_graph_merge_pg.test.ts test/tst_bts_workspace_document.test.ts"} -->

##### Acceptance criteria

- [x] `bun run agent:build:sdk` exits 0 — dbf1f237650f8ef8cb85d815c25a7239ec2a54df
- [x] `bun run agent:test:backend -- test/tst_bts_core_entity.test.ts test/tst_bts_core_link.test.ts test/tst_bts_graph_statement_integration.test.ts test/tst_bts_workspace_document.test.ts` exits 0 — dbf1f237650f8ef8cb85d815c25a7239ec2a54df
- [x] Commit — dbf1f237650f8ef8cb85d815c25a7239ec2a54df

##### Results

<!-- plan:results:D1-S1:start -->
| Task | Commit | UTC start-end | Active / elapsed | Usage | Result / proof |
|---|---|---|---:|---|---|
| KG_CORE_001 | 1d617022fd9b68c39498fefb54dfd1367ca21f3f | 2026-10-07T08:46:25.891Z–2026-10-07T10:10:07.918Z | 83.70045 / 83.70045 min | unavailable: not measured by planctl | Persistent IDs reject nil; transient values retain it. Derived types and origin SQL preserve evidence, periods, source identity and approval. Legacy workspaces normalize to v6. SDK 66 tests; app typechecks; commit hooks: 708 backend and 680 frontend tests, lint and docs passed. Web URL skipping preserved. |
| KG_CORE_002 | 1d617022fd9b68c39498fefb54dfd1367ca21f3f | 2026-10-07T08:46:25.891Z–2026-10-07T10:10:07.918Z | 83.70045 / 83.70045 min | unavailable: not measured by planctl | Persistent IDs reject nil; transient values retain it. Derived types and origin SQL preserve evidence, periods, source identity and approval. Legacy workspaces normalize to v6. SDK 66 tests; app typechecks; commit hooks: 708 backend and 680 frontend tests, lint and docs passed. Web URL skipping preserved. |
| KG_CORE_003 | 1d617022fd9b68c39498fefb54dfd1367ca21f3f | 2026-10-07T08:46:25.891Z–2026-10-07T10:10:07.918Z | 83.70045 / 83.70045 min | unavailable: not measured by planctl | Persistent IDs reject nil; transient values retain it. Derived types and origin SQL preserve evidence, periods, source identity and approval. Legacy workspaces normalize to v6. SDK 66 tests; app typechecks; commit hooks: 708 backend and 680 frontend tests, lint and docs passed. Web URL skipping preserved. |
| KG_CORE_003 | 37a6e37b4296e3157d77e3abbc77af59eede2bc4 | 2026-10-07T10:14:50.248Z–2026-10-07T10:17:17.786Z | 2.4589666666666665 / 2.4589666666666665 min | unavailable: not measured by planctl | Publication repair: reconciled nine documentation anchors and Derived/Workspace v6 descriptions; docs:check and hooks passed. Implementation remains 1d617022f; subsequent commits change documentation only. |
| KG_CORE_003 | dbf1f237650f8ef8cb85d815c25a7239ec2a54df | 2026-10-07T10:22:19.871Z–2026-10-07T10:24:18.254Z | 1.97305 / 1.97305 min | unavailable: not measured by planctl | Full publication gate exposed one remaining attachment fixture with non-UUID graph IDs (2279 passed, one failed). Updated only its IDs; all eight AgentLoop tests and commit hooks pass. Graph implementation unchanged. |
<!-- plan:results:D1-S1:end -->
<!-- plan:stage:D1-S1:end -->

<!-- plan:stage:D1-S2:start -->
<!-- plan:stage-meta:{"deliveryId":"D1","depends":["D1-S1"],"parallelWith":[],"writes":["backend/migrations/20261006000001_graph_extras.sql","backend/src/db/schema/graph.ts","backend/src/db/repository-helpers.ts","backend/src/core/entity.ts","backend/src/services/graph/entity.repository.ts","backend/src/services/graph/graph-index.repository.ts","backend/test/tst_bts_graph_pins.test.ts","backend/test/tst_bts_graph_entity_repo_contract.test.ts","backend/test/tst_bts_core_sync_state_001.test.ts","packages/sdk/src/core/entity.ts","packages/sdk/src/core/graph-commands.ts","packages/sdk/src/core/plugin.ts","packages/sdk/src/rpc/native/graph.ts","packages/sdk/src/rpc/native/search.ts","packages/sdk/src/rpc/registry.ts","backend/src/core/graph-commands.ts","packages/sdk/src/core/linked-entity.ts","backend/src/services/graph/types.ts","backend/src/services/graph/graph.service.ts","backend/src/services/graph/graph.controller.ts","backend/src/services/graph/graph.repository.ts","backend/src/services/search/entity-search.repository.ts","backend/src/services/search/search-query-compiler.repository.ts","backend/src/plugin-runtime/ops/graph-entity-ops.ts","backend/src/plugin-runtime/ops/graph-integration-ops.ts","backend/src/plugin-runtime/ops/graph-mutation-ops.ts","backend/src/plugin-runtime/ops/graph-op-support.ts","backend/src/plugin-runtime/ops/graph-query-ops.ts","backend/src/plugin-runtime/ops/graph-targeted-ops.ts","backend/src/plugin-runtime/ops/graph-window-ops.ts","backend/test/tst_bts_graph_wire_pins.test.ts","backend/test/tst_bts_entity_one_type_host_protocol.test.ts","cli/src/__tests__/app.test.tsx","cli/src/__tests__/commands.test.ts","frontend/src/components/agent/__tests__/delegation-surface.test.tsx","frontend/src/components/layout/ModuleListContent.tsx","frontend/src/components/ui/groupHelpers.ts","frontend/src/hooks/useEntityContextMenu.ts","frontend/src/modules/_base/BaseListItem.tsx","frontend/src/modules/_base/BaseModuleComponent.tsx","frontend/src/modules/_base/__tests__/BaseModuleComponent.test.tsx","frontend/src/modules/_base/__tests__/useEntityProperty.test.tsx","frontend/src/modules/_base/types.ts","frontend/src/modules/episodes/AgentModule.tsx","frontend/src/modules/episodes/EpisodeDetailWrapper.tsx","frontend/src/modules/episodes/__tests__/chatFilter.test.ts","frontend/src/modules/episodes/__tests__/helpers.test.ts","frontend/src/modules/episodes/helpers.ts","frontend/src/modules/episodes/index.tsx","frontend/src/modules/episodes/types.ts","frontend/src/modules/settings/AccountSync.tsx","frontend/src/modules/settings/__tests__/AccountSync.test.tsx","frontend/src/panels/context/contextPanelMerge.ts","frontend/src/runtime/agent/contributions.ts","frontend/src/runtime/contracts/__tests__/contracts.test.ts","frontend/src/runtime/contracts/agent.ts","frontend/src/runtime/contracts/index.ts","packages/client-core/src/__tests__/AgentChatStore.canonical.test.ts","packages/client-core/src/__tests__/EpisodeResource.registry.test.ts","packages/client-core/src/__tests__/EpisodeResource.testKit.ts","packages/client-core/src/episodes/collection.ts","packages/client-core/src/episodes/list.ts","packages/client-core/src/types/episode.ts","backend/test/tst_bts_entity_one_type_transport.test.ts","packages/sdk/src/core/indexing.ts","packages/sdk/src/core/search.ts","packages/sdk/src/index.ts","packages/sdk/test/graph.contract.test.ts","backend/src/core/graph-query.ts","backend/src/services/search/types.ts","backend/src/plugin-runtime/ops/build-ops.ts","backend/src/agent/episodes/episodes.service.ts","backend/src/plugin-runtime/plugin-runtime.service.ts","backend/src/services/graph/graph.transfer.ts","backend/src/services/graph/merge.ts","backend/src/services/triggers/triggers.repository.ts","backend/src/services/workspace/workspace-document.ts","backend/test/tst_bts_core_entity.test.ts","backend/test/tst_bts_dataset_format.test.ts","backend/test/tst_bts_graph_merge_pg.test.ts","backend/test/tst_bts_search_ablation.test.ts","backend/test/tst_bts_search_statement.test.ts","backend/test/tst_bts_workspace_document.test.ts","backend/src/core/workspace-transfer.ts","backend/src/core/index.ts","backend/src/services/search/graph-indexer.ts","backend/test/tst_bts_agents_attachments.test.ts","backend/test/tst_bts_episodes_repository.test.ts","backend/test/tst_bts_triggers_repository.test.ts","backend/src/app/composition-wiring.module.ts","backend/test/tst_bts_graph_statement_integration.test.ts","backend/test/tst_bts_prt_lifecycle.test.ts","backend/test/tst_bts_search_indexer.test.ts","backend/src/transport/websocket/controllers/graph.ts","backend/src/services/search/search-tool-set.ts","backend/test/tst_bts_prt_ops.test.ts","backend/src/services/search/search-query-resolve.ts","backend/src/services/search/search-tool-defs.ts","backend/src/services/search/search-module.controller.ts","backend/src/services/search/search-declaration.ts","backend/src/services/search/search.service.ts","backend/src/agent/episodes/episode-views.repository.ts","backend/test/tst_bts_graph_service.test.ts","backend/test/tst_bts_prt_sync_atomic_001.test.ts","backend/test/tst_bts_graph_search_tools.test.ts","backend/test/tst_bts_graph_statement_write.test.ts","docs/frontend/module-standard.md"],"tempRoot":".tmp/code-production/entity-docs/D1-S2","predictedActiveMinutes":225,"predictedCredits":0,"verifyActiveMinutes":25,"verifyCredits":0} -->
#### Stage D1-S2 — Separate flat extras and preserve operational storage

- Owner: Codex; Profile: strong; Depends: D1-S1; Parallel with: none.
- Writes: `backend/migrations/20261006000001_graph_extras.sql`, `backend/src/db/schema/graph.ts`, `backend/src/db/repository-helpers.ts`, `backend/src/core/entity.ts`, `backend/src/services/graph/entity.repository.ts`, `backend/src/services/graph/graph-index.repository.ts`, `backend/test/tst_bts_graph_pins.test.ts`, `backend/test/tst_bts_graph_entity_repo_contract.test.ts`, `backend/test/tst_bts_core_sync_state_001.test.ts`, `packages/sdk/src/core/entity.ts`, `packages/sdk/src/core/graph-commands.ts`, `packages/sdk/src/core/plugin.ts`, `packages/sdk/src/rpc/native/graph.ts`, `packages/sdk/src/rpc/native/search.ts`, `packages/sdk/src/rpc/registry.ts`, `backend/src/core/graph-commands.ts`, `packages/sdk/src/core/linked-entity.ts`, `backend/src/services/graph/types.ts`, `backend/src/services/graph/graph.service.ts`, `backend/src/services/graph/graph.controller.ts`, `backend/src/services/graph/graph.repository.ts`, `backend/src/services/search/entity-search.repository.ts`, `backend/src/services/search/search-query-compiler.repository.ts`, `backend/src/plugin-runtime/ops/graph-entity-ops.ts`, `backend/src/plugin-runtime/ops/graph-integration-ops.ts`, `backend/src/plugin-runtime/ops/graph-mutation-ops.ts`, `backend/src/plugin-runtime/ops/graph-op-support.ts`, `backend/src/plugin-runtime/ops/graph-query-ops.ts`, `backend/src/plugin-runtime/ops/graph-targeted-ops.ts`, `backend/src/plugin-runtime/ops/graph-window-ops.ts`, `backend/test/tst_bts_graph_wire_pins.test.ts`, `backend/test/tst_bts_entity_one_type_host_protocol.test.ts`, `cli/src/__tests__/app.test.tsx`, `cli/src/__tests__/commands.test.ts`, `frontend/src/components/agent/__tests__/delegation-surface.test.tsx`, `frontend/src/components/layout/ModuleListContent.tsx`, `frontend/src/components/ui/groupHelpers.ts`, `frontend/src/hooks/useEntityContextMenu.ts`, `frontend/src/modules/_base/BaseListItem.tsx`, `frontend/src/modules/_base/BaseModuleComponent.tsx`, `frontend/src/modules/_base/__tests__/BaseModuleComponent.test.tsx`, `frontend/src/modules/_base/__tests__/useEntityProperty.test.tsx`, `frontend/src/modules/_base/types.ts`, `frontend/src/modules/episodes/AgentModule.tsx`, `frontend/src/modules/episodes/EpisodeDetailWrapper.tsx`, `frontend/src/modules/episodes/__tests__/chatFilter.test.ts`, `frontend/src/modules/episodes/__tests__/helpers.test.ts`, `frontend/src/modules/episodes/helpers.ts`, `frontend/src/modules/episodes/index.tsx`, `frontend/src/modules/episodes/types.ts`, `frontend/src/modules/settings/AccountSync.tsx`, `frontend/src/modules/settings/__tests__/AccountSync.test.tsx`, `frontend/src/panels/context/contextPanelMerge.ts`, `frontend/src/runtime/agent/contributions.ts`, `frontend/src/runtime/contracts/__tests__/contracts.test.ts`, `frontend/src/runtime/contracts/agent.ts`, `frontend/src/runtime/contracts/index.ts`, `packages/client-core/src/__tests__/AgentChatStore.canonical.test.ts`, `packages/client-core/src/__tests__/EpisodeResource.registry.test.ts`, `packages/client-core/src/__tests__/EpisodeResource.testKit.ts`, `packages/client-core/src/episodes/collection.ts`, `packages/client-core/src/episodes/list.ts`, `packages/client-core/src/types/episode.ts`, `backend/test/tst_bts_entity_one_type_transport.test.ts`, `packages/sdk/src/core/indexing.ts`, `packages/sdk/src/core/search.ts`, `packages/sdk/src/index.ts`, `packages/sdk/test/graph.contract.test.ts`, `backend/src/core/graph-query.ts`, `backend/src/services/search/types.ts`, `backend/src/plugin-runtime/ops/build-ops.ts`, `backend/src/agent/episodes/episodes.service.ts`, `backend/src/plugin-runtime/plugin-runtime.service.ts`, `backend/src/services/graph/graph.transfer.ts`, `backend/src/services/graph/merge.ts`, `backend/src/services/triggers/triggers.repository.ts`, `backend/src/services/workspace/workspace-document.ts`, `backend/test/tst_bts_core_entity.test.ts`, `backend/test/tst_bts_dataset_format.test.ts`, `backend/test/tst_bts_graph_merge_pg.test.ts`, `backend/test/tst_bts_search_ablation.test.ts`, `backend/test/tst_bts_search_statement.test.ts`, `backend/test/tst_bts_workspace_document.test.ts`, `backend/src/core/workspace-transfer.ts`, `backend/src/core/index.ts`, `backend/src/services/search/graph-indexer.ts`, `backend/test/tst_bts_agents_attachments.test.ts`, `backend/test/tst_bts_episodes_repository.test.ts`, `backend/test/tst_bts_triggers_repository.test.ts`, `backend/src/app/composition-wiring.module.ts`, `backend/test/tst_bts_graph_statement_integration.test.ts`, `backend/test/tst_bts_prt_lifecycle.test.ts`, `backend/test/tst_bts_search_indexer.test.ts`, `backend/src/transport/websocket/controllers/graph.ts`, `backend/src/services/search/search-tool-set.ts`, `backend/test/tst_bts_prt_ops.test.ts`, `backend/src/services/search/search-query-resolve.ts`, `backend/src/services/search/search-tool-defs.ts`, `backend/src/services/search/search-module.controller.ts`, `backend/src/services/search/search-declaration.ts`, `backend/src/services/search/search.service.ts`, `backend/src/agent/episodes/episode-views.repository.ts`, `backend/test/tst_bts_graph_service.test.ts`, `backend/test/tst_bts_prt_sync_atomic_001.test.ts`, `backend/test/tst_bts_graph_search_tools.test.ts`, `backend/test/tst_bts_graph_statement_write.test.ts`, `docs/frontend/module-standard.md`.
- Temp root: `.tmp/code-production/entity-docs/D1-S2` (must be absent at handoff).
- Of which verification: 25 active min / 0 credits.

Entity becomes the knowledge value; flat extras remains a requested read projection over existing columns. This commit includes the app's readers and visible controls so the SDK/runtime boundary stays coherent. No extras JSONB table or new public indexing status is introduced.

Acceptance: KG-02, KG-03, KG-04 and KG-05. Commit: refactor(graph): separate operational extras from Entity.

##### Tasks

- [x] KG_EXTRAS_001 — Pin order, archive and sync state survive the flat extras migration. (65 min) — db2437a7e — 800711b78d629016941174fa8f4d99a656c236b4
<!-- plan:task-meta:{"writes":["backend/migrations/20261006000001_graph_extras.sql","backend/src/db/schema/graph.ts","backend/src/db/repository-helpers.ts","backend/src/core/entity.ts","backend/src/services/graph/entity.repository.ts","backend/src/services/graph/graph-index.repository.ts","backend/test/tst_bts_graph_pins.test.ts","backend/test/tst_bts_graph_entity_repo_contract.test.ts","backend/test/tst_bts_core_sync_state_001.test.ts","backend/test/tst_bts_graph_service.test.ts"],"predictedActiveMinutes":65,"predictedCredits":0,"how":"1. Reproduce KG-02 through KG-05: viewer-specific pins including zero and unordered pins, archive null normalization, missing index status and complete sync pairs. 2. Implement the approved legacy pin mapping and retain deprecated evidence/backup. Keep typed columns and the stored processing boolean; a missing graph_index row projects pending without creating one. 3. Move operational read state out of Entity, preserving explicit source sync selections/revisions and rejecting half pairs. Keep domain mutation authority separate from pin/archive/privacy/sync commands.","red":"bun run agent:test:backend -- test/tst_bts_graph_pins.test.ts test/tst_bts_graph_entity_repo_contract.test.ts test/tst_bts_core_sync_state_001.test.ts"} -->
- [x] KG_EXTRAS_002 — Graph and plugin reads return either domain Entity or explicitly requested EntityRead. (80 min) — db2437a7e
<!-- plan:task-meta:{"writes":["packages/sdk/src/core/entity.ts","packages/sdk/src/core/graph-commands.ts","packages/sdk/src/core/plugin.ts","packages/sdk/src/rpc/native/graph.ts","packages/sdk/src/rpc/native/search.ts","packages/sdk/src/rpc/registry.ts","backend/src/core/graph-commands.ts","packages/sdk/src/core/linked-entity.ts","backend/src/services/graph/types.ts","backend/src/services/graph/graph.service.ts","backend/src/services/graph/graph.controller.ts","backend/src/services/graph/graph.repository.ts","backend/src/services/search/entity-search.repository.ts","backend/src/services/search/search-query-compiler.repository.ts","backend/src/plugin-runtime/ops/graph-entity-ops.ts","backend/src/plugin-runtime/ops/graph-integration-ops.ts","backend/src/plugin-runtime/ops/graph-mutation-ops.ts","backend/src/plugin-runtime/ops/graph-op-support.ts","backend/src/plugin-runtime/ops/graph-query-ops.ts","backend/src/plugin-runtime/ops/graph-targeted-ops.ts","backend/src/plugin-runtime/ops/graph-window-ops.ts","backend/test/tst_bts_graph_wire_pins.test.ts","backend/test/tst_bts_entity_one_type_host_protocol.test.ts","packages/sdk/src/core/indexing.ts","packages/sdk/src/core/search.ts","packages/sdk/src/index.ts","packages/sdk/test/graph.contract.test.ts","backend/src/core/graph-query.ts","backend/src/services/search/types.ts","backend/src/plugin-runtime/ops/build-ops.ts","backend/src/agent/episodes/episodes.service.ts","backend/src/core/entity.ts","backend/src/plugin-runtime/plugin-runtime.service.ts","backend/src/services/graph/entity.repository.ts","backend/src/services/graph/graph.transfer.ts","backend/src/services/graph/merge.ts","backend/src/services/triggers/triggers.repository.ts","backend/src/services/workspace/workspace-document.ts","backend/test/tst_bts_core_entity.test.ts","backend/test/tst_bts_dataset_format.test.ts","backend/test/tst_bts_graph_entity_repo_contract.test.ts","backend/test/tst_bts_graph_merge_pg.test.ts","backend/test/tst_bts_graph_pins.test.ts","backend/test/tst_bts_search_ablation.test.ts","backend/test/tst_bts_search_statement.test.ts","backend/test/tst_bts_workspace_document.test.ts","backend/src/core/workspace-transfer.ts","backend/src/core/index.ts","backend/src/services/search/graph-indexer.ts","backend/test/tst_bts_agents_attachments.test.ts","backend/test/tst_bts_episodes_repository.test.ts","backend/test/tst_bts_triggers_repository.test.ts","backend/src/app/composition-wiring.module.ts","backend/test/tst_bts_graph_statement_integration.test.ts","backend/test/tst_bts_prt_lifecycle.test.ts","backend/test/tst_bts_search_indexer.test.ts","backend/src/transport/websocket/controllers/graph.ts","backend/src/services/search/search-tool-set.ts","backend/test/tst_bts_prt_ops.test.ts","backend/src/services/search/search-query-resolve.ts","backend/src/services/search/search-tool-defs.ts","backend/src/services/search/search-module.controller.ts","backend/src/services/search/search-declaration.ts","backend/src/services/search/search.service.ts","backend/src/agent/episodes/episode-views.repository.ts","backend/test/tst_bts_prt_sync_atomic_001.test.ts","backend/test/tst_bts_graph_search_tools.test.ts","backend/test/tst_bts_graph_statement_write.test.ts"],"predictedActiveMinutes":80,"predictedCredits":0,"how":"1. Add strict response checks for bare Entity versus extras, including no public owner/trigger array and invalid missing/null statuses. 2. Extend existing detail/list/window/traversal/search contracts with an explicit extras projection, preserving their existing pagination and wrapper structure. Preserve null-for-not-found behavior where the existing API uses it. 3. Keep ACL/archive/privacy enforcement on both projections. Leave indexed status read-only and retain the old boolean processing control under its explicitly separate command contract; do not reinterpret the boolean as an enum.","red":"bun run agent:test:backend -- test/tst_bts_graph_wire_pins.test.ts test/tst_bts_entity_one_type_host_protocol.test.ts"} -->
- [x] KG_EXTRAS_003 — App lists and cards preserve pinning and sync controls using extras. (55 min) — db2437a7e — 9dced935d6c782b5f3519caf499c05aec5e063e2
<!-- plan:task-meta:{"writes":["cli/src/__tests__/app.test.tsx","cli/src/__tests__/commands.test.ts","frontend/src/components/agent/__tests__/delegation-surface.test.tsx","frontend/src/components/layout/ModuleListContent.tsx","frontend/src/components/ui/groupHelpers.ts","frontend/src/hooks/useEntityContextMenu.ts","frontend/src/modules/_base/BaseListItem.tsx","frontend/src/modules/_base/BaseModuleComponent.tsx","frontend/src/modules/_base/__tests__/BaseModuleComponent.test.tsx","frontend/src/modules/_base/__tests__/useEntityProperty.test.tsx","frontend/src/modules/_base/types.ts","frontend/src/modules/episodes/AgentModule.tsx","frontend/src/modules/episodes/EpisodeDetailWrapper.tsx","frontend/src/modules/episodes/__tests__/chatFilter.test.ts","frontend/src/modules/episodes/__tests__/helpers.test.ts","frontend/src/modules/episodes/helpers.ts","frontend/src/modules/episodes/index.tsx","frontend/src/modules/episodes/types.ts","frontend/src/modules/settings/AccountSync.tsx","frontend/src/modules/settings/__tests__/AccountSync.test.tsx","frontend/src/panels/context/contextPanelMerge.ts","frontend/src/runtime/agent/contributions.ts","frontend/src/runtime/contracts/__tests__/contracts.test.ts","frontend/src/runtime/contracts/agent.ts","frontend/src/runtime/contracts/index.ts","packages/client-core/src/__tests__/AgentChatStore.canonical.test.ts","packages/client-core/src/__tests__/EpisodeResource.registry.test.ts","packages/client-core/src/__tests__/EpisodeResource.testKit.ts","packages/client-core/src/episodes/collection.ts","packages/client-core/src/episodes/list.ts","packages/client-core/src/types/episode.ts","backend/test/tst_bts_entity_one_type_transport.test.ts"],"predictedActiveMinutes":55,"predictedCredits":0,"how":"1. Request EntityRead only in consumers that need operational state and unwrap domain data at the existing client boundaries. 2. Use pinOrder !== null, remove duplicate pinned state, and preserve supplied integer order, archive and stopped-sync behavior. Domain-only paths do not acquire extra joins. 3. Follow compiler errors for the affected clients, then run the existing list/context/menu and transport scenarios. Catalog consumers are handled in D2-S1 before release.","red":"bun run agent:test:frontend -- src/modules/_base/__tests__/BaseModuleComponent.test.tsx"} -->

##### Acceptance criteria

- [x] `bun run agent:test:backend -- test/tst_bts_graph_pins.test.ts test/tst_bts_graph_entity_repo_contract.test.ts test/tst_bts_core_sync_state_001.test.ts test/tst_bts_entity_one_type_transport.test.ts` exits 0 — 800711b78d629016941174fa8f4d99a656c236b4
- [x] `bun run agent:test:frontend -- src/modules/_base/__tests__/BaseModuleComponent.test.tsx` exits 0 — 800711b78d629016941174fa8f4d99a656c236b4
- [x] `bun run agent:typecheck` exits 0 — 800711b78d629016941174fa8f4d99a656c236b4
- [x] Commit — 800711b78d629016941174fa8f4d99a656c236b4

##### Results

<!-- plan:results:D1-S2:start -->
| Task | Commit | UTC start-end | Active / elapsed | Usage | Result / proof |
|---|---|---|---:|---|---|
| KG_EXTRAS_001 | db2437a7e | 2026-10-07T10:13:37.559Z–2026-10-07T11:28:56.959Z | 75.32333333333334 / 75.32333333333334 min | unavailable: not measured by planctl | Entity is a strict domain value; explicit EntityRead carries flat extras over typed storage. Pin migration preserves order zero, allocates unordered legacy pins per viewer, retains evidence and rolls back on overflow. Missing index status projects pending without writes; processing permission stays separate. Source replay, stopped sync, exact bigint revisions and atomic sync acknowledgements are preserved. SDK: 67 passing tests; scoped Graph/RPC/plugin/Search and UI checks pass; hook gate: 622 backend passed, 1 existing skip, 24 frontend passed, typechecks and lint green. |
| KG_EXTRAS_002 | db2437a7e | 2026-10-07T10:13:37.559Z–2026-10-07T11:28:56.959Z | 75.32333333333334 / 75.32333333333334 min | unavailable: not measured by planctl | Entity is a strict domain value; explicit EntityRead carries flat extras over typed storage. Pin migration preserves order zero, allocates unordered legacy pins per viewer, retains evidence and rolls back on overflow. Missing index status projects pending without writes; processing permission stays separate. Source replay, stopped sync, exact bigint revisions and atomic sync acknowledgements are preserved. SDK: 67 passing tests; scoped Graph/RPC/plugin/Search and UI checks pass; hook gate: 622 backend passed, 1 existing skip, 24 frontend passed, typechecks and lint green. |
| KG_EXTRAS_003 | db2437a7e | 2026-10-07T10:13:37.559Z–2026-10-07T11:28:56.959Z | 75.32333333333334 / 75.32333333333334 min | unavailable: not measured by planctl | Entity is a strict domain value; explicit EntityRead carries flat extras over typed storage. Pin migration preserves order zero, allocates unordered legacy pins per viewer, retains evidence and rolls back on overflow. Missing index status projects pending without writes; processing permission stays separate. Source replay, stopped sync, exact bigint revisions and atomic sync acknowledgements are preserved. SDK: 67 passing tests; scoped Graph/RPC/plugin/Search and UI checks pass; hook gate: 622 backend passed, 1 existing skip, 24 frontend passed, typechecks and lint green. |
| KG_EXTRAS_003 | 9dced935d6c782b5f3519caf499c05aec5e063e2 | 2026-10-07T16:21:41.112Z–2026-10-07T16:26:56.868Z | 5.2626 / 5.2626 min | unavailable: not measured by planctl | BaseModuleComponent preserves declared module RPC parameters and leaves Graph extras selection to each module; regression RED to GREEN, frontend typecheck/lint and 25 hook tests pass. |
| KG_EXTRAS_001 | 800711b78d629016941174fa8f4d99a656c236b4 | 2026-10-08T07:42:25.808Z–2026-10-08T12:16:25.803Z | 273.99991666666665 / 273.99991666666665 min | unavailable: not measured by planctl | Retired legacy Telegram chat indexed=false in the SQL extras migration and v6 workspace upgrade while preserving stopped sync and exact bigint revisions; both regressions were RED, 24 scoped tests and full typecheck passed, commit hook passed 52 backend tests. — beyond writes: backend/src/services/workspace/workspace-document.ts, backend/test/tst_bts_workspace_document.test.ts, docs/frontend/module-standard.md |
<!-- plan:results:D1-S2:end -->
<!-- plan:stage:D1-S2:end -->

<!-- plan:stage:D1-S3:start -->
<!-- plan:stage-meta:{"deliveryId":"D1","depends":["D1-S2"],"parallelWith":[],"writes":["packages/sdk/src/core/ai-model.ts","packages/sdk/src/rpc/native/ai-models.ts","backend/src/agent/models/types.ts","backend/src/agent/models/ai-model.repository.ts","backend/src/agent/models/ai-model-management.service.ts","backend/src/agent/models/ai-model-directory.service.ts","backend/src/db/schema/ai.ts","backend/migrations/20261006000001_graph_extras.sql","backend/src/services/settings/settings.service.ts","frontend/src/modules/settings/ModelsPanel.tsx","frontend/src/modules/settings/hooks/useAiModels.ts","frontend/src/modules/settings/hooks/__tests__/useAiModels.test.tsx","backend/test/tst_bts_ai_models_contract.test.ts","backend/test/tst_bts_ai_models_control_plane.test.ts","backend/src/services/search/search-index.repository.ts","backend/src/services/search/search-indexer.service.ts","backend/src/services/search/search-query-compiler.repository.ts","backend/src/services/search/search-query-helpers.ts","backend/src/services/search/ranked-search-scope.repository.ts","backend/src/services/search/entity-search.repository.ts","backend/test/tst_bts_search_visibility.test.ts","backend/test/tst_bts_search_indexer.test.ts","packages/sdk/src/http/system-settings.ts","packages/sdk/src/index.ts","backend/src/transport/http/settings.controller.ts","frontend/src/modules/settings/aiModelsShared.tsx","backend/test/harness/full-process-turn.ts","backend/test/tst_bts_ai_runtime_mock.test.ts","backend/test/tst_bts_delegation_001.test.ts","backend/test/tst_bts_search_ablation.test.ts","backend/test/tst_bts_search_boundary.test.ts","backend/test/tst_bts_search_lifecycle.test.ts","backend/test/tst_bts_search_module.test.ts","backend/test/tst_bts_settings_app_ai.test.ts","backend/test/tst_bts_workspace_installation.test.ts","backend/src/services/search/search-index-lifecycle.ts","backend/src/services/search/search-index-lifecycle.service.ts","backend/src/services/search/search.service.ts","backend/src/services/search/types.ts","backend/test/harness/search.ts","backend/test/tst_bts_graph_pins.test.ts","backend/test/tst_bts_search_indexer_stop_001.test.ts","backend/test/tst_bts_search_readiness.test.ts","backend/test/tst_bts_search_service.test.ts","backend/test/tst_bts_search_statement.test.ts","backend/test/tst_bts_search_status.test.ts","backend/test/tst_bts_search_storage.test.ts","backend/test/tst_bts_workspace_profile.test.ts","packages/sdk/test/external-consumer.test.ts","docs/datasets.md","docs/architecture/entity-lifecycle.md","docs/frontend/module-standard.md","docs/agent/memory-roadmap.md","docs/agent/speculative-graph-overlay.md","docs/plugins/authoring.md","docs/backend/ai-models.md","docs/backend/workspace-transfer.md","docs/backend/episodes.md","docs/search.md","backend/test/tst_bts_settings_facade.test.ts"],"tempRoot":".tmp/code-production/entity-docs/D1-S3","predictedActiveMinutes":150,"predictedCredits":0,"verifyActiveMinutes":20,"verifyCredits":0} -->
#### Stage D1-S3 — Enforce private-model trust for embedding work

- Owner: Codex; Profile: strong; Depends: D1-S2; Parallel with: none.
- Writes: `packages/sdk/src/core/ai-model.ts`, `packages/sdk/src/rpc/native/ai-models.ts`, `backend/src/agent/models/types.ts`, `backend/src/agent/models/ai-model.repository.ts`, `backend/src/agent/models/ai-model-management.service.ts`, `backend/src/agent/models/ai-model-directory.service.ts`, `backend/src/db/schema/ai.ts`, `backend/migrations/20261006000001_graph_extras.sql`, `backend/src/services/settings/settings.service.ts`, `frontend/src/modules/settings/ModelsPanel.tsx`, `frontend/src/modules/settings/hooks/useAiModels.ts`, `frontend/src/modules/settings/hooks/__tests__/useAiModels.test.tsx`, `backend/test/tst_bts_ai_models_contract.test.ts`, `backend/test/tst_bts_ai_models_control_plane.test.ts`, `backend/src/services/search/search-index.repository.ts`, `backend/src/services/search/search-indexer.service.ts`, `backend/src/services/search/search-query-compiler.repository.ts`, `backend/src/services/search/search-query-helpers.ts`, `backend/src/services/search/ranked-search-scope.repository.ts`, `backend/src/services/search/entity-search.repository.ts`, `backend/test/tst_bts_search_visibility.test.ts`, `backend/test/tst_bts_search_indexer.test.ts`, `packages/sdk/src/http/system-settings.ts`, `packages/sdk/src/index.ts`, `backend/src/transport/http/settings.controller.ts`, `frontend/src/modules/settings/aiModelsShared.tsx`, `backend/test/harness/full-process-turn.ts`, `backend/test/tst_bts_ai_runtime_mock.test.ts`, `backend/test/tst_bts_delegation_001.test.ts`, `backend/test/tst_bts_search_ablation.test.ts`, `backend/test/tst_bts_search_boundary.test.ts`, `backend/test/tst_bts_search_lifecycle.test.ts`, `backend/test/tst_bts_search_module.test.ts`, `backend/test/tst_bts_settings_app_ai.test.ts`, `backend/test/tst_bts_workspace_installation.test.ts`, `backend/src/services/search/search-index-lifecycle.ts`, `backend/src/services/search/search-index-lifecycle.service.ts`, `backend/src/services/search/search.service.ts`, `backend/src/services/search/types.ts`, `backend/test/harness/search.ts`, `backend/test/tst_bts_graph_pins.test.ts`, `backend/test/tst_bts_search_indexer_stop_001.test.ts`, `backend/test/tst_bts_search_readiness.test.ts`, `backend/test/tst_bts_search_service.test.ts`, `backend/test/tst_bts_search_statement.test.ts`, `backend/test/tst_bts_search_status.test.ts`, `backend/test/tst_bts_search_storage.test.ts`, `backend/test/tst_bts_workspace_profile.test.ts`, `packages/sdk/test/external-consumer.test.ts`, `docs/datasets.md`, `docs/architecture/entity-lifecycle.md`, `docs/frontend/module-standard.md`, `docs/agent/memory-roadmap.md`, `docs/agent/speculative-graph-overlay.md`, `docs/plugins/authoring.md`, `docs/backend/ai-models.md`, `docs/backend/workspace-transfer.md`, `docs/backend/episodes.md`, `docs/search.md`, `backend/test/tst_bts_settings_facade.test.ts`.
- Temp root: `.tmp/code-production/entity-docs/D1-S3` (must be absent at handoff).
- Of which verification: 20 active min / 0 credits.

Use configured model trust for the approved embedding privacy boundary. Reuse model settings, logical-model storage and search policy; no new classifier or model-location detector is added.

Acceptance: KG-14 and KG-18. Commit: feat(graph): enforce configured model trust for private indexing.

##### Tasks

- [x] KG_PRIVACY_001 — Configured model trust survives refresh and is invalidated when its endpoint changes. (70 min) — a980ef7d6705b59fcc896d54a5b35c58bec51f5d
<!-- plan:task-meta:{"writes":["packages/sdk/src/core/ai-model.ts","packages/sdk/src/rpc/native/ai-models.ts","backend/src/agent/models/types.ts","backend/src/agent/models/ai-model.repository.ts","backend/src/agent/models/ai-model-management.service.ts","backend/src/agent/models/ai-model-directory.service.ts","backend/src/db/schema/ai.ts","backend/migrations/20261006000001_graph_extras.sql","backend/src/services/settings/settings.service.ts","frontend/src/modules/settings/ModelsPanel.tsx","frontend/src/modules/settings/hooks/useAiModels.ts","frontend/src/modules/settings/hooks/__tests__/useAiModels.test.tsx","backend/test/tst_bts_ai_models_contract.test.ts","backend/test/tst_bts_ai_models_control_plane.test.ts","packages/sdk/src/http/system-settings.ts","packages/sdk/src/index.ts","backend/src/transport/http/settings.controller.ts","frontend/src/modules/settings/aiModelsShared.tsx","backend/test/harness/full-process-turn.ts","backend/test/tst_bts_ai_runtime_mock.test.ts","backend/test/tst_bts_delegation_001.test.ts","backend/test/tst_bts_search_ablation.test.ts","backend/test/tst_bts_search_boundary.test.ts","backend/test/tst_bts_search_lifecycle.test.ts","backend/test/tst_bts_search_module.test.ts","backend/test/tst_bts_settings_app_ai.test.ts","backend/test/tst_bts_workspace_installation.test.ts","packages/sdk/test/external-consumer.test.ts","backend/test/tst_bts_settings_facade.test.ts"],"predictedActiveMinutes":70,"predictedCredits":0,"how":"1. Reproduce KG-18 for known local execution, unclassified endpoints, an explicitly private cluster and endpoint replacement. 2. Add the required private boolean to existing logical-model storage and responses. Establish local execution from the configured adapter/binding, not dataBoundary alone; keep dataBoundary metadata. 3. Use existing administration permissions/revision events. Persist trust at the same endpoint and require reclassification after an endpoint change.","red":"bun run agent:test:backend -- test/tst_bts_ai_models_contract.test.ts test/tst_bts_ai_models_control_plane.test.ts"} -->
- [x] KG_PRIVACY_002 — Private records are absent from embedding selection and ranked reads under an untrusted model. (60 min) — a980ef7d6705b59fcc896d54a5b35c58bec51f5d
<!-- plan:task-meta:{"writes":["backend/src/services/search/search-index.repository.ts","backend/src/services/search/search-indexer.service.ts","backend/src/services/search/search-query-compiler.repository.ts","backend/src/services/search/search-query-helpers.ts","backend/src/services/search/ranked-search-scope.repository.ts","backend/src/services/search/entity-search.repository.ts","backend/test/tst_bts_search_visibility.test.ts","backend/test/tst_bts_search_indexer.test.ts","backend/src/services/search/search-index-lifecycle.ts","backend/src/services/search/search-index-lifecycle.service.ts","backend/src/services/search/search.service.ts","backend/src/services/search/types.ts","backend/test/harness/search.ts","backend/test/tst_bts_graph_pins.test.ts","backend/test/tst_bts_search_indexer_stop_001.test.ts","backend/test/tst_bts_search_readiness.test.ts","backend/test/tst_bts_search_service.test.ts","backend/test/tst_bts_search_statement.test.ts","backend/test/tst_bts_search_status.test.ts","backend/test/tst_bts_search_storage.test.ts","backend/test/tst_bts_workspace_profile.test.ts","backend/test/tst_bts_search_lifecycle.test.ts","docs/datasets.md","docs/architecture/entity-lifecycle.md","docs/frontend/module-standard.md","docs/agent/memory-roadmap.md","docs/agent/speculative-graph-overlay.md","docs/plugins/authoring.md","docs/backend/ai-models.md","docs/backend/workspace-transfer.md","docs/backend/episodes.md","docs/search.md"],"predictedActiveMinutes":60,"predictedCredits":0,"how":"1. Reproduce KG-14 with private/non-private records, denied models, known local execution and a declared-private remote cluster. 2. Apply !entityPrivate || model.private consistently before selection, audit, counts and ranked hydration alongside existing ACL and processing controls. 3. Verify subsequent requests after trust revocation use the refreshed policy. Preserve the SPEC's explicit limits for requests already in flight and for chat/extraction enforcement.","red":"bun run agent:test:backend -- test/tst_bts_search_visibility.test.ts test/tst_bts_search_indexer.test.ts"} -->

##### Acceptance criteria

- [x] `bun run agent:test:backend -- test/tst_bts_ai_models_contract.test.ts test/tst_bts_ai_models_control_plane.test.ts test/tst_bts_search_visibility.test.ts test/tst_bts_search_indexer.test.ts` exits 0 — a980ef7d6705b59fcc896d54a5b35c58bec51f5d
- [x] `bun run agent:test:frontend -- src/modules/settings/hooks/__tests__/useAiModels.test.tsx` exits 0 — a980ef7d6705b59fcc896d54a5b35c58bec51f5d
- [x] Commit — a980ef7d6705b59fcc896d54a5b35c58bec51f5d

##### Results

<!-- plan:results:D1-S3:start -->
| Task | Commit | UTC start-end | Active / elapsed | Usage | Result / proof |
|---|---|---|---:|---|---|
| KG_PRIVACY_001 | a980ef7d6705b59fcc896d54a5b35c58bec51f5d | 2026-10-07T11:29:40.053Z–2026-10-07T12:00:17.001Z | 30.6158 / 30.6158 min | unavailable: not measured by planctl | RED reproduced required-trust validation, persistence loss, legacy endpoint bypass, private pre-limit ranking and candidate-selection leaks, and Settings cache availability loss. GREEN: migration distinguishes verified local adapter from remote/device_only labels; administrator-only required boolean, catalog refresh/restart persistence, both endpoint reset paths; fresh trust false/true/false matrix across selection, audit, counts, lexical/exact/ANN/hybrid ranking; sync/ACL/processing behavior preserved. Commit hooks passed 214 backend tests, 44 frontend tests, typechecks, lint and docs checks. SDK 67 tests/build pass; strict naming audit findings are recorded for the already-planned D1-S7 gate. |
| KG_PRIVACY_002 | a980ef7d6705b59fcc896d54a5b35c58bec51f5d | 2026-10-07T11:29:40.053Z–2026-10-07T12:00:17.001Z | 30.6158 / 30.6158 min | unavailable: not measured by planctl | RED reproduced required-trust validation, persistence loss, legacy endpoint bypass, private pre-limit ranking and candidate-selection leaks, and Settings cache availability loss. GREEN: migration distinguishes verified local adapter from remote/device_only labels; administrator-only required boolean, catalog refresh/restart persistence, both endpoint reset paths; fresh trust false/true/false matrix across selection, audit, counts, lexical/exact/ANN/hybrid ranking; sync/ACL/processing behavior preserved. Commit hooks passed 214 backend tests, 44 frontend tests, typechecks, lint and docs checks. SDK 67 tests/build pass; strict naming audit findings are recorded for the already-planned D1-S7 gate. |
<!-- plan:results:D1-S3:end -->
<!-- plan:stage:D1-S3:end -->

<!-- plan:stage:D1-S4:start -->
<!-- plan:stage-meta:{"deliveryId":"D1","depends":["D1-S3"],"parallelWith":[],"writes":["backend/migrations/20261006000002_graph_membership.sql","packages/sdk/src/core/link.ts","packages/sdk/src/core/linked-entity.ts","backend/src/services/graph/graph-contracts.ts","backend/src/services/graph/graph.registrar.ts","backend/src/services/graph/link.repository.ts","backend/src/services/graph/graph.transfer.ts","backend/src/db/schema/graph.ts","backend/test/tst_bts_graph_link_kinds.test.ts","backend/test/tst_bts_graph_merge_pg.test.ts","backend/src/services/triggers/triggers.repository.ts","backend/src/services/triggers/triggers.service.ts","backend/src/agent/episodes/episode.ts","backend/src/agent/episodes/episodes.service.ts","backend/src/agent/episodes/episodes-dataset-contract.ts","backend/src/core/episode.ts","packages/sdk/src/core/episode.ts","frontend/src/modules/episodes/helpers.ts","backend/test/tst_bts_triggers_repository.test.ts","backend/test/tst_bts_triggers_service.test.ts","backend/test/tst_bts_episodes_snapshot.test.ts","backend/src/services/triggers/types.ts","backend/test/harness/triggers.ts","backend/test/tst_bts_triggers_module.test.ts","backend/src/services/graph/graph.controller.ts","backend/src/services/web/web.service.ts","backend/test/tst_bts_graph_wire_pins.test.ts","frontend/src/modules/_base/__tests__/BaseModuleComponent.test.tsx","frontend/src/modules/_base/__tests__/EntityDetailTabs.test.tsx","frontend/src/modules/episodes/__tests__/helpers.test.ts","backend/src/plugin-runtime/capability.ts","backend/src/plugin-runtime/ops/graph-mutation-ops.ts","backend/src/services/extensions/extension.repository.ts","backend/src/services/graph/graph.repository.ts","backend/test/tst_bts_prt_capability.test.ts","backend/test/tst_bts_graph_relations_table.test.ts","packages/sdk/src/index.ts","backend/test/harness/graph.ts","backend/test/harness/episodes.ts","backend/src/services/workspace/workspace-contract-catalog.ts","backend/test/tst_bts_ext_native_contract_gate_001.test.ts","backend/test/tst_bts_search_service.test.ts","backend/test/tst_bts_graph_overlay.test.ts","backend/test/tst_bts_prt_sync_atomic_001.test.ts","backend/test/tst_bts_graph_batch.test.ts","backend/test/tst_bts_graph_merge.test.ts","backend/test/tst_bts_ext_pg_repo.test.ts","docs/backend/episodes.md","docs/backend/workspace-transfer.md","docs/plugins/authoring.md","docs/architecture/entity-lifecycle.md","docs/agent/memory-roadmap.md","docs/agent/speculative-graph-overlay.md","docs/backend/agent-chat-attachments.md"],"tempRoot":".tmp/code-production/entity-docs/D1-S4","predictedActiveMinutes":140,"predictedCredits":0,"verifyActiveMinutes":20,"verifyCredits":0} -->
#### Stage D1-S4 — Unify membership, creation provenance and registered kinds

- Owner: Codex; Profile: strong; Depends: D1-S3; Parallel with: none.
- Writes: `backend/migrations/20261006000002_graph_membership.sql`, `packages/sdk/src/core/link.ts`, `packages/sdk/src/core/linked-entity.ts`, `backend/src/services/graph/graph-contracts.ts`, `backend/src/services/graph/graph.registrar.ts`, `backend/src/services/graph/link.repository.ts`, `backend/src/services/graph/graph.transfer.ts`, `backend/src/db/schema/graph.ts`, `backend/test/tst_bts_graph_link_kinds.test.ts`, `backend/test/tst_bts_graph_merge_pg.test.ts`, `backend/src/services/triggers/triggers.repository.ts`, `backend/src/services/triggers/triggers.service.ts`, `backend/src/agent/episodes/episode.ts`, `backend/src/agent/episodes/episodes.service.ts`, `backend/src/agent/episodes/episodes-dataset-contract.ts`, `backend/src/core/episode.ts`, `packages/sdk/src/core/episode.ts`, `frontend/src/modules/episodes/helpers.ts`, `backend/test/tst_bts_triggers_repository.test.ts`, `backend/test/tst_bts_triggers_service.test.ts`, `backend/test/tst_bts_episodes_snapshot.test.ts`, `backend/src/services/triggers/types.ts`, `backend/test/harness/triggers.ts`, `backend/test/tst_bts_triggers_module.test.ts`, `backend/src/services/graph/graph.controller.ts`, `backend/src/services/web/web.service.ts`, `backend/test/tst_bts_graph_wire_pins.test.ts`, `frontend/src/modules/_base/__tests__/BaseModuleComponent.test.tsx`, `frontend/src/modules/_base/__tests__/EntityDetailTabs.test.tsx`, `frontend/src/modules/episodes/__tests__/helpers.test.ts`, `backend/src/plugin-runtime/capability.ts`, `backend/src/plugin-runtime/ops/graph-mutation-ops.ts`, `backend/src/services/extensions/extension.repository.ts`, `backend/src/services/graph/graph.repository.ts`, `backend/test/tst_bts_prt_capability.test.ts`, `backend/test/tst_bts_graph_relations_table.test.ts`, `packages/sdk/src/index.ts`, `backend/test/harness/graph.ts`, `backend/test/harness/episodes.ts`, `backend/src/services/workspace/workspace-contract-catalog.ts`, `backend/test/tst_bts_ext_native_contract_gate_001.test.ts`, `backend/test/tst_bts_search_service.test.ts`, `backend/test/tst_bts_graph_overlay.test.ts`, `backend/test/tst_bts_prt_sync_atomic_001.test.ts`, `backend/test/tst_bts_graph_batch.test.ts`, `backend/test/tst_bts_graph_merge.test.ts`, `backend/test/tst_bts_ext_pg_repo.test.ts`, `docs/backend/episodes.md`, `docs/backend/workspace-transfer.md`, `docs/plugins/authoring.md`, `docs/architecture/entity-lifecycle.md`, `docs/agent/memory-roadmap.md`, `docs/agent/speculative-graph-overlay.md`, `docs/backend/agent-chat-attachments.md`.
- Temp root: `.tmp/code-production/entity-docs/D1-S4` (must be absent at handoff).
- Of which verification: 20 active min / 0 credits.

Consolidate shared kinds while leaving domain relations owned by their modules. Coordinate this host migration with D2-S2 before activation; intermediate commits are development states, not independent releases.

Acceptance: KG-06, KG-19, KG-20, KG-28, KG-29 and KG-30. Commit: refactor(graph): unify membership and creation provenance.

##### Tasks

- [x] KG_LINKS_001 — Relation migration preserves periods and refuses ambiguous legacy collisions. (65 min) — d5cce13a15cd5b58b31d63ed075da8073bdc611e
<!-- plan:task-meta:{"writes":["backend/migrations/20261006000002_graph_membership.sql","packages/sdk/src/core/link.ts","packages/sdk/src/core/linked-entity.ts","backend/src/services/graph/graph-contracts.ts","backend/src/services/graph/graph.registrar.ts","backend/src/services/graph/link.repository.ts","backend/src/services/graph/graph.transfer.ts","backend/src/db/schema/graph.ts","backend/test/tst_bts_graph_link_kinds.test.ts","backend/test/tst_bts_graph_merge_pg.test.ts","backend/src/plugin-runtime/capability.ts","backend/src/plugin-runtime/ops/graph-mutation-ops.ts","backend/src/services/extensions/extension.repository.ts","backend/src/services/graph/graph.repository.ts","backend/test/tst_bts_prt_capability.test.ts","backend/test/tst_bts_graph_relations_table.test.ts","packages/sdk/src/index.ts","backend/test/harness/graph.ts","backend/test/harness/episodes.ts","backend/src/services/workspace/workspace-contract-catalog.ts","backend/test/tst_bts_ext_native_contract_gate_001.test.ts","backend/test/tst_bts_search_service.test.ts","backend/test/tst_bts_graph_overlay.test.ts","backend/test/tst_bts_prt_sync_atomic_001.test.ts","backend/test/tst_bts_graph_batch.test.ts","backend/test/tst_bts_graph_merge.test.ts","backend/test/tst_bts_ext_pg_repo.test.ts","docs/backend/episodes.md","docs/backend/workspace-transfer.md","docs/plugins/authoring.md","docs/architecture/entity-lifecycle.md","docs/agent/memory-roadmap.md","docs/agent/speculative-graph-overlay.md","docs/backend/agent-chat-attachments.md"],"predictedActiveMinutes":65,"predictedCredits":0,"how":"1. Reproduce KG-06, KG-19, KG-28 through KG-30 with duplicate periods, unknown producers and existing target rows. 2. Register belongs_to/created and module-owned meetings.attendee/telegram.observed_in/telegram.observed_participant before rewriting references. Preserve claims, metadata, timestamps and explicit duplicate-ID mapping. 3. On the current catalog baseline, sender-only Email rows use sent_from; include that known producer's sent_from and historical authored_by in received_from conversion. Never rewrite independent authorship or infer sent/received from headers or in_chat. 4. Keep old watches/triggerable runtime paths until the later logic cutover; reject other retired writes only after their coordinated producer migration.","red":"bun run agent:test:backend -- test/tst_bts_graph_link_kinds.test.ts test/tst_bts_graph_merge_pg.test.ts"} -->
- [x] KG_LINKS_002 — Triggered Episodes retain correct parent lookup and incoming creation provenance. (55 min) — d5cce13a15cd5b58b31d63ed075da8073bdc611e
<!-- plan:task-meta:{"writes":["backend/src/services/triggers/triggers.repository.ts","backend/src/services/triggers/triggers.service.ts","backend/src/agent/episodes/episode.ts","backend/src/agent/episodes/episodes.service.ts","backend/src/agent/episodes/episodes-dataset-contract.ts","backend/src/core/episode.ts","packages/sdk/src/core/linked-entity.ts","packages/sdk/src/core/episode.ts","frontend/src/modules/episodes/helpers.ts","backend/test/tst_bts_triggers_repository.test.ts","backend/test/tst_bts_triggers_service.test.ts","backend/test/tst_bts_episodes_snapshot.test.ts","backend/src/services/triggers/types.ts","backend/test/harness/triggers.ts","backend/test/tst_bts_triggers_module.test.ts","backend/src/services/graph/graph.controller.ts","backend/src/services/web/web.service.ts","backend/test/tst_bts_graph_wire_pins.test.ts","frontend/src/modules/_base/__tests__/BaseModuleComponent.test.tsx","frontend/src/modules/_base/__tests__/EntityDetailTabs.test.tsx","frontend/src/modules/episodes/__tests__/helpers.test.ts"],"predictedActiveMinutes":55,"predictedCredits":0,"how":"1. Reproduce KG-19 and KG-20: one Episode parent plus project membership, ambiguous parents, repeated firing and both endpoint views. 2. Write Trigger -> created -> Episode through existing runtime paths. Filter belongs_to parents by episodes.episode and reject zero/multiple active parents before child creation. 3. Carry stored kind plus direction in neighbor summaries and preserve child_of. Do not replace execution selection, gate behavior, manual runs or schedules.","red":"bun run agent:test:backend -- test/tst_bts_triggers_repository.test.ts test/tst_bts_triggers_service.test.ts test/tst_bts_episodes_snapshot.test.ts"} -->

##### Acceptance criteria

- [x] `bun run agent:test:backend -- test/tst_bts_graph_link_kinds.test.ts test/tst_bts_triggers_repository.test.ts test/tst_bts_triggers_service.test.ts test/tst_bts_episodes_snapshot.test.ts` exits 0 — d5cce13a15cd5b58b31d63ed075da8073bdc611e
- [x] Commit — d5cce13a15cd5b58b31d63ed075da8073bdc611e

##### Results

<!-- plan:results:D1-S4:start -->
| Task | Commit | UTC start-end | Active / elapsed | Usage | Result / proof |
|---|---|---|---:|---|---|
| KG_LINKS_001 | d5cce13a15cd5b58b31d63ed075da8073bdc611e | 2026-10-07T12:00:52.028Z–2026-10-07T12:46:22.114Z | 45.50143333333333 / 45.50143333333333 min | unavailable: not measured by planctl | Runtime commit a2874e3a migrates shared membership, Trigger→created→Episode and known module/sender relations atomically; snapshots preserve original links/claims/audit and effective withdrawal replay, with deterministic duplicate mapping and conflict/unknown-producer refusal. Explicit namespace/write permissions, orphan history, Episode parent filtering, stored linkKind+direction and UI labels verified. Hooks: 541 backend pass + 1 existing skip, 73 frontend pass, typecheck/lint/docs pass. Drizzle pull verified the new table; d5cce13a closes schema annotations and reference verification. Legacy workspace kind conversion remains KG_PROCESS_002 and release-blocking. |
| KG_LINKS_002 | d5cce13a15cd5b58b31d63ed075da8073bdc611e | 2026-10-07T12:00:52.028Z–2026-10-07T12:46:22.114Z | 45.50143333333333 / 45.50143333333333 min | unavailable: not measured by planctl | Runtime commit a2874e3a migrates shared membership, Trigger→created→Episode and known module/sender relations atomically; snapshots preserve original links/claims/audit and effective withdrawal replay, with deterministic duplicate mapping and conflict/unknown-producer refusal. Explicit namespace/write permissions, orphan history, Episode parent filtering, stored linkKind+direction and UI labels verified. Hooks: 541 backend pass + 1 existing skip, 73 frontend pass, typecheck/lint/docs pass. Drizzle pull verified the new table; d5cce13a closes schema annotations and reference verification. Legacy workspace kind conversion remains KG_PROCESS_002 and release-blocking. |
<!-- plan:results:D1-S4:end -->
<!-- plan:stage:D1-S4:end -->

<!-- plan:stage:D1-S5:start -->
<!-- plan:stage-meta:{"deliveryId":"D1","depends":["D1-S4"],"parallelWith":[],"writes":["backend/migrations/20261006000003_graph_user_ownership.sql","backend/src/db/schema/users.ts","backend/src/db/schema/graph.ts","backend/src/core/user.ts","packages/sdk/src/core/user.ts","packages/sdk/src/core/entity.ts","backend/src/services/users/users.service.ts","backend/src/services/users/user.repository.ts","backend/src/services/users/default-user.ts","backend/src/services/users/users.module.ts","backend/src/services/graph/graph.registrar.ts","backend/src/services/graph/graph.module.ts","backend/test/tst_bts_users_service.test.ts","backend/test/tst_bts_workspace_identity.test.ts","packages/sdk/src/core/link.ts","packages/sdk/src/rpc/native/graph.ts","backend/src/services/graph/graph.service.ts","backend/src/services/graph/graph.repository.ts","backend/src/services/graph/entity.repository.ts","backend/src/services/graph/link.repository.ts","backend/src/services/graph/graph.transfer.ts","backend/src/plugin-runtime/ops/graph-mutation-ops.ts","backend/src/services/search/search-query-compiler.repository.ts","backend/test/tst_bts_graph_owner.test.ts","backend/test/tst_bts_graph_batch.test.ts","backend/src/agent/credits/credit.service.ts","backend/src/agent/eval/eval-module.controller.ts","backend/src/agent/models/ai-runtime-language-model.ts","backend/src/agent/models/ai-sdk-runtime.service.ts","backend/src/agent/runtime/native-agent.ts","backend/src/core/ai-runtime.ts","backend/src/core/auth.ts","backend/src/core/credit-reservation.ts","backend/src/core/graph-commands.ts","backend/src/core/index.ts","backend/src/core/link.ts","backend/src/core/llm-call.ts","backend/src/core/tools.ts","backend/src/services/memory/memory-module.controller.ts","backend/src/services/search/search-module.controller.ts","backend/src/services/tools/approved-tool-dispatch.ts","backend/src/services/tools/execution-port.ts","backend/src/services/tools/gated-execution.ts","backend/src/transport/rpc/approved-tool-dispatch.transport.ts","backend/test/harness/mock-ai-runtime.ts","backend/src/agent/episodes/episodes.controller.ts","backend/src/plugin-runtime/host-state.ts","backend/src/plugin-runtime/plugin-module-controller.ts","backend/src/services/auth/auth.config.ts","backend/src/services/auth/auth.service.ts","backend/src/services/extensions/extension.service.ts","backend/src/services/extensions/system-extension-reconciler.ts","backend/src/services/graph/graph.controller.ts","backend/src/services/groups/groups-module.controller.ts","backend/src/services/modules/rpc-decorators.ts","backend/src/services/modules/types.ts","backend/src/services/settings/settings.service.ts","backend/src/services/setup/setup.service.ts","backend/src/services/sources/types.ts","backend/src/services/triggers/triggers.controller.ts","backend/src/services/users/user-profile.service.ts","backend/src/services/web/web-module.controller.ts","backend/src/services/workspace/types.ts","backend/src/services/workspace/workspace-installation.service.ts","backend/src/transport/http/billing.controller.ts","backend/src/transport/http/debug.controller.ts","backend/src/transport/http/files.controller.ts","backend/src/transport/http/rpc.controller.ts","backend/src/transport/http/rpc.helpers.ts","backend/src/transport/http/search-ablation.controller.ts","backend/src/transport/http/settings.controller.ts","backend/src/transport/http/user-profile.controller.ts","backend/src/transport/http/users.controller.ts","backend/src/transport/http/workspace.controller.ts","backend/src/transport/mcp/execute-approved-tool.ts","backend/src/transport/mcp/mcp-runtime.ts","backend/src/transport/mcp/mcp-tool.service.ts","backend/src/transport/mcp/mcp.service.ts","backend/src/transport/middleware/request-context.ts","backend/src/transport/websocket/controllers/billing.ts","backend/src/transport/websocket/operation-registry.ts","backend/src/transport/websocket/router-fallback.ts","backend/src/transport/websocket/router.ts","backend/src/transport/websocket/socket-events.ts","backend/test/harness/rpc-router.ts","backend/test/harness/websocket.ts","backend/test/tst_bts_entity_one_type_events.test.ts","backend/test/tst_bts_entity_one_type_foundation.test.ts","backend/test/tst_bts_prt_ops.test.ts","backend/test/tst_bts_setup_plan.test.ts","backend/test/tst_bts_transport_infra.test.ts","backend/test/tst_bts_ws_protocol.test.ts","backend/src/services/graph/graph-contracts.ts","backend/src/services/graph/schema.repository.ts","backend/src/services/extensions/extension.repository.ts","packages/sdk/src/index.ts","backend/src/core/sync-state.ts","backend/src/services/graph/claim.repository.ts","backend/src/services/workspace/workspace-transfer.service.ts","backend/test/tst_bts_workspace_transfer.test.ts","backend/test/tst_bts_graph_merge_pg.test.ts","backend/src/core/workspace-transfer.ts","backend/test/tst_bts_graph_relations_table.test.ts","docs/backend/graph-service.md","docs/architecture/contracts/graph.md","docs/backend/workspace-transfer.md","frontend/src/modules/_base/__tests__/useEntityProperty.test.tsx","backend/test/tst_bts_graph_end.test.ts","backend/test/tst_bts_graph_service.test.ts","backend/test/tst_bts_graph_wire_pins.test.ts","backend/test/tst_bts_episodes_snapshot.test.ts","backend/test/tst_bts_modules_registry.test.ts","backend/test/tst_bts_search_combined.test.ts","backend/test/tst_bts_prt_sync_atomic_001.test.ts","backend/test/tst_bts_graph_overlay.test.ts","backend/test/tst_bts_workspace_profile.test.ts","backend/test/tst_bts_web_wire_pins.test.ts","backend/test/tst_bts_workspace_template.test.ts","backend/test/tst_bts_graph_statement_write.test.ts","backend/test/tst_bts_search_visibility.test.ts","backend/test/tst_bts_graph_window.test.ts","backend/test/tst_bts_graph_statement_integration.test.ts","backend/test/tst_bts_workspace_export.test.ts"],"tempRoot":".tmp/code-production/entity-docs/D1-S5","predictedActiveMinutes":170,"predictedCredits":0,"verifyActiveMinutes":20,"verifyCredits":0} -->
#### Stage D1-S5 — Bootstrap graph users and protect system ownership

- Owner: Codex; Profile: strong; Depends: D1-S4; Parallel with: none.
- Writes: `backend/migrations/20261006000003_graph_user_ownership.sql`, `backend/src/db/schema/users.ts`, `backend/src/db/schema/graph.ts`, `backend/src/core/user.ts`, `packages/sdk/src/core/user.ts`, `packages/sdk/src/core/entity.ts`, `backend/src/services/users/users.service.ts`, `backend/src/services/users/user.repository.ts`, `backend/src/services/users/default-user.ts`, `backend/src/services/users/users.module.ts`, `backend/src/services/graph/graph.registrar.ts`, `backend/src/services/graph/graph.module.ts`, `backend/test/tst_bts_users_service.test.ts`, `backend/test/tst_bts_workspace_identity.test.ts`, `packages/sdk/src/core/link.ts`, `packages/sdk/src/rpc/native/graph.ts`, `backend/src/services/graph/graph.service.ts`, `backend/src/services/graph/graph.repository.ts`, `backend/src/services/graph/entity.repository.ts`, `backend/src/services/graph/link.repository.ts`, `backend/src/services/graph/graph.transfer.ts`, `backend/src/plugin-runtime/ops/graph-mutation-ops.ts`, `backend/src/services/search/search-query-compiler.repository.ts`, `backend/test/tst_bts_graph_owner.test.ts`, `backend/test/tst_bts_graph_batch.test.ts`, `backend/src/agent/credits/credit.service.ts`, `backend/src/agent/eval/eval-module.controller.ts`, `backend/src/agent/models/ai-runtime-language-model.ts`, `backend/src/agent/models/ai-sdk-runtime.service.ts`, `backend/src/agent/runtime/native-agent.ts`, `backend/src/core/ai-runtime.ts`, `backend/src/core/auth.ts`, `backend/src/core/credit-reservation.ts`, `backend/src/core/graph-commands.ts`, `backend/src/core/index.ts`, `backend/src/core/link.ts`, `backend/src/core/llm-call.ts`, `backend/src/core/tools.ts`, `backend/src/services/memory/memory-module.controller.ts`, `backend/src/services/search/search-module.controller.ts`, `backend/src/services/tools/approved-tool-dispatch.ts`, `backend/src/services/tools/execution-port.ts`, `backend/src/services/tools/gated-execution.ts`, `backend/src/transport/rpc/approved-tool-dispatch.transport.ts`, `backend/test/harness/mock-ai-runtime.ts`, `backend/src/agent/episodes/episodes.controller.ts`, `backend/src/plugin-runtime/host-state.ts`, `backend/src/plugin-runtime/plugin-module-controller.ts`, `backend/src/services/auth/auth.config.ts`, `backend/src/services/auth/auth.service.ts`, `backend/src/services/extensions/extension.service.ts`, `backend/src/services/extensions/system-extension-reconciler.ts`, `backend/src/services/graph/graph.controller.ts`, `backend/src/services/groups/groups-module.controller.ts`, `backend/src/services/modules/rpc-decorators.ts`, `backend/src/services/modules/types.ts`, `backend/src/services/settings/settings.service.ts`, `backend/src/services/setup/setup.service.ts`, `backend/src/services/sources/types.ts`, `backend/src/services/triggers/triggers.controller.ts`, `backend/src/services/users/user-profile.service.ts`, `backend/src/services/web/web-module.controller.ts`, `backend/src/services/workspace/types.ts`, `backend/src/services/workspace/workspace-installation.service.ts`, `backend/src/transport/http/billing.controller.ts`, `backend/src/transport/http/debug.controller.ts`, `backend/src/transport/http/files.controller.ts`, `backend/src/transport/http/rpc.controller.ts`, `backend/src/transport/http/rpc.helpers.ts`, `backend/src/transport/http/search-ablation.controller.ts`, `backend/src/transport/http/settings.controller.ts`, `backend/src/transport/http/user-profile.controller.ts`, `backend/src/transport/http/users.controller.ts`, `backend/src/transport/http/workspace.controller.ts`, `backend/src/transport/mcp/execute-approved-tool.ts`, `backend/src/transport/mcp/mcp-runtime.ts`, `backend/src/transport/mcp/mcp-tool.service.ts`, `backend/src/transport/mcp/mcp.service.ts`, `backend/src/transport/middleware/request-context.ts`, `backend/src/transport/websocket/controllers/billing.ts`, `backend/src/transport/websocket/operation-registry.ts`, `backend/src/transport/websocket/router-fallback.ts`, `backend/src/transport/websocket/router.ts`, `backend/src/transport/websocket/socket-events.ts`, `backend/test/harness/rpc-router.ts`, `backend/test/harness/websocket.ts`, `backend/test/tst_bts_entity_one_type_events.test.ts`, `backend/test/tst_bts_entity_one_type_foundation.test.ts`, `backend/test/tst_bts_prt_ops.test.ts`, `backend/test/tst_bts_setup_plan.test.ts`, `backend/test/tst_bts_transport_infra.test.ts`, `backend/test/tst_bts_ws_protocol.test.ts`, `backend/src/services/graph/graph-contracts.ts`, `backend/src/services/graph/schema.repository.ts`, `backend/src/services/extensions/extension.repository.ts`, `packages/sdk/src/index.ts`, `backend/src/core/sync-state.ts`, `backend/src/services/graph/claim.repository.ts`, `backend/src/services/workspace/workspace-transfer.service.ts`, `backend/test/tst_bts_workspace_transfer.test.ts`, `backend/test/tst_bts_graph_merge_pg.test.ts`, `backend/src/core/workspace-transfer.ts`, `backend/test/tst_bts_graph_relations_table.test.ts`, `docs/backend/graph-service.md`, `docs/architecture/contracts/graph.md`, `docs/backend/workspace-transfer.md`, `frontend/src/modules/_base/__tests__/useEntityProperty.test.tsx`, `backend/test/tst_bts_graph_end.test.ts`, `backend/test/tst_bts_graph_service.test.ts`, `backend/test/tst_bts_graph_wire_pins.test.ts`, `backend/test/tst_bts_episodes_snapshot.test.ts`, `backend/test/tst_bts_modules_registry.test.ts`, `backend/test/tst_bts_search_combined.test.ts`, `backend/test/tst_bts_prt_sync_atomic_001.test.ts`, `backend/test/tst_bts_graph_overlay.test.ts`, `backend/test/tst_bts_workspace_profile.test.ts`, `backend/test/tst_bts_web_wire_pins.test.ts`, `backend/test/tst_bts_workspace_template.test.ts`, `backend/test/tst_bts_graph_statement_write.test.ts`, `backend/test/tst_bts_search_visibility.test.ts`, `backend/test/tst_bts_graph_window.test.ts`, `backend/test/tst_bts_graph_statement_integration.test.ts`, `backend/test/tst_bts_workspace_export.test.ts`.
- Temp root: `.tmp/code-production/entity-docs/D1-S5` (must be absent at handoff).
- Of which verification: 20 active min / 0 credits.

Introduce graph user identity and protected ownership without rekeying authentication. The approved bootstrap proposal is concrete; the separate historical-owner transfer decision remains open and is not inferred from SPEC approval.

Acceptance: KG-07, KG-08 and the unavailable-transfer prerequisite of KG-09. Commit: feat(graph): add graph users and protected owner links.

##### Tasks

- [x] KG_OWNER_001 — Existing auth users gain stable graph identities without changing their login IDs. (65 min) — 7fa1dbc7a2042438320729517f7200a773225bf7
<!-- plan:task-meta:{"writes":["backend/migrations/20261006000003_graph_user_ownership.sql","backend/src/db/schema/users.ts","backend/src/db/schema/graph.ts","backend/src/core/user.ts","packages/sdk/src/core/user.ts","packages/sdk/src/core/entity.ts","backend/src/services/users/users.service.ts","backend/src/services/users/user.repository.ts","backend/src/services/users/default-user.ts","backend/src/services/users/users.module.ts","backend/src/services/graph/graph.registrar.ts","backend/src/services/graph/graph.module.ts","backend/test/tst_bts_users_service.test.ts","backend/test/tst_bts_workspace_identity.test.ts"],"predictedActiveMinutes":65,"predictedCredits":0,"how":"1. Reproduce KG-07 with concurrent default-nil-user bootstrap and restart; use an assigned graph ID and retain the auth ID. 2. Register users.user as a host-owned non-mergeable, non-generic-deletable, non-syncable identity_channel exposing only name/surname. Add the unique users.entity_id binding. 3. Create the user Entity, mapping, self-owner Link and audit in one system transaction. Add person identity only from an unambiguous mapping; never match by name.","red":"bun run agent:test:backend -- test/tst_bts_users_service.test.ts test/tst_bts_workspace_identity.test.ts"} -->
- [x] KG_OWNER_002 — Every entity writer maintains one protected owner without granting generic Link authority. (85 min) — 7fa1dbc7a2042438320729517f7200a773225bf7
<!-- plan:task-meta:{"writes":["packages/sdk/src/core/link.ts","packages/sdk/src/rpc/native/graph.ts","backend/src/services/graph/graph.service.ts","backend/src/services/graph/graph.repository.ts","backend/src/services/graph/entity.repository.ts","backend/src/services/graph/link.repository.ts","backend/src/services/graph/graph.registrar.ts","backend/src/services/graph/graph.transfer.ts","backend/src/plugin-runtime/ops/graph-mutation-ops.ts","backend/src/services/search/search-query-compiler.repository.ts","backend/test/tst_bts_graph_owner.test.ts","backend/test/tst_bts_graph_batch.test.ts"],"predictedActiveMinutes":85,"predictedCredits":0,"how":"1. Create the missing all-writer owner tests for KG-08, including public aliases, plugin batches, import, registry, extraction and ordinary merge. 2. Backfill current owner periods at the migration timestamp; maintain new Entity owner Links and hidden AuthUserId projection under the same transaction and lock. Enforce no overlap across different owner targets. 3. Reject generic owner mutation by the stored kind. Reads/search still authorize the auth scope before evaluating links. 4. Keep bounded transfer unavailable until the SPEC D history/export decision is approved and the exact affected contract is amended. Do not expose a transfer RPC or weaken endpoint ACL in this stage; KG-09's enabled-transfer cases remain gated.","red":"bun run agent:test:backend -- test/tst_bts_graph_owner.test.ts test/tst_bts_graph_batch.test.ts"} -->

##### Acceptance criteria

- [x] `bun run agent:test:backend -- test/tst_bts_users_service.test.ts test/tst_bts_workspace_identity.test.ts test/tst_bts_graph_owner.test.ts test/tst_bts_graph_batch.test.ts` exits 0 — 7fa1dbc7a2042438320729517f7200a773225bf7
- [x] Commit — 7fa1dbc7a2042438320729517f7200a773225bf7

##### Results

<!-- plan:results:D1-S5:start -->
| Task | Commit | UTC start-end | Active / elapsed | Usage | Result / proof |
|---|---|---|---:|---|---|
| KG_OWNER_001 | 7fa1dbc7a2042438320729517f7200a773225bf7 | 2026-10-07T12:52:09.723Z–2026-10-07T14:03:02.939Z | 70.88693333333333 / 70.88693333333333 min | unavailable: not measured by planctl | Atomic graph-user bootstrap/profile binding and protected temporal owner Links implemented; generic stored-kind/schema mutation, plugin registration, extraction and forged imports refused. Target user profile and owner ID mappings preserved. Concurrency/restart, migration, ACL, rollback and replay checks passed; real Drizzle introspection verified schema. Commit hooks: 1102 backend pass, 1 existing skip, frontend/typecheck/lint/docs green. — beyond writes: backend/src/agent/credits/credit.service.ts, backend/src/agent/episodes/episodes.controller.ts, backend/src/agent/eval/eval-module.controller.ts, backend/src/agent/models/ai-runtime-language-model.ts, backend/src/agent/models/ai-sdk-runtime.service.ts, backend/src/agent/runtime/native-agent.ts, backend/src/core/ai-runtime.ts, backend/src/core/auth.ts, backend/src/core/credit-reservation.ts, backend/src/core/graph-commands.ts, backend/src/core/index.ts, backend/src/core/link.ts, backend/src/core/llm-call.ts, backend/src/core/sync-state.ts, backend/src/core/tools.ts, backend/src/core/workspace-transfer.ts, backend/src/plugin-runtime/host-state.ts, backend/src/plugin-runtime/plugin-module-controller.ts, backend/src/services/auth/auth.config.ts, backend/src/services/auth/auth.service.ts, backend/src/services/extensions/extension.repository.ts, backend/src/services/extensions/extension.service.ts, backend/src/services/extensions/system-extension-reconciler.ts, backend/src/services/graph/claim.repository.ts, backend/src/services/graph/graph-contracts.ts, backend/src/services/graph/graph.controller.ts, backend/src/services/graph/schema.repository.ts, backend/src/services/groups/groups-module.controller.ts, backend/src/services/memory/memory-module.controller.ts, backend/src/services/modules/rpc-decorators.ts, backend/src/services/modules/types.ts, backend/src/services/search/search-module.controller.ts, backend/src/services/settings/settings.service.ts, backend/src/services/setup/setup.service.ts, backend/src/services/sources/types.ts, backend/src/services/tools/approved-tool-dispatch.ts, backend/src/services/tools/execution-port.ts, backend/src/services/tools/gated-execution.ts, backend/src/services/triggers/triggers.controller.ts, backend/src/services/users/user-profile.service.ts, backend/src/services/web/web-module.controller.ts, backend/src/services/workspace/types.ts, backend/src/services/workspace/workspace-installation.service.ts, backend/src/services/workspace/workspace-transfer.service.ts, backend/src/transport/http/billing.controller.ts, backend/src/transport/http/debug.controller.ts, backend/src/transport/http/files.controller.ts, backend/src/transport/http/rpc.controller.ts, backend/src/transport/http/rpc.helpers.ts, backend/src/transport/http/search-ablation.controller.ts, backend/src/transport/http/settings.controller.ts, backend/src/transport/http/user-profile.controller.ts, backend/src/transport/http/users.controller.ts, backend/src/transport/http/workspace.controller.ts, backend/src/transport/mcp/execute-approved-tool.ts, backend/src/transport/mcp/mcp-runtime.ts, backend/src/transport/mcp/mcp-tool.service.ts, backend/src/transport/mcp/mcp.service.ts, backend/src/transport/middleware/request-context.ts, backend/src/transport/rpc/approved-tool-dispatch.transport.ts, backend/src/transport/websocket/controllers/billing.ts, backend/src/transport/websocket/operation-registry.ts, backend/src/transport/websocket/router-fallback.ts, backend/src/transport/websocket/router.ts, backend/src/transport/websocket/socket-events.ts, backend/test/harness/mock-ai-runtime.ts, backend/test/harness/rpc-router.ts, backend/test/harness/websocket.ts, backend/test/tst_bts_entity_one_type_events.test.ts, backend/test/tst_bts_entity_one_type_foundation.test.ts, backend/test/tst_bts_episodes_snapshot.test.ts, backend/test/tst_bts_graph_end.test.ts, backend/test/tst_bts_graph_merge_pg.test.ts, backend/test/tst_bts_graph_overlay.test.ts, backend/test/tst_bts_graph_relations_table.test.ts, backend/test/tst_bts_graph_service.test.ts, backend/test/tst_bts_graph_statement_integration.test.ts, backend/test/tst_bts_graph_statement_write.test.ts, backend/test/tst_bts_graph_window.test.ts, backend/test/tst_bts_graph_wire_pins.test.ts, backend/test/tst_bts_modules_registry.test.ts, backend/test/tst_bts_prt_ops.test.ts, backend/test/tst_bts_prt_sync_atomic_001.test.ts, backend/test/tst_bts_search_combined.test.ts, backend/test/tst_bts_search_visibility.test.ts, backend/test/tst_bts_setup_plan.test.ts, backend/test/tst_bts_transport_infra.test.ts, backend/test/tst_bts_web_wire_pins.test.ts, backend/test/tst_bts_workspace_export.test.ts, backend/test/tst_bts_workspace_profile.test.ts, backend/test/tst_bts_workspace_template.test.ts, backend/test/tst_bts_workspace_transfer.test.ts, backend/test/tst_bts_ws_protocol.test.ts, docs/architecture/contracts/graph.md, docs/backend/graph-service.md, docs/backend/workspace-transfer.md, frontend/src/modules/_base/__tests__/useEntityProperty.test.tsx, packages/sdk/src/index.ts |
| KG_OWNER_002 | 7fa1dbc7a2042438320729517f7200a773225bf7 | 2026-10-07T12:52:09.723Z–2026-10-07T14:03:02.939Z | 70.88693333333333 / 70.88693333333333 min | unavailable: not measured by planctl | Atomic graph-user bootstrap/profile binding and protected temporal owner Links implemented; generic stored-kind/schema mutation, plugin registration, extraction and forged imports refused. Target user profile and owner ID mappings preserved. Concurrency/restart, migration, ACL, rollback and replay checks passed; real Drizzle introspection verified schema. Commit hooks: 1102 backend pass, 1 existing skip, frontend/typecheck/lint/docs green. — beyond writes: backend/src/agent/credits/credit.service.ts, backend/src/agent/episodes/episodes.controller.ts, backend/src/agent/eval/eval-module.controller.ts, backend/src/agent/models/ai-runtime-language-model.ts, backend/src/agent/models/ai-sdk-runtime.service.ts, backend/src/agent/runtime/native-agent.ts, backend/src/core/ai-runtime.ts, backend/src/core/auth.ts, backend/src/core/credit-reservation.ts, backend/src/core/graph-commands.ts, backend/src/core/index.ts, backend/src/core/link.ts, backend/src/core/llm-call.ts, backend/src/core/sync-state.ts, backend/src/core/tools.ts, backend/src/core/workspace-transfer.ts, backend/src/plugin-runtime/host-state.ts, backend/src/plugin-runtime/plugin-module-controller.ts, backend/src/services/auth/auth.config.ts, backend/src/services/auth/auth.service.ts, backend/src/services/extensions/extension.repository.ts, backend/src/services/extensions/extension.service.ts, backend/src/services/extensions/system-extension-reconciler.ts, backend/src/services/graph/claim.repository.ts, backend/src/services/graph/graph-contracts.ts, backend/src/services/graph/graph.controller.ts, backend/src/services/graph/schema.repository.ts, backend/src/services/groups/groups-module.controller.ts, backend/src/services/memory/memory-module.controller.ts, backend/src/services/modules/rpc-decorators.ts, backend/src/services/modules/types.ts, backend/src/services/search/search-module.controller.ts, backend/src/services/settings/settings.service.ts, backend/src/services/setup/setup.service.ts, backend/src/services/sources/types.ts, backend/src/services/tools/approved-tool-dispatch.ts, backend/src/services/tools/execution-port.ts, backend/src/services/tools/gated-execution.ts, backend/src/services/triggers/triggers.controller.ts, backend/src/services/users/user-profile.service.ts, backend/src/services/web/web-module.controller.ts, backend/src/services/workspace/types.ts, backend/src/services/workspace/workspace-installation.service.ts, backend/src/services/workspace/workspace-transfer.service.ts, backend/src/transport/http/billing.controller.ts, backend/src/transport/http/debug.controller.ts, backend/src/transport/http/files.controller.ts, backend/src/transport/http/rpc.controller.ts, backend/src/transport/http/rpc.helpers.ts, backend/src/transport/http/search-ablation.controller.ts, backend/src/transport/http/settings.controller.ts, backend/src/transport/http/user-profile.controller.ts, backend/src/transport/http/users.controller.ts, backend/src/transport/http/workspace.controller.ts, backend/src/transport/mcp/execute-approved-tool.ts, backend/src/transport/mcp/mcp-runtime.ts, backend/src/transport/mcp/mcp-tool.service.ts, backend/src/transport/mcp/mcp.service.ts, backend/src/transport/middleware/request-context.ts, backend/src/transport/rpc/approved-tool-dispatch.transport.ts, backend/src/transport/websocket/controllers/billing.ts, backend/src/transport/websocket/operation-registry.ts, backend/src/transport/websocket/router-fallback.ts, backend/src/transport/websocket/router.ts, backend/src/transport/websocket/socket-events.ts, backend/test/harness/mock-ai-runtime.ts, backend/test/harness/rpc-router.ts, backend/test/harness/websocket.ts, backend/test/tst_bts_entity_one_type_events.test.ts, backend/test/tst_bts_entity_one_type_foundation.test.ts, backend/test/tst_bts_episodes_snapshot.test.ts, backend/test/tst_bts_graph_end.test.ts, backend/test/tst_bts_graph_merge_pg.test.ts, backend/test/tst_bts_graph_overlay.test.ts, backend/test/tst_bts_graph_relations_table.test.ts, backend/test/tst_bts_graph_service.test.ts, backend/test/tst_bts_graph_statement_integration.test.ts, backend/test/tst_bts_graph_statement_write.test.ts, backend/test/tst_bts_graph_window.test.ts, backend/test/tst_bts_graph_wire_pins.test.ts, backend/test/tst_bts_modules_registry.test.ts, backend/test/tst_bts_prt_ops.test.ts, backend/test/tst_bts_prt_sync_atomic_001.test.ts, backend/test/tst_bts_search_combined.test.ts, backend/test/tst_bts_search_visibility.test.ts, backend/test/tst_bts_setup_plan.test.ts, backend/test/tst_bts_transport_infra.test.ts, backend/test/tst_bts_web_wire_pins.test.ts, backend/test/tst_bts_workspace_export.test.ts, backend/test/tst_bts_workspace_profile.test.ts, backend/test/tst_bts_workspace_template.test.ts, backend/test/tst_bts_workspace_transfer.test.ts, backend/test/tst_bts_ws_protocol.test.ts, docs/architecture/contracts/graph.md, docs/backend/graph-service.md, docs/backend/workspace-transfer.md, frontend/src/modules/_base/__tests__/useEntityProperty.test.tsx, packages/sdk/src/index.ts |
<!-- plan:results:D1-S5:end -->
<!-- plan:stage:D1-S5:end -->

<!-- plan:stage:D1-S6:start -->
<!-- plan:stage-meta:{"deliveryId":"D1","depends":["D1-S5"],"parallelWith":[],"writes":["backend/src/services/graph/merge.ts","backend/src/services/graph/derive.ts","backend/src/services/graph/claim.repository.ts","backend/src/services/graph/graph.repository.ts","backend/src/services/graph/graph.service.ts","packages/sdk/src/core/merge.ts","backend/src/services/search/graph-indexer.ts","packages/sdk/src/core/indexing.ts","backend/test/tst_bts_graph_contract_admission.test.ts","backend/test/tst_bts_graph_merge_pg.test.ts","backend/test/tst_bts_graph_derive.test.ts","backend/src/core/workspace-transfer.ts","backend/src/services/workspace/workspace-document.ts","backend/src/services/graph/graph.transfer.ts","backend/src/services/graph/entity.repository.ts","backend/src/services/graph/link.repository.ts","backend/test/tst_bts_workspace_document.test.ts","backend/test/tst_bts_workspace_transfer.test.ts","backend/test/tst_bts_dataset_format.test.ts","backend/test/tst_bts_graph_statement_integration.test.ts","backend/src/services/graph/types.ts","backend/src/services/workspace/workspace-graph-migration.ts","backend/test/tst_bts_dataset_document.test.ts","backend/test/tst_bts_eval_fixture.test.ts","backend/test/tst_bts_workspace_export.test.ts","backend/test/tst_bts_workspace_template.test.ts","docs/backend/workspace-transfer.md","docs/backend/graph-service.md","docs/backend/episodes.md","docs/datasets.md","docs/agent/memory-roadmap.md","docs/architecture/entity-lifecycle.md","docs/frontend/onboarding.md","docs/agent/speculative-graph-overlay.md","docs/plugins/authoring.md","docs/backend/ai-models.md","docs/backend/sync.md"],"tempRoot":".tmp/code-production/entity-docs/D1-S6","predictedActiveMinutes":180,"predictedCredits":0,"verifyActiveMinutes":25,"verifyCredits":0} -->
#### Stage D1-S6 — Preserve claims, merge choices and workspace storage

- Owner: Codex; Profile: strong; Depends: D1-S5; Parallel with: none.
- Writes: `backend/src/services/graph/merge.ts`, `backend/src/services/graph/derive.ts`, `backend/src/services/graph/claim.repository.ts`, `backend/src/services/graph/graph.repository.ts`, `backend/src/services/graph/graph.service.ts`, `packages/sdk/src/core/merge.ts`, `backend/src/services/search/graph-indexer.ts`, `packages/sdk/src/core/indexing.ts`, `backend/test/tst_bts_graph_contract_admission.test.ts`, `backend/test/tst_bts_graph_merge_pg.test.ts`, `backend/test/tst_bts_graph_derive.test.ts`, `backend/src/core/workspace-transfer.ts`, `backend/src/services/workspace/workspace-document.ts`, `backend/src/services/graph/graph.transfer.ts`, `backend/src/services/graph/entity.repository.ts`, `backend/src/services/graph/link.repository.ts`, `backend/test/tst_bts_workspace_document.test.ts`, `backend/test/tst_bts_workspace_transfer.test.ts`, `backend/test/tst_bts_dataset_format.test.ts`, `backend/test/tst_bts_graph_statement_integration.test.ts`, `backend/src/services/graph/types.ts`, `backend/src/services/workspace/workspace-graph-migration.ts`, `backend/test/tst_bts_dataset_document.test.ts`, `backend/test/tst_bts_eval_fixture.test.ts`, `backend/test/tst_bts_workspace_export.test.ts`, `backend/test/tst_bts_workspace_template.test.ts`, `docs/backend/workspace-transfer.md`, `docs/backend/graph-service.md`, `docs/backend/episodes.md`, `docs/datasets.md`, `docs/agent/memory-roadmap.md`, `docs/architecture/entity-lifecycle.md`, `docs/frontend/onboarding.md`, `docs/agent/speculative-graph-overlay.md`, `docs/plugins/authoring.md`, `docs/backend/ai-models.md`, `docs/backend/sync.md`.
- Temp root: `.tmp/code-production/entity-docs/D1-S6` (must be absent at handoff).
- Of which verification: 25 active min / 0 credits.

Move processing and workspace transfer onto the same graph boundaries. Reuse merge, derive, claim replacement and workspace codecs; the new test file covers domain-admission gaps rather than introducing a new test runner.

Acceptance: KG-10, KG-11, KG-12, KG-13, KG-15, KG-16 and KG-31. Commit: fix(graph): preserve validated identity and storage during migration.

##### Tasks

- [x] KG_PROCESS_001 — Merge and extraction reject invalid results without losing identity or operational choices. (85 min) — 105f732d236433a02670445de97a8807ec71a51e
<!-- plan:task-meta:{"writes":["backend/src/services/graph/merge.ts","backend/src/services/graph/derive.ts","backend/src/services/graph/claim.repository.ts","backend/src/services/graph/graph.repository.ts","backend/src/services/graph/graph.service.ts","packages/sdk/src/core/merge.ts","backend/src/services/search/graph-indexer.ts","packages/sdk/src/core/indexing.ts","backend/test/tst_bts_graph_contract_admission.test.ts","backend/test/tst_bts_graph_merge_pg.test.ts","backend/test/tst_bts_graph_derive.test.ts"],"predictedActiveMinutes":85,"predictedCredits":0,"how":"1. Reproduce KG-10 through KG-13 and KG-16: repeated ensure after merge, stale previews, domain-invalid model output, claim ordering and conflicting extras. 2. Validate schema/version, final domain properties and registered endpoint/system-kind rules inside the existing transaction/revision fence. 3. Keep the canonical identity-hub exception and deterministic derivation. Refuse differing privacy, syncEnabled or per-viewer pinOrder, retain survivor syncRevision and reconcile indexing through normal mutation. 4. Keep ending claims without materialized Links and unknown dates intact. Do not turn evidence withdrawal into a departure or implement ending notifications here.","red":"bun run agent:test:backend -- test/tst_bts_graph_contract_admission.test.ts test/tst_bts_graph_merge_pg.test.ts test/tst_bts_graph_derive.test.ts"} -->
- [x] KG_PROCESS_002 — Workspace round trips preserve stored extras without copying read defaults. (70 min) — 105f732d236433a02670445de97a8807ec71a51e
<!-- plan:task-meta:{"writes":["backend/src/core/workspace-transfer.ts","backend/src/services/workspace/workspace-document.ts","backend/src/services/graph/graph.transfer.ts","backend/src/services/graph/entity.repository.ts","backend/src/services/graph/link.repository.ts","backend/test/tst_bts_workspace_document.test.ts","backend/test/tst_bts_workspace_transfer.test.ts","backend/test/tst_bts_dataset_format.test.ts"],"predictedActiveMinutes":70,"predictedCredits":0,"how":"1. Reproduce KG-15 and KG-31 with stored indexed false/null, no graph_index row, pinOrder zero, private/archive values and stopped sync. 2. Decouple WorkspaceEntitySchema operational fields from public EntitySchema. Carry stored processing permission, workspace viewer preference and sync pair explicitly through the versioned transfer contract. 3. Apply explicit old-origin/kind/pin migration and restore system ownership through GraphService. Preserve dates and claims; do not fabricate Event IDs, cache status rows or foreign owner endpoints. 4. Keep the existing index rebuild policy. Historical cross-owner transfer export remains disabled with the transfer gate rather than inventing an ACL projection.","red":"bun run agent:test:backend -- test/tst_bts_workspace_document.test.ts test/tst_bts_workspace_transfer.test.ts test/tst_bts_dataset_format.test.ts"} -->

##### Acceptance criteria

- [x] `bun run agent:test:backend -- test/tst_bts_graph_contract_admission.test.ts test/tst_bts_graph_merge_pg.test.ts test/tst_bts_graph_derive.test.ts test/tst_bts_workspace_document.test.ts test/tst_bts_workspace_transfer.test.ts` exits 0 — 105f732d236433a02670445de97a8807ec71a51e
- [x] Commit — 105f732d236433a02670445de97a8807ec71a51e

##### Results

<!-- plan:results:D1-S6:start -->
| Task | Commit | UTC start-end | Active / elapsed | Usage | Result / proof |
|---|---|---|---:|---|---|
| KG_PROCESS_001 | 105f732d236433a02670445de97a8807ec71a51e | 2026-10-07T14:03:44.591Z–2026-10-07T14:38:38.444Z | 34.89755 / 34.89755 min | unavailable: not measured by planctl | Merge now validates schema versions, final properties and conflicting privacy/sync/pin choices inside the existing transaction. Extraction validates owned canonical evidence, endpoint roles, domain schemas and source revision before replacing claims. Workspace v7 preserves stored extras and precision, migrates proven legacy kinds/claims/withdrawals with collision checks and remaps duplicate references. RED reproduced admission and codec gaps; scoped tests, typecheck, lint and enabled commit hooks pass (347 backend tests, zero failures). — beyond writes: backend/src/services/graph/types.ts, backend/src/services/workspace/workspace-graph-migration.ts, backend/test/tst_bts_dataset_document.test.ts, backend/test/tst_bts_eval_fixture.test.ts, backend/test/tst_bts_graph_statement_integration.test.ts, backend/test/tst_bts_workspace_export.test.ts, backend/test/tst_bts_workspace_template.test.ts, docs/agent/memory-roadmap.md, docs/agent/speculative-graph-overlay.md, docs/architecture/entity-lifecycle.md, docs/backend/ai-models.md, docs/backend/episodes.md, docs/backend/graph-service.md, docs/backend/sync.md, docs/backend/workspace-transfer.md, docs/datasets.md, docs/frontend/onboarding.md, docs/plugins/authoring.md |
| KG_PROCESS_002 | 105f732d236433a02670445de97a8807ec71a51e | 2026-10-07T14:03:44.591Z–2026-10-07T14:38:38.444Z | 34.89755 / 34.89755 min | unavailable: not measured by planctl | Merge now validates schema versions, final properties and conflicting privacy/sync/pin choices inside the existing transaction. Extraction validates owned canonical evidence, endpoint roles, domain schemas and source revision before replacing claims. Workspace v7 preserves stored extras and precision, migrates proven legacy kinds/claims/withdrawals with collision checks and remaps duplicate references. RED reproduced admission and codec gaps; scoped tests, typecheck, lint and enabled commit hooks pass (347 backend tests, zero failures). — beyond writes: backend/src/services/graph/types.ts, backend/src/services/workspace/workspace-graph-migration.ts, backend/test/tst_bts_dataset_document.test.ts, backend/test/tst_bts_eval_fixture.test.ts, backend/test/tst_bts_graph_statement_integration.test.ts, backend/test/tst_bts_workspace_export.test.ts, backend/test/tst_bts_workspace_template.test.ts, docs/agent/memory-roadmap.md, docs/agent/speculative-graph-overlay.md, docs/architecture/entity-lifecycle.md, docs/backend/ai-models.md, docs/backend/episodes.md, docs/backend/graph-service.md, docs/backend/sync.md, docs/backend/workspace-transfer.md, docs/datasets.md, docs/frontend/onboarding.md, docs/plugins/authoring.md |
<!-- plan:results:D1-S6:end -->
<!-- plan:stage:D1-S6:end -->

<!-- plan:stage:D1-S7:start -->
<!-- plan:stage-meta:{"deliveryId":"D1","depends":["D1-S6"],"parallelWith":[],"writes":["backend/src/plugin-runtime/manifest-parser.ts","backend/src/plugin-runtime/manifest-types.ts","backend/src/services/extensions/extension-artifact-codec.ts","backend/src/services/extensions/extension.repository.ts","packages/sdk/src/core/plugin.ts","packages/sdk/src/rpc/registry.ts","packages/sdk/package.json","scripts/sdk-contract-audit.ts","scripts/sdk-package-smoke.ts","backend/test/tst_bts_entity_one_type_version.test.ts","backend/test/tst_bts_workspace_installation.test.ts","frontend/src/runtime/contracts/agent.ts","frontend/src/runtime/contracts/index.ts","frontend/src/runtime/agent/contributions.ts","frontend/src/runtime/contracts/__tests__/contracts.test.ts","backend/src/plugin-runtime/ops/graph-entity-ops.ts","backend/src/plugin-runtime/ops/graph-integration-ops.ts","backend/src/plugin-runtime/ops/graph-mutation-ops.ts","backend/src/plugin-runtime/ops/graph-op-support.ts","backend/src/plugin-runtime/ops/graph-query-ops.ts","backend/src/plugin-runtime/ops/graph-targeted-ops.ts","backend/src/plugin-runtime/ops/graph-window-ops.ts","backend/test/tst_bts_entity_one_type_host_protocol.test.ts","backend/test/tst_bts_entity_one_type_transport.test.ts","scripts/gen-host-stubs.sh","backend/test/tst_bts_ext_update_001.test.ts","backend/test/harness/fixture-packages.ts","packages/sdk/src/core/entity.ts","packages/sdk/src/core/link.ts","packages/sdk/src/core/statement.ts","packages/sdk/src/core/id.ts","packages/sdk/src/core/assert-equal.ts","packages/sdk/src/core/sync.ts","backend/src/services/graph/types.ts","backend/src/services/workspace/workspace-document.ts","packages/sdk/test/contract-kernel.test.ts","packages/sdk/src/index.ts","packages/sdk/src/core/graph-commands.ts","backend/src/services/graph/graph.repository.ts","backend/src/services/graph/graph.service.ts","backend/test/tst_bts_core_link.test.ts","packages/sdk/src/core/indexing.ts","packages/sdk/src/rpc/native/eval.ts","packages/sdk/src/rpc/native/graph.ts","backend/src/services/graph/graph.transfer.ts","backend/test/tst_bts_graph_statement_write.test.ts","packages/sdk/src/core/search.ts","backend/test/tst_bts_ext_artifact_001.test.ts","backend/test/tst_bts_schema_001.test.ts","backend/test/tst_bts_ext_owner_001.test.ts","backend/test/tst_bts_api_ctl_module_settings.test.ts","backend/test/tst_bts_api_rpc_manifest.test.ts","backend/test/tst_bts_ext_deps.test.ts","backend/test/tst_bts_ext_pg_repo.test.ts","backend/test/tst_bts_src_module_adapter_001.test.ts","backend/test/tst_bts_ext_boot_001.test.ts","backend/test/tst_bts_prt_catalog_seam.test.ts","backend/test/fixtures/plugin_root/modules/fx/manifest.toml","backend/test/tst_bts_src_mode_001.test.ts","backend/test/tst_bts_ext_assets_001.test.ts","backend/test/fixtures/plugin_root/modules/triggers/manifest.toml","docs/agent/speculative-graph-overlay.md","docs/backend/modules.md","docs/plugins/authoring.md","docs/backend/graph-service.md","docs/backend/workspace-transfer.md","docs/architecture/entity-lifecycle.md","docs/agent/memory-roadmap.md","docs/backend/episodes.md","docs/datasets.md","backend/src/core/assert-equal.ts"],"tempRoot":".tmp/code-production/entity-docs/D1-S7","predictedActiveMinutes":115,"predictedCredits":0,"verifyActiveMinutes":20,"verifyCredits":0} -->
#### Stage D1-S7 — Prepare compatible SDK and host artifacts for the catalog

- Owner: Codex; Profile: strong; Depends: D1-S6; Parallel with: none.
- Writes: `backend/src/plugin-runtime/manifest-parser.ts`, `backend/src/plugin-runtime/manifest-types.ts`, `backend/src/services/extensions/extension-artifact-codec.ts`, `backend/src/services/extensions/extension.repository.ts`, `packages/sdk/src/core/plugin.ts`, `packages/sdk/src/rpc/registry.ts`, `packages/sdk/package.json`, `scripts/sdk-contract-audit.ts`, `scripts/sdk-package-smoke.ts`, `backend/test/tst_bts_entity_one_type_version.test.ts`, `backend/test/tst_bts_workspace_installation.test.ts`, `frontend/src/runtime/contracts/agent.ts`, `frontend/src/runtime/contracts/index.ts`, `frontend/src/runtime/agent/contributions.ts`, `frontend/src/runtime/contracts/__tests__/contracts.test.ts`, `backend/src/plugin-runtime/ops/graph-entity-ops.ts`, `backend/src/plugin-runtime/ops/graph-integration-ops.ts`, `backend/src/plugin-runtime/ops/graph-mutation-ops.ts`, `backend/src/plugin-runtime/ops/graph-op-support.ts`, `backend/src/plugin-runtime/ops/graph-query-ops.ts`, `backend/src/plugin-runtime/ops/graph-targeted-ops.ts`, `backend/src/plugin-runtime/ops/graph-window-ops.ts`, `backend/test/tst_bts_entity_one_type_host_protocol.test.ts`, `backend/test/tst_bts_entity_one_type_transport.test.ts`, `scripts/gen-host-stubs.sh`, `backend/test/tst_bts_ext_update_001.test.ts`, `backend/test/harness/fixture-packages.ts`, `packages/sdk/src/core/entity.ts`, `packages/sdk/src/core/link.ts`, `packages/sdk/src/core/statement.ts`, `packages/sdk/src/core/id.ts`, `packages/sdk/src/core/assert-equal.ts`, `packages/sdk/src/core/sync.ts`, `backend/src/services/graph/types.ts`, `backend/src/services/workspace/workspace-document.ts`, `packages/sdk/test/contract-kernel.test.ts`, `packages/sdk/src/index.ts`, `packages/sdk/src/core/graph-commands.ts`, `backend/src/services/graph/graph.repository.ts`, `backend/src/services/graph/graph.service.ts`, `backend/test/tst_bts_core_link.test.ts`, `packages/sdk/src/core/indexing.ts`, `packages/sdk/src/rpc/native/eval.ts`, `packages/sdk/src/rpc/native/graph.ts`, `backend/src/services/graph/graph.transfer.ts`, `backend/test/tst_bts_graph_statement_write.test.ts`, `packages/sdk/src/core/search.ts`, `backend/test/tst_bts_ext_artifact_001.test.ts`, `backend/test/tst_bts_schema_001.test.ts`, `backend/test/tst_bts_ext_owner_001.test.ts`, `backend/test/tst_bts_api_ctl_module_settings.test.ts`, `backend/test/tst_bts_api_rpc_manifest.test.ts`, `backend/test/tst_bts_ext_deps.test.ts`, `backend/test/tst_bts_ext_pg_repo.test.ts`, `backend/test/tst_bts_src_module_adapter_001.test.ts`, `backend/test/tst_bts_ext_boot_001.test.ts`, `backend/test/tst_bts_prt_catalog_seam.test.ts`, `backend/test/fixtures/plugin_root/modules/fx/manifest.toml`, `backend/test/tst_bts_src_mode_001.test.ts`, `backend/test/tst_bts_ext_assets_001.test.ts`, `backend/test/fixtures/plugin_root/modules/triggers/manifest.toml`, `docs/agent/speculative-graph-overlay.md`, `docs/backend/modules.md`, `docs/plugins/authoring.md`, `docs/backend/graph-service.md`, `docs/backend/workspace-transfer.md`, `docs/architecture/entity-lifecycle.md`, `docs/agent/memory-roadmap.md`, `docs/backend/episodes.md`, `docs/datasets.md`, `backend/src/core/assert-equal.ts`.
- Temp root: `.tmp/code-production/entity-docs/D1-S7` (must be absent at handoff).
- Of which verification: 20 active min / 0 credits.

Prepare the app side of one compatible app/catalog release. D2 consumes this local SDK artifact before either new runtime/package pair is activated. D1 and D2 are peer Deliveries with Stage dependencies, avoiding a circular requirement for each PR's full CI to pass first.

Acceptance: KG-02 and KG-15 at transport and activation boundaries. Commit: refactor(sdk): publish strict graph read contracts.

##### Tasks

- [x] KG_API_001 — Incompatible modules fail activation before replacing their accepted version. (55 min) — 592a0335722d26c66d146c945143798f3f5211c4
<!-- plan:task-meta:{"writes":["backend/src/plugin-runtime/manifest-parser.ts","backend/src/plugin-runtime/manifest-types.ts","backend/src/services/extensions/extension-artifact-codec.ts","backend/src/services/extensions/extension.repository.ts","packages/sdk/src/core/plugin.ts","packages/sdk/src/rpc/registry.ts","packages/sdk/package.json","scripts/sdk-contract-audit.ts","scripts/sdk-package-smoke.ts","backend/test/tst_bts_entity_one_type_version.test.ts","backend/test/tst_bts_workspace_installation.test.ts"],"predictedActiveMinutes":55,"predictedCredits":0,"how":"1. Reproduce KG-15 activation failure using the existing version tests; retain the previously accepted package on rejection. 2. Use the existing manifest API compatibility mechanism for the new Entity/extras response contract. Record the exact host API version and SDK artifact digest for D2; do not silently accept old Entity consumers. 3. The existing EntityUpdateStateRequestSchema indexed input keeps its legacy boolean processing-permission meaning. It does not write extras.indexed; retain that distinction in schemas and generated docs instead of inventing another status. 4. Build/check the SDK and preserve exact response validation on native RPC and plugin host adapters.","red":"bun run agent:test:backend -- test/tst_bts_entity_one_type_version.test.ts test/tst_bts_workspace_installation.test.ts"} -->
- [x] KG_API_002 — App client and plugin host adapters agree on the final domain and extras shapes. (40 min) — 30bae8c7a44d7a1d7a92d8c509b11b1cd88c9ad1
<!-- plan:task-meta:{"writes":["frontend/src/runtime/contracts/agent.ts","frontend/src/runtime/contracts/index.ts","frontend/src/runtime/agent/contributions.ts","frontend/src/runtime/contracts/__tests__/contracts.test.ts","backend/src/plugin-runtime/ops/graph-entity-ops.ts","backend/src/plugin-runtime/ops/graph-integration-ops.ts","backend/src/plugin-runtime/ops/graph-mutation-ops.ts","backend/src/plugin-runtime/ops/graph-op-support.ts","backend/src/plugin-runtime/ops/graph-query-ops.ts","backend/src/plugin-runtime/ops/graph-targeted-ops.ts","backend/src/plugin-runtime/ops/graph-window-ops.ts","backend/test/tst_bts_entity_one_type_host_protocol.test.ts","backend/test/tst_bts_entity_one_type_transport.test.ts","scripts/gen-host-stubs.sh"],"predictedActiveMinutes":40,"predictedCredits":0,"how":"1. Run the existing host-protocol/transport tests and strict SDK contract audit against the final app shapes. 2. Generate host declarations through the existing workflow for D2-S1; do not hand-edit generated .d.ts files. 3. Complete compiler-reported app callers inside declared boundaries. Stage declarations must name additional discovered paths before edits; keep module/domain behavior unchanged except the approved contracts.","red":"bun run agent:test:backend -- test/tst_bts_entity_one_type_host_protocol.test.ts test/tst_bts_entity_one_type_transport.test.ts"} -->

##### Acceptance criteria

- [x] `bun run agent:typecheck` exits 0 — 30bae8c7a44d7a1d7a92d8c509b11b1cd88c9ad1
- [x] `bun run check:sdk` exits 0 — 30bae8c7a44d7a1d7a92d8c509b11b1cd88c9ad1
- [x] `bun run agent:test:backend -- test/tst_bts_entity_one_type_version.test.ts test/tst_bts_workspace_installation.test.ts test/tst_bts_entity_one_type_host_protocol.test.ts test/tst_bts_entity_one_type_transport.test.ts` exits 0 — 30bae8c7a44d7a1d7a92d8c509b11b1cd88c9ad1
- [x] Commit — 30bae8c7a44d7a1d7a92d8c509b11b1cd88c9ad1

##### Results

<!-- plan:results:D1-S7:start -->
| Task | Commit | UTC start-end | Active / elapsed | Usage | Result / proof |
|---|---|---|---:|---|---|
| KG_API_001 | 592a0335722d26c66d146c945143798f3f5211c4 | 2026-10-07T14:39:13.453Z–2026-10-07T15:19:15.993Z | 40.04233333333333 / 40.04233333333333 min | unavailable: not measured by planctl | Module API 0.3.0 rejects incompatible candidates while preserving the active artifact; SDK 0.2.0 strict audit and external consumer smoke pass (67 SDK tests), host/transport checks and commit gate pass (481 backend and 682 frontend tests). Generated 348 host declarations. Handoff /tmp/magnis-knowledge-graph-sdk/magnis-sdk-0.2.0.tgz SHA256 f956a90388a54e5edd8632903bbd44172c0d7bdbc830037989472418a68ce1ff. — beyond writes: backend/src/core/assert-equal.ts, backend/src/services/graph/graph.repository.ts, backend/src/services/graph/graph.service.ts, backend/src/services/graph/graph.transfer.ts, backend/src/services/graph/types.ts, backend/src/services/workspace/workspace-document.ts, backend/test/fixtures/plugin_root/modules/fx/manifest.toml, backend/test/fixtures/plugin_root/modules/triggers/manifest.toml, backend/test/harness/fixture-packages.ts, backend/test/tst_bts_api_ctl_module_settings.test.ts, backend/test/tst_bts_api_rpc_manifest.test.ts, backend/test/tst_bts_core_link.test.ts, backend/test/tst_bts_ext_artifact_001.test.ts, backend/test/tst_bts_ext_assets_001.test.ts, backend/test/tst_bts_ext_boot_001.test.ts, backend/test/tst_bts_ext_deps.test.ts, backend/test/tst_bts_ext_owner_001.test.ts, backend/test/tst_bts_ext_pg_repo.test.ts, backend/test/tst_bts_ext_update_001.test.ts, backend/test/tst_bts_graph_statement_write.test.ts, backend/test/tst_bts_prt_catalog_seam.test.ts, backend/test/tst_bts_schema_001.test.ts, backend/test/tst_bts_src_mode_001.test.ts, backend/test/tst_bts_src_module_adapter_001.test.ts, docs/agent/memory-roadmap.md, docs/agent/speculative-graph-overlay.md, docs/architecture/entity-lifecycle.md, docs/backend/episodes.md, docs/backend/graph-service.md, docs/backend/modules.md, docs/backend/workspace-transfer.md, docs/datasets.md, docs/plugins/authoring.md, packages/sdk/src/core/assert-equal.ts, packages/sdk/src/core/entity.ts, packages/sdk/src/core/graph-commands.ts, packages/sdk/src/core/id.ts, packages/sdk/src/core/indexing.ts, packages/sdk/src/core/link.ts, packages/sdk/src/core/search.ts, packages/sdk/src/core/statement.ts, packages/sdk/src/core/sync.ts, packages/sdk/src/index.ts, packages/sdk/src/rpc/native/eval.ts, packages/sdk/src/rpc/native/graph.ts, packages/sdk/test/contract-kernel.test.ts |
| KG_API_002 | 592a0335722d26c66d146c945143798f3f5211c4 | 2026-10-07T14:39:13.453Z–2026-10-07T15:19:15.993Z | 40.04233333333333 / 40.04233333333333 min | unavailable: not measured by planctl | Module API 0.3.0 rejects incompatible candidates while preserving the active artifact; SDK 0.2.0 strict audit and external consumer smoke pass (67 SDK tests), host/transport checks and commit gate pass (481 backend and 682 frontend tests). Generated 348 host declarations. Handoff /tmp/magnis-knowledge-graph-sdk/magnis-sdk-0.2.0.tgz SHA256 f956a90388a54e5edd8632903bbd44172c0d7bdbc830037989472418a68ce1ff. — beyond writes: backend/src/core/assert-equal.ts, backend/src/services/graph/graph.repository.ts, backend/src/services/graph/graph.service.ts, backend/src/services/graph/graph.transfer.ts, backend/src/services/graph/types.ts, backend/src/services/workspace/workspace-document.ts, backend/test/fixtures/plugin_root/modules/fx/manifest.toml, backend/test/fixtures/plugin_root/modules/triggers/manifest.toml, backend/test/harness/fixture-packages.ts, backend/test/tst_bts_api_ctl_module_settings.test.ts, backend/test/tst_bts_api_rpc_manifest.test.ts, backend/test/tst_bts_core_link.test.ts, backend/test/tst_bts_ext_artifact_001.test.ts, backend/test/tst_bts_ext_assets_001.test.ts, backend/test/tst_bts_ext_boot_001.test.ts, backend/test/tst_bts_ext_deps.test.ts, backend/test/tst_bts_ext_owner_001.test.ts, backend/test/tst_bts_ext_pg_repo.test.ts, backend/test/tst_bts_ext_update_001.test.ts, backend/test/tst_bts_graph_statement_write.test.ts, backend/test/tst_bts_prt_catalog_seam.test.ts, backend/test/tst_bts_schema_001.test.ts, backend/test/tst_bts_src_mode_001.test.ts, backend/test/tst_bts_src_module_adapter_001.test.ts, docs/agent/memory-roadmap.md, docs/agent/speculative-graph-overlay.md, docs/architecture/entity-lifecycle.md, docs/backend/episodes.md, docs/backend/graph-service.md, docs/backend/modules.md, docs/backend/workspace-transfer.md, docs/datasets.md, docs/plugins/authoring.md, packages/sdk/src/core/assert-equal.ts, packages/sdk/src/core/entity.ts, packages/sdk/src/core/graph-commands.ts, packages/sdk/src/core/id.ts, packages/sdk/src/core/indexing.ts, packages/sdk/src/core/link.ts, packages/sdk/src/core/search.ts, packages/sdk/src/core/statement.ts, packages/sdk/src/core/sync.ts, packages/sdk/src/index.ts, packages/sdk/src/rpc/native/eval.ts, packages/sdk/src/rpc/native/graph.ts, packages/sdk/test/contract-kernel.test.ts |
| KG_API_002 | 30bae8c7a44d7a1d7a92d8c509b11b1cd88c9ad1 | 2026-10-07T15:21:57.766Z–2026-10-07T15:25:53.756Z | 3.9331666666666667 / 3.9331666666666667 min | unavailable: not measured by planctl | The existing generator emits executable SDK contracts beside 348 declarations, disables the SDK incremental cache when replacing the output tree, and preserves the catalog declaration tsconfig. The generated PersistentEntityIdSchema accepts stored UUIDs and rejects nil; unchanged SDK version and artifact, commit hooks pass. |
<!-- plan:results:D1-S7:end -->
<!-- plan:stage:D1-S7:end -->

<!-- plan:stage:D1-S8:start -->
<!-- plan:stage-meta:{"deliveryId":"D1","depends":["D2-S2"],"parallelWith":[],"writes":["packages/sdk/src/core/link.ts","backend/src/services/graph/graph-contracts.ts","backend/src/services/graph/graph.registrar.ts","backend/src/services/graph/graph.repository.ts","backend/src/services/graph/graph.transfer.ts","backend/migrations/20261007000004_graph_communication.sql","backend/src/db/schema/graph.ts","backend/test/tst_bts_graph_link_kinds.test.ts","backend/test/tst_bts_graph_batch.test.ts","backend/test/tst_bts_workspace_transfer.test.ts","packages/sdk/src/core/source.ts","backend/src/services/graph/link.repository.ts","backend/src/services/graph/entity.repository.ts","backend/src/services/workspace/workspace-document.ts","backend/test/tst_bts_workspace_document.test.ts","packages/sdk/src/index.ts","docs/datasets.md","docs/backend/workspace-transfer.md","backend/test/tst_bts_graph_relations_table.test.ts","packages/sdk/src/core/communication.ts","scripts/gen-host-stubs.sh","packages/sdk/package.json","docs/architecture/entity-lifecycle.md","docs/agent/memory-roadmap.md","docs/agent/speculative-graph-overlay.md"],"tempRoot":".tmp/code-production/entity-docs/D1-S8","predictedActiveMinutes":95,"predictedCredits":0,"verifyActiveMinutes":20,"verifyCredits":0} -->
#### Stage D1-S8 — Validate observed communication after its remaining domain decision

- Owner: Codex; Profile: strong; Depends: D2-S2; Parallel with: none.
- Writes: `packages/sdk/src/core/link.ts`, `backend/src/services/graph/graph-contracts.ts`, `backend/src/services/graph/graph.registrar.ts`, `backend/src/services/graph/graph.repository.ts`, `backend/src/services/graph/graph.transfer.ts`, `backend/migrations/20261007000004_graph_communication.sql`, `backend/src/db/schema/graph.ts`, `backend/test/tst_bts_graph_link_kinds.test.ts`, `backend/test/tst_bts_graph_batch.test.ts`, `backend/test/tst_bts_workspace_transfer.test.ts`, `packages/sdk/src/core/source.ts`, `backend/src/services/graph/link.repository.ts`, `backend/src/services/graph/entity.repository.ts`, `backend/src/services/workspace/workspace-document.ts`, `backend/test/tst_bts_workspace_document.test.ts`, `packages/sdk/src/index.ts`, `docs/datasets.md`, `docs/backend/workspace-transfer.md`, `backend/test/tst_bts_graph_relations_table.test.ts`, `packages/sdk/src/core/communication.ts`, `scripts/gen-host-stubs.sh`, `packages/sdk/package.json`, `docs/architecture/entity-lifecycle.md`, `docs/agent/memory-roadmap.md`, `docs/agent/speculative-graph-overlay.md`.
- Temp root: `.tmp/code-production/entity-docs/D1-S8` (must be absent at handoff).
- Of which verification: 20 active min / 0 credits.

The owner approved the minimal mailbox/account, conversation and provider-message model on 2026-10-08. Implement the exact Section G contract through existing registry, batch and transfer paths. Retain unresolved historical context and Episode sent links; do not infer observed delivery from them.

Use the existing Link registry and transaction paths. Repeated delivery must have a declared occurrence identity before it can be represented. This Stage adds domain facts, not subscription dispatch or a Trigger queue.

Acceptance: KG-21 and KG-28 after the domain amendment. Commit: feat(graph): validate observed communication facts.

Required handoff evidence: Owner-approved mailbox/account, conversation and repeated-delivery contract recorded before product writes.

##### Tasks

- [x] KG_COMM_001 — Communication Links reference concrete authorized endpoints and preserve occurrence identity. (75 min) — 59faa711c631212398bb917b55fdd3c53abef1aa
<!-- plan:task-meta:{"writes":["packages/sdk/src/core/link.ts","backend/src/services/graph/graph-contracts.ts","backend/src/services/graph/graph.registrar.ts","backend/src/services/graph/graph.repository.ts","backend/src/services/graph/graph.transfer.ts","backend/migrations/20261007000004_graph_communication.sql","backend/src/db/schema/graph.ts","backend/test/tst_bts_graph_link_kinds.test.ts","backend/test/tst_bts_graph_batch.test.ts","backend/test/tst_bts_workspace_transfer.test.ts"],"predictedActiveMinutes":75,"predictedCredits":0,"how":"1. Before code changes, obtain the SPEC G decision on concrete mailbox/account and conversation representation plus repeated-delivery identity. Use planctl needs_owner for this task if absent; SPEC approval does not supply those choices. 2. Record the chosen interfaces, endpoint schemas, migration mapping and exact affected paths through an owner-backed plan amendment before resuming this stage. This is an execution prerequisite, not permission to invent missing fields or IDs. 3. Reproduce KG-21/KG-28 with confirmed delivery, unknown occurrence time, rollback, repeat ingestion and legacy context-only rows. 4. Validate sent/received metadata and all referenced endpoints through Graph. Preserve temporal facts and unresolved legacy history in a transactional migration; reject unjustified conversions.","red":"bun run agent:test:backend -- test/tst_bts_graph_link_kinds.test.ts test/tst_bts_graph_batch.test.ts test/tst_bts_workspace_transfer.test.ts"} -->

##### Acceptance criteria

- [x] `bun run agent:test:backend -- test/tst_bts_graph_link_kinds.test.ts test/tst_bts_graph_batch.test.ts test/tst_bts_workspace_transfer.test.ts` exits 0 — 59faa711c631212398bb917b55fdd3c53abef1aa
- [x] Commit — 59faa711c631212398bb917b55fdd3c53abef1aa

##### Results

<!-- plan:results:D1-S8:start -->
| Task | Commit | UTC start-end | Active / elapsed | Usage | Result / proof |
|---|---|---|---:|---|---|
| KG_COMM_001 | 59faa711c631212398bb917b55fdd3c53abef1aa | 2026-10-08T07:33:06.221Z–2026-10-08T14:25:15.746Z | 412.15875 / 412.15875 min | unavailable: not measured by planctl | Graph validates canonical sent/received observations, scoped accounts and conversation IDs; preserves unknown times, no-change replay and atomic conflict rollback. SQL/v6 upgrades scope message anchors without fabricating historical delivery. Transfer remaps and validates conversation IDs. 55 scoped tests/typechecks passed; commit hook passed 336 backend and 683 frontend tests. — beyond writes: backend/src/services/graph/entity.repository.ts, backend/src/services/graph/link.repository.ts, backend/src/services/workspace/workspace-document.ts, backend/test/tst_bts_graph_relations_table.test.ts, backend/test/tst_bts_workspace_document.test.ts, docs/backend/workspace-transfer.md, docs/datasets.md, packages/sdk/src/core/source.ts, packages/sdk/src/index.ts |
<!-- plan:results:D1-S8:end -->
<!-- plan:stage:D1-S8:end -->

<!-- plan:stage:D1-S9:start -->
<!-- plan:stage-meta:{"deliveryId":"D1","depends":["D2-S4"],"parallelWith":[],"writes":["backend/test/tst_bts_workspace_transfer.test.ts","backend/test/tst_bts_workspace_installation.test.ts","backend/test/tst_bts_graph_owner.test.ts","backend/test/tst_bts_graph_contract_admission.test.ts","test-e2e/context-panel-entity-graph.spec.ts","test-e2e/entity-triggers.spec.ts","test-e2e/plugin-store-install.spec.ts","test-e2e/fixtures/channel/module__companies.tgz","test-e2e/fixtures/channel/module__contacts.tgz","test-e2e/fixtures/channel/module__email.tgz","test-e2e/fixtures/channel/module__file.tgz","test-e2e/fixtures/channel/module__linkedin.tgz","test-e2e/fixtures/channel/module__meetings.tgz","test-e2e/fixtures/channel/module__notes.tgz","test-e2e/fixtures/channel/module__projects.tgz","test-e2e/fixtures/channel/module__telegram.tgz","test-e2e/fixtures/channel/module__triggers.tgz","test-e2e/fixtures/channel/module__x.tgz","test-e2e/fixtures/channel/onboarding.json","test-e2e/fixtures/channel/packages.json","test-e2e/fixtures/channel/receipt-0811825f7e6d038eb9a7b29312f5693c39d1ddab9c5e8594bfecb004ff06d07b.json","test-e2e/fixtures/channel/receipt-2999561ffd1f3da9049448fe3e1445bc8839717d55b23b6b0430109440c80a36.json","test-e2e/fixtures/channel/receipt-7f5aa349fa28b77e44067f6346a76af1738bd3a61521c5260ed6ca4f6936453c.json","test-e2e/fixtures/channel/receipt-c0dbeb09ce971c7459ff56335a8ca2e906f910d6e1fbebb47f78c5f5c21fee0a.json","test-e2e/fixtures/channel/receipt-eb68cc2a79a1f63972551bd760a274a80d063f0576de9d0517490515cd385c83.json","test-e2e/fixtures/channel/source__local.tgz","test-e2e/fixtures/channel/source__mock-gmail.tgz","test-e2e/fixtures/channel/source__mock-statemachine-oauth.tgz","test-e2e/fixtures/channel/source__mock-statemachine-phone.tgz","test-e2e/fixtures/channel/source__mock-telegram.tgz"],"tempRoot":".tmp/code-production/entity-docs/D1-S9","predictedActiveMinutes":70,"predictedCredits":0,"verifyActiveMinutes":25,"verifyCredits":0} -->
#### Stage D1-S9 — Verify migrations and the paired app/catalog release

- Owner: Codex; Profile: strong; Depends: D2-S4; Parallel with: none.
- Writes: `backend/test/tst_bts_workspace_transfer.test.ts`, `backend/test/tst_bts_workspace_installation.test.ts`, `backend/test/tst_bts_graph_owner.test.ts`, `backend/test/tst_bts_graph_contract_admission.test.ts`, `test-e2e/context-panel-entity-graph.spec.ts`, `test-e2e/entity-triggers.spec.ts`, `test-e2e/plugin-store-install.spec.ts`, `test-e2e/fixtures/channel/module__companies.tgz`, `test-e2e/fixtures/channel/module__contacts.tgz`, `test-e2e/fixtures/channel/module__email.tgz`, `test-e2e/fixtures/channel/module__file.tgz`, `test-e2e/fixtures/channel/module__linkedin.tgz`, `test-e2e/fixtures/channel/module__meetings.tgz`, `test-e2e/fixtures/channel/module__notes.tgz`, `test-e2e/fixtures/channel/module__projects.tgz`, `test-e2e/fixtures/channel/module__telegram.tgz`, `test-e2e/fixtures/channel/module__triggers.tgz`, `test-e2e/fixtures/channel/module__x.tgz`, `test-e2e/fixtures/channel/onboarding.json`, `test-e2e/fixtures/channel/packages.json`, `test-e2e/fixtures/channel/receipt-0811825f7e6d038eb9a7b29312f5693c39d1ddab9c5e8594bfecb004ff06d07b.json`, `test-e2e/fixtures/channel/receipt-2999561ffd1f3da9049448fe3e1445bc8839717d55b23b6b0430109440c80a36.json`, `test-e2e/fixtures/channel/receipt-7f5aa349fa28b77e44067f6346a76af1738bd3a61521c5260ed6ca4f6936453c.json`, `test-e2e/fixtures/channel/receipt-c0dbeb09ce971c7459ff56335a8ca2e906f910d6e1fbebb47f78c5f5c21fee0a.json`, `test-e2e/fixtures/channel/receipt-eb68cc2a79a1f63972551bd760a274a80d063f0576de9d0517490515cd385c83.json`, `test-e2e/fixtures/channel/source__local.tgz`, `test-e2e/fixtures/channel/source__mock-gmail.tgz`, `test-e2e/fixtures/channel/source__mock-statemachine-oauth.tgz`, `test-e2e/fixtures/channel/source__mock-statemachine-phone.tgz`, `test-e2e/fixtures/channel/source__mock-telegram.tgz`.
- Temp root: `.tmp/code-production/entity-docs/D1-S9` (must be absent at handoff).
- Of which verification: 25 active min / 0 credits.

Complete the single app publication gate with the already-verified catalog artifact. This proves the requested graph migration while retaining the SPEC's explicit limits: bounded cross-owner transfer, subscription execution, ending notification semantics and revision-based search scheduling are not silently enabled.

Acceptance: all implemented KG cases; KG-09 is checked as unavailable until its separate history contract. Commit: test(graph): verify upgraded workspaces and catalog compatibility.

Required handoff evidence: Both exact app/catalog heads and artifact digests recorded with passing gates. Migration/restore and protected-owner PostgreSQL scenarios passed; no unapproved release.

##### Tasks

- [ ] KG_RELEASE_002 — Upgraded workspaces and matching packages pass app integration without widening scope. (45 min)
<!-- plan:task-meta:{"writes":["backend/test/tst_bts_workspace_transfer.test.ts","backend/test/tst_bts_workspace_installation.test.ts","backend/test/tst_bts_graph_owner.test.ts","backend/test/tst_bts_graph_contract_admission.test.ts","test-e2e/context-panel-entity-graph.spec.ts","test-e2e/entity-triggers.spec.ts","test-e2e/plugin-store-install.spec.ts","test-e2e/fixtures/channel/module__companies.tgz","test-e2e/fixtures/channel/module__contacts.tgz","test-e2e/fixtures/channel/module__email.tgz","test-e2e/fixtures/channel/module__file.tgz","test-e2e/fixtures/channel/module__linkedin.tgz","test-e2e/fixtures/channel/module__meetings.tgz","test-e2e/fixtures/channel/module__notes.tgz","test-e2e/fixtures/channel/module__projects.tgz","test-e2e/fixtures/channel/module__telegram.tgz","test-e2e/fixtures/channel/module__triggers.tgz","test-e2e/fixtures/channel/module__x.tgz","test-e2e/fixtures/channel/onboarding.json","test-e2e/fixtures/channel/packages.json","test-e2e/fixtures/channel/receipt-0811825f7e6d038eb9a7b29312f5693c39d1ddab9c5e8594bfecb004ff06d07b.json","test-e2e/fixtures/channel/receipt-2999561ffd1f3da9049448fe3e1445bc8839717d55b23b6b0430109440c80a36.json","test-e2e/fixtures/channel/receipt-7f5aa349fa28b77e44067f6346a76af1738bd3a61521c5260ed6ca4f6936453c.json","test-e2e/fixtures/channel/receipt-c0dbeb09ce971c7459ff56335a8ca2e906f910d6e1fbebb47f78c5f5c21fee0a.json","test-e2e/fixtures/channel/receipt-eb68cc2a79a1f63972551bd760a274a80d063f0576de9d0517490515cd385c83.json","test-e2e/fixtures/channel/source__local.tgz","test-e2e/fixtures/channel/source__mock-gmail.tgz","test-e2e/fixtures/channel/source__mock-statemachine-oauth.tgz","test-e2e/fixtures/channel/source__mock-statemachine-phone.tgz","test-e2e/fixtures/channel/source__mock-telegram.tgz"],"predictedActiveMinutes":45,"predictedCredits":0,"how":"1. Use the exact D2-S4 catalog artifact in the existing E2E channel workflow; regenerate only its established fixtures. 2. Verify upgraded SQL constraints, versioned restore, nil auth-user binding, pin/archive/privacy/sync choices, protected owner rejection and domain merge/extraction scenarios. Run PostgreSQL migration/concurrency cases through the existing harness. 3. Run the complete app agent:verify:pr once after scoped checks; retain hooks and reuse unchanged passing results. Reproduce any new failure before a scoped repair. 4. Record KG coverage and remaining owner-gated transfer/Trigger work. CI must be green on both matching PR heads before the owner chooses merge/release; do not waive failures inherited from older plans.","red":"bun run agent:test:e2e -- test-e2e/context-panel-entity-graph.spec.ts test-e2e/entity-triggers.spec.ts test-e2e/plugin-store-install.spec.ts"} -->

##### Acceptance criteria

- [ ] `bun run agent:verify:pr` exits 0
- [ ] Commit

##### Results

<!-- plan:results:D1-S9:start -->
| Task | Commit | UTC start-end | Active / elapsed | Usage | Result / proof |
|---|---|---|---:|---|---|
<!-- plan:results:D1-S9:end -->
<!-- plan:stage:D1-S9:end -->
<!-- plan:delivery:D1:end -->

<!-- plan:delivery:D2:start -->
<!-- plan:delivery-meta:{"active":false,"depends":[],"predictedExternalWaitMinutes":0,"repository":"catalog"} -->
### PR Delivery D2 — Align catalog modules with knowledge graph contracts

Branch: `worktree/entity-docs`; Depends: none; Gate: backend, frontend, sdk, build.

Stage graph: `D1-S7 -> D2-S1 -> D2-S2 -> D1-S8 -> D2-S3 -> D2-S4 -> D1-S9`.

Forecast: 535 active min / 0 credits across 4 Stages; longest dependency path 330 active min; external waits 0 min.

Update the plugin SDK, generated host declarations and current module/UI consumers together. Modules declare domain Link kinds, use the shared membership/creation contract and preserve sender/recipient meaning. Email's current sent_from and its known historical sender-only authored_by map to received_from; observed sent/received facts wait for the explicit communication decision.

Use the exact app SDK/API version produced by D1-S7. D2-S4 builds and verifies the catalog artifact used by D1-S9. Record matching heads/digests and prove incompatible activation retains the prior accepted package. Preserve existing live Trigger notifications until the later logic cutover.

D2 is configured and executed under the shared setup, forecast assumptions and decision gates in D1. Its write paths belong to the catalog checkout. Its PR includes the already-authored developer reference and migration plan; app changes remain in D1.

<!-- plan:stage:D2-S1:start -->
<!-- plan:stage-meta:{"deliveryId":"D2","depends":["D1-S7"],"parallelWith":[],"writes":["packages/plugin-sdk/contract/module.ts","packages/plugin-sdk/index.ts","packages/plugin-sdk/__tests__/graphContract.test.ts","packages/plugin-sdk/__tests__/reachedEndpoints.test.ts","packages/testkit/module.ts","packages/testkit/__tests__/module.test.ts","packages/host-stubs/types/","packages/host-stubs/package.json","modules/addressbook/module/__tests__/addressbookIngest.test.ts","modules/contacts/module/__tests__/socialTracking.test.ts","modules/contacts/module/helpers.ts","modules/contacts/module/service.ts","modules/contacts/types.ts","modules/email/entities.test.ts","modules/email/module/__tests__/emailControl.test.ts","modules/email/module/__tests__/emailIngest.test.ts","modules/email/module/__tests__/emailRead.test.ts","modules/email/module/service.ts","modules/email/schema.ts","modules/email/types.ts","modules/meetings/module/__tests__/meetingsSync.test.ts","modules/notes/module/service.ts","modules/notes/types.ts","modules/projects/module/helpers.ts","modules/projects/types.ts","modules/telegram/entities.test.ts","modules/telegram/module/__tests__/sendMessageDelivery.test.ts","modules/telegram/module/__tests__/syncPlan.test.ts","modules/telegram/module/__tests__/telegramCommand.test.ts","modules/telegram/module/__tests__/telegramIngest.test.ts","modules/telegram/module/__tests__/telegramRead.test.ts","modules/telegram/module/service.ts","modules/telegram/types.ts","modules/x/entities.test.ts","modules/x/module/__tests__/xIngest.test.ts","modules/x/module/service.ts","modules/addressbook/manifest.toml","modules/companies/manifest.toml","modules/contacts/manifest.toml","modules/email/manifest.toml","modules/file/manifest.toml","modules/linkedin/manifest.toml","modules/meetings/manifest.toml","modules/notes/manifest.toml","modules/projects/manifest.toml","modules/telegram/manifest.toml","modules/triggers/manifest.toml","modules/x/manifest.toml","modules/contacts/ui/ContactOverview.tsx","modules/contacts/ui/SyncToolCallRenderer.tsx","modules/contacts/ui/__tests__/ContactInfoColumn.test.tsx","modules/contacts/ui/index.tsx","modules/email/ui/EmailDetailPanel.tsx","modules/email/ui/__tests__/EmailDetailPanel.test.tsx","modules/email/ui/index.tsx","modules/telegram/ui/TelegramChatItemContent.tsx","modules/telegram/ui/TelegramChatView.tsx","modules/telegram/ui/TelegramDetailWrapper.tsx","modules/telegram/ui/__tests__/TelegramChatTheme.test.tsx","modules/telegram/ui/__tests__/chatHeaderTotal.test.tsx","modules/telegram/ui/hooks/useTelegramChatList.ts","modules/telegram/ui/index.tsx","modules/telegram/ui/types.ts","packages/host-stubs/theme.css","scripts/plugin-host-imports.json","vitest.config.ts","vitest.ui.config.ts","modules/addressbook/entities.test.ts","modules/addressbook/module/service.ts","modules/contacts/module/__tests__/contactsWrite.test.ts","modules/contacts/ui/ContactMergeAction.tsx","modules/contacts/ui/__tests__/ContactMergeAction.test.tsx","modules/contacts/ui/__tests__/ContactMergeResolution.test.tsx","modules/linkedin/entities.test.ts","modules/linkedin/module/__tests__/linkedinIngest.test.ts","modules/linkedin/module/service.ts","modules/meetings/entities.test.ts","modules/meetings/module/__tests__/meetingsRead.test.ts","modules/projects/module/__tests__/projectsChecklist.test.ts","modules/projects/module/__tests__/projectsRead.test.ts","modules/telegram/module/__tests__/chatBatchSnapshotMerge.test.ts","modules/telegram/module/__tests__/mediaSourceRouting.test.ts","modules/triggers/module/__tests__/triggersWrite.test.ts","tsconfig.base.json","modules/email/module/helpers.ts","modules/projects/module/service.ts","modules/projects/ui/mutations.ts","modules/contacts/module/__tests__/contactsRead.test.ts","modules/notes/module/__tests__/notesRead.test.ts","modules/projects/module/__tests__/projectsCrud.test.ts","modules/telegram/module/__tests__/messagesGetLinks.test.ts","docs/vision.md"],"tempRoot":".tmp/code-production/entity-docs/D2-S1","predictedActiveMinutes":190,"predictedCredits":0,"verifyActiveMinutes":25,"verifyCredits":0} -->
#### Stage D2-S1 — Move catalog reads and controls onto the new SDK

- Owner: Codex; Profile: strong; Depends: D1-S7; Parallel with: none.
- Writes: `packages/plugin-sdk/contract/module.ts`, `packages/plugin-sdk/index.ts`, `packages/plugin-sdk/__tests__/graphContract.test.ts`, `packages/plugin-sdk/__tests__/reachedEndpoints.test.ts`, `packages/testkit/module.ts`, `packages/testkit/__tests__/module.test.ts`, `packages/host-stubs/types/`, `packages/host-stubs/package.json`, `modules/addressbook/module/__tests__/addressbookIngest.test.ts`, `modules/contacts/module/__tests__/socialTracking.test.ts`, `modules/contacts/module/helpers.ts`, `modules/contacts/module/service.ts`, `modules/contacts/types.ts`, `modules/email/entities.test.ts`, `modules/email/module/__tests__/emailControl.test.ts`, `modules/email/module/__tests__/emailIngest.test.ts`, `modules/email/module/__tests__/emailRead.test.ts`, `modules/email/module/service.ts`, `modules/email/schema.ts`, `modules/email/types.ts`, `modules/meetings/module/__tests__/meetingsSync.test.ts`, `modules/notes/module/service.ts`, `modules/notes/types.ts`, `modules/projects/module/helpers.ts`, `modules/projects/types.ts`, `modules/telegram/entities.test.ts`, `modules/telegram/module/__tests__/sendMessageDelivery.test.ts`, `modules/telegram/module/__tests__/syncPlan.test.ts`, `modules/telegram/module/__tests__/telegramCommand.test.ts`, `modules/telegram/module/__tests__/telegramIngest.test.ts`, `modules/telegram/module/__tests__/telegramRead.test.ts`, `modules/telegram/module/service.ts`, `modules/telegram/types.ts`, `modules/x/entities.test.ts`, `modules/x/module/__tests__/xIngest.test.ts`, `modules/x/module/service.ts`, `modules/addressbook/manifest.toml`, `modules/companies/manifest.toml`, `modules/contacts/manifest.toml`, `modules/email/manifest.toml`, `modules/file/manifest.toml`, `modules/linkedin/manifest.toml`, `modules/meetings/manifest.toml`, `modules/notes/manifest.toml`, `modules/projects/manifest.toml`, `modules/telegram/manifest.toml`, `modules/triggers/manifest.toml`, `modules/x/manifest.toml`, `modules/contacts/ui/ContactOverview.tsx`, `modules/contacts/ui/SyncToolCallRenderer.tsx`, `modules/contacts/ui/__tests__/ContactInfoColumn.test.tsx`, `modules/contacts/ui/index.tsx`, `modules/email/ui/EmailDetailPanel.tsx`, `modules/email/ui/__tests__/EmailDetailPanel.test.tsx`, `modules/email/ui/index.tsx`, `modules/telegram/ui/TelegramChatItemContent.tsx`, `modules/telegram/ui/TelegramChatView.tsx`, `modules/telegram/ui/TelegramDetailWrapper.tsx`, `modules/telegram/ui/__tests__/TelegramChatTheme.test.tsx`, `modules/telegram/ui/__tests__/chatHeaderTotal.test.tsx`, `modules/telegram/ui/hooks/useTelegramChatList.ts`, `modules/telegram/ui/index.tsx`, `modules/telegram/ui/types.ts`, `packages/host-stubs/theme.css`, `scripts/plugin-host-imports.json`, `vitest.config.ts`, `vitest.ui.config.ts`, `modules/addressbook/entities.test.ts`, `modules/addressbook/module/service.ts`, `modules/contacts/module/__tests__/contactsWrite.test.ts`, `modules/contacts/ui/ContactMergeAction.tsx`, `modules/contacts/ui/__tests__/ContactMergeAction.test.tsx`, `modules/contacts/ui/__tests__/ContactMergeResolution.test.tsx`, `modules/linkedin/entities.test.ts`, `modules/linkedin/module/__tests__/linkedinIngest.test.ts`, `modules/linkedin/module/service.ts`, `modules/meetings/entities.test.ts`, `modules/meetings/module/__tests__/meetingsRead.test.ts`, `modules/projects/module/__tests__/projectsChecklist.test.ts`, `modules/projects/module/__tests__/projectsRead.test.ts`, `modules/telegram/module/__tests__/chatBatchSnapshotMerge.test.ts`, `modules/telegram/module/__tests__/mediaSourceRouting.test.ts`, `modules/triggers/module/__tests__/triggersWrite.test.ts`, `tsconfig.base.json`, `modules/email/module/helpers.ts`, `modules/projects/module/service.ts`, `modules/projects/ui/mutations.ts`, `modules/contacts/module/__tests__/contactsRead.test.ts`, `modules/notes/module/__tests__/notesRead.test.ts`, `modules/projects/module/__tests__/projectsCrud.test.ts`, `modules/telegram/module/__tests__/messagesGetLinks.test.ts`, `docs/vision.md`.
- Temp root: `.tmp/code-production/entity-docs/D2-S1` (must be absent at handoff).
- Of which verification: 25 active min / 0 credits.

Consume the app's new contract from catalog baseline 6a9e8d5ae744b1e2b1d06823562c87e002396258. Regenerating the existing host-stub tree is the only generated directory write; all module changes follow actual SDK/field consumers.

Acceptance: KG-02 through KG-05 and KG-15 on the plugin boundary. Commit: refactor(catalog): consume graph domain values and flat extras.

##### Tasks

- [x] KG_CATALOG_001 — Plugin GraphService uses the host's Entity and EntityRead contracts. (50 min) — 8c16a0682f4f664c8079bd0260e22e884061d32e
<!-- plan:task-meta:{"writes":["packages/plugin-sdk/contract/module.ts","packages/plugin-sdk/index.ts","packages/plugin-sdk/__tests__/graphContract.test.ts","packages/plugin-sdk/__tests__/reachedEndpoints.test.ts","packages/testkit/module.ts","packages/testkit/__tests__/module.test.ts","packages/host-stubs/types/","packages/host-stubs/package.json"],"predictedActiveMinutes":50,"predictedCredits":0,"how":"1. Use the exact SDK artifact and host declarations produced by D1-S7; regenerate the existing host-stub tree with the existing generator. 2. Reproduce bare versus extras reads in graphContract.test.ts and ensure the testkit models both projections and strict required values. 3. Extend existing GraphService methods and wrappers rather than introducing a second Entity interface. Preserve caller scope, missing-result behavior, paging and source-admission APIs.","red":"bun run agent:test:backend -- packages/plugin-sdk/__tests__/graphContract.test.ts packages/plugin-sdk/__tests__/reachedEndpoints.test.ts packages/testkit/__tests__/module.test.ts"} -->
- [x] KG_CATALOG_002 — Module ingestion preserves graph state while UI readers explicitly request extras. (70 min) — 8c16a0682f4f664c8079bd0260e22e884061d32e
<!-- plan:task-meta:{"writes":["modules/addressbook/module/__tests__/addressbookIngest.test.ts","modules/contacts/module/__tests__/socialTracking.test.ts","modules/contacts/module/helpers.ts","modules/contacts/module/service.ts","modules/contacts/types.ts","modules/email/entities.test.ts","modules/email/module/__tests__/emailControl.test.ts","modules/email/module/__tests__/emailIngest.test.ts","modules/email/module/__tests__/emailRead.test.ts","modules/email/module/service.ts","modules/email/schema.ts","modules/email/types.ts","modules/meetings/module/__tests__/meetingsSync.test.ts","modules/notes/module/service.ts","modules/notes/types.ts","modules/projects/module/helpers.ts","modules/projects/types.ts","modules/telegram/entities.test.ts","modules/telegram/module/__tests__/sendMessageDelivery.test.ts","modules/telegram/module/__tests__/syncPlan.test.ts","modules/telegram/module/__tests__/telegramCommand.test.ts","modules/telegram/module/__tests__/telegramIngest.test.ts","modules/telegram/module/__tests__/telegramRead.test.ts","modules/telegram/module/service.ts","modules/telegram/types.ts","modules/x/entities.test.ts","modules/x/module/__tests__/xIngest.test.ts","modules/x/module/service.ts","packages/plugin-sdk/__tests__/graphContract.test.ts","packages/plugin-sdk/__tests__/reachedEndpoints.test.ts","packages/plugin-sdk/contract/module.ts","packages/testkit/module.ts","modules/addressbook/manifest.toml","modules/companies/manifest.toml","modules/contacts/manifest.toml","modules/email/manifest.toml","modules/file/manifest.toml","modules/linkedin/manifest.toml","modules/meetings/manifest.toml","modules/notes/manifest.toml","modules/projects/manifest.toml","modules/telegram/manifest.toml","modules/triggers/manifest.toml","modules/x/manifest.toml"],"predictedActiveMinutes":70,"predictedCredits":0,"how":"1. Migrate the identified Contacts/Email/Telegram/Notes/Projects/X callers and source-ingest fixtures through the new SDK. 2. Keep sync creation declarations explicit and preserve saved choices on rediscovery. Do not add preferences, owner or index status to Source domain writes. 3. Set module API versions to the exact version selected in D1-S7; Source protocol versions change only if their own contract requires it. Preserve existing notifications until the later Trigger story. 4. Run the compiler after each owning declaration change and enumerate additional caller paths through planctl before editing.","red":"bun run agent:test:backend -- modules/email/module/__tests__/emailIngest.test.ts modules/telegram/module/__tests__/syncPlan.test.ts modules/contacts/module/__tests__/socialTracking.test.ts"} -->
- [x] KG_CATALOG_003 — Cards keep pin order, archive and sync behavior without duplicate flags. (45 min) — 8c16a0682f4f664c8079bd0260e22e884061d32e
<!-- plan:task-meta:{"writes":["modules/contacts/ui/ContactOverview.tsx","modules/contacts/ui/SyncToolCallRenderer.tsx","modules/contacts/ui/__tests__/ContactInfoColumn.test.tsx","modules/contacts/ui/index.tsx","modules/email/ui/EmailDetailPanel.tsx","modules/email/ui/__tests__/EmailDetailPanel.test.tsx","modules/email/ui/index.tsx","modules/telegram/ui/TelegramChatItemContent.tsx","modules/telegram/ui/TelegramChatView.tsx","modules/telegram/ui/TelegramDetailWrapper.tsx","modules/telegram/ui/__tests__/TelegramChatTheme.test.tsx","modules/telegram/ui/__tests__/chatHeaderTotal.test.tsx","modules/telegram/ui/hooks/useTelegramChatList.ts","modules/telegram/ui/index.tsx","modules/telegram/ui/types.ts"],"predictedActiveMinutes":45,"predictedCredits":0,"how":"1. Use flat extras at the UI boundary and keep domain Entity values for content/identity logic. 2. Cover zero pin order and stopped sync in existing detail/card/list tests; no truthiness test for pinOrder and no parser default for missing response fields. 3. Keep Trigger lists and history as separate reads; do not add trigger IDs to extras.","red":"bun run agent:test:frontend -- modules/email/ui/__tests__/EmailDetailPanel.test.tsx modules/telegram/ui/__tests__/chatHeaderTotal.test.tsx modules/contacts/ui/__tests__/ContactInfoColumn.test.tsx"} -->

##### Acceptance criteria

- [x] `bun run agent:typecheck` exits 0 — 8c16a0682f4f664c8079bd0260e22e884061d32e
- [x] `bun run agent:test:backend -- packages/plugin-sdk/__tests__/graphContract.test.ts modules/email/module/__tests__/emailIngest.test.ts modules/telegram/module/__tests__/syncPlan.test.ts` exits 0 — 8c16a0682f4f664c8079bd0260e22e884061d32e
- [x] `bun run agent:test:frontend -- modules/email/ui/__tests__/EmailDetailPanel.test.tsx modules/telegram/ui/__tests__/chatHeaderTotal.test.tsx modules/contacts/ui/__tests__/ContactInfoColumn.test.tsx` exits 0 — 8c16a0682f4f664c8079bd0260e22e884061d32e
- [x] Commit — 8c16a0682f4f664c8079bd0260e22e884061d32e

##### Results

<!-- plan:results:D2-S1:start -->
| Task | Commit | UTC start-end | Active / elapsed | Usage | Result / proof |
|---|---|---|---:|---|---|
| KG_CATALOG_001 | 8c16a0682f4f664c8079bd0260e22e884061d32e | 2026-10-07T15:20:04.800Z–2026-10-07T20:23:33.537Z | 303.47895 / 303.47895 min | unavailable: not measured by planctl | Catalog API 0.3 uses canonical domain/explicit-extras reads and strict UUID fixtures; cards preserve pin order zero/archive/sync. Telegram messages and attachments share syncEnabled; duplicate indexing RPC/UI removed. Hook typecheck/lint and 277 backend plus 19 UI tests pass. — beyond writes: docs/vision.md, modules/addressbook/entities.test.ts, modules/addressbook/module/service.ts, modules/contacts/module/__tests__/contactsRead.test.ts, modules/contacts/module/__tests__/contactsWrite.test.ts, modules/contacts/ui/ContactMergeAction.tsx, modules/contacts/ui/__tests__/ContactMergeAction.test.tsx, modules/contacts/ui/__tests__/ContactMergeResolution.test.tsx, modules/email/module/helpers.ts, modules/linkedin/module/__tests__/linkedinIngest.test.ts, modules/linkedin/module/service.ts, modules/meetings/entities.test.ts, modules/meetings/module/__tests__/meetingsRead.test.ts, modules/notes/module/__tests__/notesRead.test.ts, modules/projects/module/__tests__/projectsChecklist.test.ts, modules/projects/module/__tests__/projectsCrud.test.ts, modules/projects/module/__tests__/projectsRead.test.ts, modules/projects/module/service.ts, modules/projects/ui/mutations.ts, modules/telegram/module/__tests__/chatBatchSnapshotMerge.test.ts, modules/telegram/module/__tests__/mediaSourceRouting.test.ts, modules/telegram/module/__tests__/messagesGetLinks.test.ts, modules/triggers/module/__tests__/triggersWrite.test.ts, tsconfig.base.json, vitest.config.ts, vitest.ui.config.ts |
| KG_CATALOG_002 | 8c16a0682f4f664c8079bd0260e22e884061d32e | 2026-10-07T15:20:04.800Z–2026-10-07T20:23:33.537Z | 303.47895 / 303.47895 min | unavailable: not measured by planctl | Catalog API 0.3 uses canonical domain/explicit-extras reads and strict UUID fixtures; cards preserve pin order zero/archive/sync. Telegram messages and attachments share syncEnabled; duplicate indexing RPC/UI removed. Hook typecheck/lint and 277 backend plus 19 UI tests pass. — beyond writes: docs/vision.md, modules/addressbook/entities.test.ts, modules/addressbook/module/service.ts, modules/contacts/module/__tests__/contactsRead.test.ts, modules/contacts/module/__tests__/contactsWrite.test.ts, modules/contacts/ui/ContactMergeAction.tsx, modules/contacts/ui/__tests__/ContactMergeAction.test.tsx, modules/contacts/ui/__tests__/ContactMergeResolution.test.tsx, modules/email/module/helpers.ts, modules/linkedin/module/__tests__/linkedinIngest.test.ts, modules/linkedin/module/service.ts, modules/meetings/entities.test.ts, modules/meetings/module/__tests__/meetingsRead.test.ts, modules/notes/module/__tests__/notesRead.test.ts, modules/projects/module/__tests__/projectsChecklist.test.ts, modules/projects/module/__tests__/projectsCrud.test.ts, modules/projects/module/__tests__/projectsRead.test.ts, modules/projects/module/service.ts, modules/projects/ui/mutations.ts, modules/telegram/module/__tests__/chatBatchSnapshotMerge.test.ts, modules/telegram/module/__tests__/mediaSourceRouting.test.ts, modules/telegram/module/__tests__/messagesGetLinks.test.ts, modules/triggers/module/__tests__/triggersWrite.test.ts, tsconfig.base.json, vitest.config.ts, vitest.ui.config.ts |
| KG_CATALOG_003 | 8c16a0682f4f664c8079bd0260e22e884061d32e | 2026-10-07T15:20:04.800Z–2026-10-07T20:23:33.537Z | 303.47895 / 303.47895 min | unavailable: not measured by planctl | Catalog API 0.3 uses canonical domain/explicit-extras reads and strict UUID fixtures; cards preserve pin order zero/archive/sync. Telegram messages and attachments share syncEnabled; duplicate indexing RPC/UI removed. Hook typecheck/lint and 277 backend plus 19 UI tests pass. — beyond writes: docs/vision.md, modules/addressbook/entities.test.ts, modules/addressbook/module/service.ts, modules/contacts/module/__tests__/contactsRead.test.ts, modules/contacts/module/__tests__/contactsWrite.test.ts, modules/contacts/ui/ContactMergeAction.tsx, modules/contacts/ui/__tests__/ContactMergeAction.test.tsx, modules/contacts/ui/__tests__/ContactMergeResolution.test.tsx, modules/email/module/helpers.ts, modules/linkedin/module/__tests__/linkedinIngest.test.ts, modules/linkedin/module/service.ts, modules/meetings/entities.test.ts, modules/meetings/module/__tests__/meetingsRead.test.ts, modules/notes/module/__tests__/notesRead.test.ts, modules/projects/module/__tests__/projectsChecklist.test.ts, modules/projects/module/__tests__/projectsCrud.test.ts, modules/projects/module/__tests__/projectsRead.test.ts, modules/projects/module/service.ts, modules/projects/ui/mutations.ts, modules/telegram/module/__tests__/chatBatchSnapshotMerge.test.ts, modules/telegram/module/__tests__/mediaSourceRouting.test.ts, modules/telegram/module/__tests__/messagesGetLinks.test.ts, modules/triggers/module/__tests__/triggersWrite.test.ts, tsconfig.base.json, vitest.config.ts, vitest.ui.config.ts |
<!-- plan:results:D2-S1:end -->
<!-- plan:stage:D2-S1:end -->

<!-- plan:stage:D2-S2:start -->
<!-- plan:stage-meta:{"deliveryId":"D2","depends":["D2-S1"],"parallelWith":[],"writes":["modules/triggers/manifest.toml","modules/triggers/schema.ts","modules/triggers/module/service.ts","modules/triggers/module/__tests__/triggersRead.test.ts","modules/triggers/module/__tests__/triggersWrite.test.ts","modules/triggers/module/__tests__/triggersSchedule.test.ts","modules/triggers/ui/TriggerDetailPanel.tsx","modules/triggers/ui/useTriggerDetail.ts","modules/triggers/ui/__tests__/triggerHistory.test.tsx","modules/projects/manifest.toml","modules/projects/schema.ts","modules/projects/module/service.ts","modules/projects/module/__tests__/projectsCrud.test.ts","modules/projects/module/__tests__/projectsRead.test.ts","modules/meetings/manifest.toml","modules/meetings/schema.ts","modules/meetings/entities.ts","modules/meetings/types.ts","modules/meetings/module/service.ts","modules/meetings/module/helpers.ts","modules/meetings/ui/EntityCards.tsx","modules/meetings/module/__tests__/meetingsCreate.test.ts","modules/meetings/module/__tests__/meetingsRead.test.ts","modules/telegram/manifest.toml","modules/telegram/schema.ts","modules/telegram/entities.ts","modules/telegram/types.ts","modules/telegram/module/service.ts","modules/telegram/module/helpers.ts","modules/telegram/module/__tests__/telegramIngest.test.ts","modules/telegram/module/__tests__/telegramRead.test.ts","modules/telegram/module/__tests__/syncPlan.test.ts","modules/email/manifest.toml","modules/email/schema.ts","modules/email/entities.ts","modules/email/types.ts","modules/email/module/service.ts","modules/email/module/helpers.ts","modules/email/ui/helpers.ts","modules/email/ui/EntityCards.tsx","modules/email/module/__tests__/emailIngest.test.ts","modules/email/module/__tests__/emailRead.test.ts","modules/email/module/__tests__/emailSend.test.ts","modules/telegram/module/__tests__/chatBatchSnapshotMerge.test.ts","modules/meetings/ui/__tests__/MeetingCardExpand.test.tsx","modules/meetings/module/__tests__/meetingsSync.test.ts"],"tempRoot":".tmp/code-production/entity-docs/D2-S2","predictedActiveMinutes":140,"predictedCredits":0,"verifyActiveMinutes":20,"verifyCredits":0} -->
#### Stage D2-S2 — Declare module kinds and preserve their existing meaning

- Owner: Codex; Profile: strong; Depends: D2-S1; Parallel with: none.
- Writes: `modules/triggers/manifest.toml`, `modules/triggers/schema.ts`, `modules/triggers/module/service.ts`, `modules/triggers/module/__tests__/triggersRead.test.ts`, `modules/triggers/module/__tests__/triggersWrite.test.ts`, `modules/triggers/module/__tests__/triggersSchedule.test.ts`, `modules/triggers/ui/TriggerDetailPanel.tsx`, `modules/triggers/ui/useTriggerDetail.ts`, `modules/triggers/ui/__tests__/triggerHistory.test.tsx`, `modules/projects/manifest.toml`, `modules/projects/schema.ts`, `modules/projects/module/service.ts`, `modules/projects/module/__tests__/projectsCrud.test.ts`, `modules/projects/module/__tests__/projectsRead.test.ts`, `modules/meetings/manifest.toml`, `modules/meetings/schema.ts`, `modules/meetings/entities.ts`, `modules/meetings/types.ts`, `modules/meetings/module/service.ts`, `modules/meetings/module/helpers.ts`, `modules/meetings/ui/EntityCards.tsx`, `modules/meetings/module/__tests__/meetingsCreate.test.ts`, `modules/meetings/module/__tests__/meetingsRead.test.ts`, `modules/telegram/manifest.toml`, `modules/telegram/schema.ts`, `modules/telegram/entities.ts`, `modules/telegram/types.ts`, `modules/telegram/module/service.ts`, `modules/telegram/module/helpers.ts`, `modules/telegram/module/__tests__/telegramIngest.test.ts`, `modules/telegram/module/__tests__/telegramRead.test.ts`, `modules/telegram/module/__tests__/syncPlan.test.ts`, `modules/email/manifest.toml`, `modules/email/schema.ts`, `modules/email/entities.ts`, `modules/email/types.ts`, `modules/email/module/service.ts`, `modules/email/module/helpers.ts`, `modules/email/ui/helpers.ts`, `modules/email/ui/EntityCards.tsx`, `modules/email/module/__tests__/emailIngest.test.ts`, `modules/email/module/__tests__/emailRead.test.ts`, `modules/email/module/__tests__/emailSend.test.ts`, `modules/telegram/module/__tests__/chatBatchSnapshotMerge.test.ts`, `modules/meetings/ui/__tests__/MeetingCardExpand.test.tsx`, `modules/meetings/module/__tests__/meetingsSync.test.ts`.
- Temp root: `.tmp/code-production/entity-docs/D2-S2` (must be absent at handoff).
- Of which verification: 20 active min / 0 credits.

Coordinate module declarations, writers and readers with D1-S4. The current baseline's sent_from spelling is a sender fact; its target meaning is the already-approved received_from, not a new inverse kind.

Acceptance: KG-06, KG-19, KG-20, KG-28, KG-29 and KG-30. Commit: refactor(catalog): declare shared and domain link kinds.

##### Tasks

- [x] KG_CATALOG_LINKS_001 — Triggers and projects share membership while meeting and Telegram kinds remain module-owned. (75 min) — 5c369ddb69fd30ddf344950b285ca9ea183243cc
<!-- plan:task-meta:{"writes":["modules/triggers/manifest.toml","modules/triggers/schema.ts","modules/triggers/module/service.ts","modules/triggers/module/__tests__/triggersRead.test.ts","modules/triggers/module/__tests__/triggersWrite.test.ts","modules/triggers/module/__tests__/triggersSchedule.test.ts","modules/triggers/ui/TriggerDetailPanel.tsx","modules/triggers/ui/useTriggerDetail.ts","modules/triggers/ui/__tests__/triggerHistory.test.tsx","modules/projects/manifest.toml","modules/projects/schema.ts","modules/projects/module/service.ts","modules/projects/module/__tests__/projectsCrud.test.ts","modules/projects/module/__tests__/projectsRead.test.ts","modules/meetings/manifest.toml","modules/meetings/schema.ts","modules/meetings/entities.ts","modules/meetings/types.ts","modules/meetings/module/service.ts","modules/meetings/module/helpers.ts","modules/meetings/ui/EntityCards.tsx","modules/meetings/module/__tests__/meetingsCreate.test.ts","modules/meetings/module/__tests__/meetingsRead.test.ts","modules/telegram/manifest.toml","modules/telegram/schema.ts","modules/telegram/entities.ts","modules/telegram/types.ts","modules/telegram/module/service.ts","modules/telegram/module/helpers.ts","modules/telegram/module/__tests__/telegramIngest.test.ts","modules/telegram/module/__tests__/telegramRead.test.ts","modules/telegram/module/__tests__/syncPlan.test.ts"],"predictedActiveMinutes":75,"predictedCredits":0,"how":"1. Reproduce membership/creation and module-owned-kind cases against the migrated host registry. 2. Declare explicit endpoint contracts and write permissions; migrate Trigger/Project membership without reversal and use correct incoming/outgoing created provenance. 3. Use meetings.attendee and Telegram qualified observation kinds while retaining participant/access distinctions, sync metadata and historical periods. 4. Keep scheduler/manual triggers and current sender/chat watch selection working. Preserve historical in_chat as context until D1-S8 resolves its communication mapping.","red":"bun run agent:test:backend -- modules/triggers/module/__tests__/triggersRead.test.ts modules/triggers/module/__tests__/triggersWrite.test.ts modules/projects/module/__tests__/projectsCrud.test.ts modules/meetings/module/__tests__/meetingsRead.test.ts modules/telegram/module/__tests__/telegramRead.test.ts"} -->
- [x] KG_CATALOG_LINKS_002 — Email sender facts use received_from without inventing delivery or authorship. (45 min) — 5c369ddb69fd30ddf344950b285ca9ea183243cc
<!-- plan:task-meta:{"writes":["modules/email/manifest.toml","modules/email/schema.ts","modules/email/entities.ts","modules/email/types.ts","modules/email/module/service.ts","modules/email/module/helpers.ts","modules/email/ui/helpers.ts","modules/email/ui/EntityCards.tsx","modules/email/module/__tests__/emailIngest.test.ts","modules/email/module/__tests__/emailRead.test.ts","modules/email/module/__tests__/emailSend.test.ts"],"predictedActiveMinutes":45,"predictedCredits":0,"how":"1. Reproduce KG-29 from an email From header with no observed sending account. 2. Replace the current sent_from writer/readers with received_from and declare its endpoint permissions. Coordinate legacy authored_by/sent_from data conversion with D1-S4. 3. Retain sent_to recipient semantics and general authored_by for actual authorship. Do not create a sent or received fact from headers alone or rename unrelated modules' rows.","red":"bun run agent:test:backend -- modules/email/module/__tests__/emailIngest.test.ts modules/email/module/__tests__/emailRead.test.ts modules/email/module/__tests__/emailSend.test.ts"} -->

##### Acceptance criteria

- [x] `bun run agent:test:backend -- modules/triggers/module/__tests__/triggersRead.test.ts modules/triggers/module/__tests__/triggersSchedule.test.ts modules/projects/module/__tests__/projectsCrud.test.ts modules/meetings/module/__tests__/meetingsRead.test.ts modules/telegram/module/__tests__/syncPlan.test.ts modules/email/module/__tests__/emailIngest.test.ts` exits 0 — 5c369ddb69fd30ddf344950b285ca9ea183243cc
- [x] Commit — 5c369ddb69fd30ddf344950b285ca9ea183243cc

##### Results

<!-- plan:results:D2-S2:start -->
| Task | Commit | UTC start-end | Active / elapsed | Usage | Result / proof |
|---|---|---|---:|---|---|
| KG_CATALOG_LINKS_001 | 5c369ddb69fd30ddf344950b285ca9ea183243cc | 2026-10-07T20:26:06.801Z–2026-10-08T07:32:34.011Z | 666.4535 / 666.4535 min | unavailable: not measured by planctl | Modules declare qualified observation/attendee endpoints and explicit shared-kind permissions; Trigger/Project membership uses belongs_to, Email sender facts use received_from. Trigger details ignore Project/ended memberships and reject multiple active Episode parents. RED to GREEN; 139 backend and 6 UI hook tests, scoped typechecks/lint and five module builds pass. — beyond writes: modules/meetings/module/__tests__/meetingsSync.test.ts, modules/meetings/ui/__tests__/MeetingCardExpand.test.tsx, modules/telegram/module/__tests__/chatBatchSnapshotMerge.test.ts |
| KG_CATALOG_LINKS_002 | 5c369ddb69fd30ddf344950b285ca9ea183243cc | 2026-10-07T20:26:06.801Z–2026-10-08T07:32:34.011Z | 666.4535 / 666.4535 min | unavailable: not measured by planctl | Modules declare qualified observation/attendee endpoints and explicit shared-kind permissions; Trigger/Project membership uses belongs_to, Email sender facts use received_from. Trigger details ignore Project/ended memberships and reject multiple active Episode parents. RED to GREEN; 139 backend and 6 UI hook tests, scoped typechecks/lint and five module builds pass. — beyond writes: modules/meetings/module/__tests__/meetingsSync.test.ts, modules/meetings/ui/__tests__/MeetingCardExpand.test.tsx, modules/telegram/module/__tests__/chatBatchSnapshotMerge.test.ts |
<!-- plan:results:D2-S2:end -->
<!-- plan:stage:D2-S2:end -->

<!-- plan:stage:D2-S3:start -->
<!-- plan:stage-meta:{"deliveryId":"D2","depends":["D1-S8"],"parallelWith":[],"writes":["modules/email/entities.ts","modules/email/types.ts","modules/email/manifest.toml","modules/email/module/service.ts","modules/email/module/helpers.ts","modules/email/ui/helpers.ts","modules/email/ui/EntityCards.tsx","modules/email/module/__tests__/emailIngest.test.ts","modules/email/module/__tests__/emailSend.test.ts","modules/telegram/entities.ts","modules/telegram/types.ts","modules/telegram/manifest.toml","modules/telegram/module/service.ts","modules/telegram/module/helpers.ts","modules/telegram/module/__tests__/telegramIngest.test.ts","modules/telegram/module/__tests__/sendMessageDelivery.test.ts","sources/google/src/surfaces/email/gmail.ts","sources/google/src/surfaces/email/gmail.test.ts","sources/google/src/surfaces/email/imap.ts","sources/google/src/surfaces/email/imap.test.ts","sources/telegram/src/surfaces/telegram/envelope.ts","sources/telegram/src/surfaces/telegram/envelope.test.ts","packages/host-stubs/types/","docs/vision.md","packages/plugin-sdk/__tests__/graphContract.test.ts","modules/telegram/module/__tests__/mediaSourceRouting.test.ts","modules/telegram/module/__tests__/telegramCommand.test.ts","vitest.config.ts","vitest.ui.config.ts"],"tempRoot":".tmp/code-production/entity-docs/D2-S3","predictedActiveMinutes":140,"predictedCredits":0,"verifyActiveMinutes":20,"verifyCredits":0} -->
#### Stage D2-S3 — Persist communication observations atomically

- Owner: Codex; Profile: strong; Depends: D1-S8; Parallel with: none.
- Writes: `modules/email/entities.ts`, `modules/email/types.ts`, `modules/email/manifest.toml`, `modules/email/module/service.ts`, `modules/email/module/helpers.ts`, `modules/email/ui/helpers.ts`, `modules/email/ui/EntityCards.tsx`, `modules/email/module/__tests__/emailIngest.test.ts`, `modules/email/module/__tests__/emailSend.test.ts`, `modules/telegram/entities.ts`, `modules/telegram/types.ts`, `modules/telegram/manifest.toml`, `modules/telegram/module/service.ts`, `modules/telegram/module/helpers.ts`, `modules/telegram/module/__tests__/telegramIngest.test.ts`, `modules/telegram/module/__tests__/sendMessageDelivery.test.ts`, `sources/google/src/surfaces/email/gmail.ts`, `sources/google/src/surfaces/email/gmail.test.ts`, `sources/google/src/surfaces/email/imap.ts`, `sources/google/src/surfaces/email/imap.test.ts`, `sources/telegram/src/surfaces/telegram/envelope.ts`, `sources/telegram/src/surfaces/telegram/envelope.test.ts`, `packages/host-stubs/types/`, `docs/vision.md`, `packages/plugin-sdk/__tests__/graphContract.test.ts`, `modules/telegram/module/__tests__/mediaSourceRouting.test.ts`, `modules/telegram/module/__tests__/telegramCommand.test.ts`, `vitest.config.ts`, `vitest.ui.config.ts`.
- Temp root: `.tmp/code-production/entity-docs/D2-S3` (must be absent at handoff).
- Of which verification: 20 active min / 0 credits.

Produce the approved communication facts using existing Source envelopes and module Graph batches. App validation and concrete endpoint schemas precede these writers; no new event engine is included.

Acceptance: KG-21, KG-28 and KG-29. Commit: feat(catalog): record observed message communication.

##### Tasks

- [ ] KG_COMM_002 — Confirmed incoming and outgoing observations create message and communication Links together. (85 min)
<!-- plan:task-meta:{"writes":["modules/email/entities.ts","modules/email/types.ts","modules/email/manifest.toml","modules/email/module/service.ts","modules/email/module/helpers.ts","modules/email/ui/helpers.ts","modules/email/ui/EntityCards.tsx","modules/email/module/__tests__/emailIngest.test.ts","modules/email/module/__tests__/emailSend.test.ts","modules/telegram/entities.ts","modules/telegram/types.ts","modules/telegram/manifest.toml","modules/telegram/module/service.ts","modules/telegram/module/helpers.ts","modules/telegram/module/__tests__/telegramIngest.test.ts","modules/telegram/module/__tests__/sendMessageDelivery.test.ts"],"predictedActiveMinutes":85,"predictedCredits":0,"how":"1. Use only the endpoint/conversation/occurrence contract approved in D1-S8. Declare any added exact schema/type paths before writes. 2. Reproduce confirmed receipt, successful send, failed send, header-only metadata, no-change replay and rollback in existing ingest/source tests. 3. Commit the message and supported sent/received fact in one Graph batch; retain source occurrence time independently of insertion time and preserve unknown times. 4. Keep sent_to/received_from separate from observed delivery. Retain existing live Trigger notifications with unchanged sender/chat semantics until the later logic story.","red":"bun run agent:test:backend -- modules/email/module/__tests__/emailIngest.test.ts modules/email/module/__tests__/emailSend.test.ts modules/telegram/module/__tests__/telegramIngest.test.ts"} -->
- [ ] KG_COMM_003 — Source adapters preserve delivery evidence and unknown timestamps. (35 min)
<!-- plan:task-meta:{"writes":["sources/google/src/surfaces/email/gmail.ts","sources/google/src/surfaces/email/gmail.test.ts","sources/google/src/surfaces/email/imap.ts","sources/google/src/surfaces/email/imap.test.ts","sources/telegram/src/surfaces/telegram/envelope.ts","sources/telegram/src/surfaces/telegram/envelope.test.ts"],"predictedActiveMinutes":35,"predictedCredits":0,"how":"1. Use the existing Source fixtures to verify which timestamps and observing accounts are actually supplied. 2. Do not turn Date headers, recipient lists or a shared chat membership into proof of receipt; preserve provenance needed by the module's approved observation contract. 3. Run Bun Source targets separately from Vitest module targets through the existing agent:test:backend adapter.","red":"bun run agent:test:backend -- sources/google/src/surfaces/email/gmail.test.ts sources/google/src/surfaces/email/imap.test.ts sources/telegram/src/surfaces/telegram/envelope.test.ts"} -->

##### Acceptance criteria

- [ ] `bun run agent:test:backend -- modules/email/module/__tests__/emailIngest.test.ts modules/email/module/__tests__/emailSend.test.ts modules/telegram/module/__tests__/telegramIngest.test.ts` exits 0
- [ ] `bun run agent:test:backend -- sources/google/src/surfaces/email/gmail.test.ts sources/google/src/surfaces/email/imap.test.ts sources/telegram/src/surfaces/telegram/envelope.test.ts` exits 0
- [ ] Commit

##### Results

<!-- plan:results:D2-S3:start -->
| Task | Commit | UTC start-end | Active / elapsed | Usage | Result / proof |
|---|---|---|---:|---|---|
<!-- plan:results:D2-S3:end -->
<!-- plan:stage:D2-S3:end -->

<!-- plan:stage:D2-S4:start -->
<!-- plan:stage-meta:{"deliveryId":"D2","depends":["D2-S3"],"parallelWith":[],"writes":["packages/plugin-sdk/__tests__/graphContract.test.ts","packages/host-stubs/types/","packages/host-stubs/package.json","packages/testkit/module.ts","packages/testkit/__tests__/module.test.ts","scripts/module-bundle.test.ts","scripts/build-catalog-index.test.ts","scripts/build-catalog-index.ts","docs/vision.md","docs/typing.md","README.md"],"tempRoot":".tmp/code-production/entity-docs/D2-S4","predictedActiveMinutes":65,"predictedCredits":0,"verifyActiveMinutes":25,"verifyCredits":0} -->
#### Stage D2-S4 — Build and verify the matching catalog artifacts

- Owner: Codex; Profile: strong; Depends: D2-S3; Parallel with: none.
- Writes: `packages/plugin-sdk/__tests__/graphContract.test.ts`, `packages/host-stubs/types/`, `packages/host-stubs/package.json`, `packages/testkit/module.ts`, `packages/testkit/__tests__/module.test.ts`, `scripts/module-bundle.test.ts`, `scripts/build-catalog-index.test.ts`, `scripts/build-catalog-index.ts`, `docs/vision.md`, `docs/typing.md`, `README.md`.
- Temp root: `.tmp/code-production/entity-docs/D2-S4` (must be absent at handoff).
- Of which verification: 25 active min / 0 credits.

Verify and build the catalog artifact that the app's final integration gate consumes. Existing tests cover contract behavior; generated declarations and reference corrections remain in the established files.

Acceptance: catalog portions of KG-02 through KG-06, KG-15 and KG-19 through KG-31. Commit: test(catalog): verify knowledge graph compatibility.

Required handoff evidence: Matching catalog/SDK artifact digests recorded; no unapproved release.

##### Tasks

- [ ] KG_RELEASE_001 — The built catalog accepts the new graph contract and retains domain behavior. (40 min)
<!-- plan:task-meta:{"writes":["packages/plugin-sdk/__tests__/graphContract.test.ts","packages/host-stubs/types/","packages/host-stubs/package.json","packages/testkit/module.ts","packages/testkit/__tests__/module.test.ts","scripts/module-bundle.test.ts","scripts/build-catalog-index.test.ts","scripts/build-catalog-index.ts","docs/vision.md","docs/typing.md","README.md"],"predictedActiveMinutes":40,"predictedCredits":0,"how":"1. Build the catalog against D1's exact SDK and regenerate declarations only if their inputs changed. 2. Run the complete catalog agent:verify:pr once on these final inputs. Check incompatible activation and preserve the previously accepted version using the app scenarios in D1-S9. 3. Reconcile the reference with actual merged implementations and keep the event/subscription/action transition documented as the next logic story. Do not mark deferred ending events, Trigger dispatch or ownership transfer implemented. 4. Record artifact digests and all Goal/acceptance-case coverage in the plan results. Do not deploy or publish a channel before the separate release authorization.","red":"bun run agent:test:backend -- packages/plugin-sdk/__tests__/graphContract.test.ts packages/testkit/__tests__/module.test.ts"} -->

##### Acceptance criteria

- [ ] `bun run agent:verify:pr` exits 0
- [ ] `bun run agent:verify:docs` exits 0
- [ ] Commit

##### Results

<!-- plan:results:D2-S4:start -->
| Task | Commit | UTC start-end | Active / elapsed | Usage | Result / proof |
|---|---|---|---:|---|---|
<!-- plan:results:D2-S4:end -->
<!-- plan:stage:D2-S4:end -->
<!-- plan:delivery:D2:end -->
<!-- plan:implementation:end -->

<!-- plan:execution:start -->
## Execution log

- lock-spec sha256:eb8320ff041bbeaabddb325576ce9ddfc2d7f0bb4d3dbf27f4053f1558a352a5 owner:SPEC is approved, lets plan

- approve sha256:f307b8b036aacffb4ad979a4325946abc00e1e5d9c93d87d30cf6e062a32fe42 owner:$blueprint-start

- amend implementation owner:$blueprint-start sha256:693ad60ebc7a908f9ca8b88c19f7e04d5d469f57afcd4e1e75cd9f635ee0406e

- amend implementation owner:$blueprint-start sha256:f2d4c1c69a777d054dfc5e85e7dcd692b4f7da123a8d51652110dbf85313279f

- amend implementation owner:$blueprint-start sha256:78dd5cdeb9888199c1d3cfbcf23c83d8a74eadb46e391fd04abee847bb709216

- amend implementation owner:$blueprint-start sha256:3b4380faaf89bd4b3c2349bb9655e7c7288edbb668c0650096f5d4b36b560bb3

- amend implementation owner:$blueprint-start sha256:5c07fdc16b8f6069617ef95fbecc08af657fd46254e4d29f1b135464ce8c0f75

- amend implementation owner:$blueprint-start sha256:f7a6910967746b397bd2429ce203528eb4eaada37ee8f483f29c7c35d1994300

- amend implementation owner:$blueprint-start sha256:b97cd3864372f73f6af89cf77a39523c7e28264fe69ea4640c2db80724dca871

- amend implementation owner:$blueprint-start sha256:830120cbd48b37c4ee983ff01c22ee7910d4a15066350b3e4e52248f80b10140

- amend spec owner:$blueprint-start sha256:16cf38057e3b7f6c379b99eb069bf1e67b40dc2047501fe7ee4584b1bc4fb0ce

- record-result D1-S1 commit:1d617022fd9b68c39498fefb54dfd1367ca21f3f

- close D1-S1 closed commit:1d617022fd9b68c39498fefb54dfd1367ca21f3f

- amend implementation owner:$blueprint-start sha256:bba66565bcd1ec77473a81bff66a027d77eeb5dc40eba991826d6752f0baa7ad

- record-result D1-S1 commit:37a6e37b4296e3157d77e3abbc77af59eede2bc4

- close D1-S1 closed commit:37a6e37b4296e3157d77e3abbc77af59eede2bc4

- amend implementation owner:$blueprint-start sha256:24b55a42c5f9df97d58d55e662c6f574fe2584002c482019259dc052ab8f7b3a

- record-result D1-S1 commit:dbf1f237650f8ef8cb85d815c25a7239ec2a54df

- close D1-S1 closed commit:dbf1f237650f8ef8cb85d815c25a7239ec2a54df

- amend implementation owner:$blueprint-start sha256:2f519cfbfe8626ab96c810d5118a1df5d7fac0b3dde78e98ed8e700cd7555870

- amend implementation owner:$blueprint-start sha256:e0309381d55507f10eec11da6b31584588e895f18e1c1c234fa878c6e7064a41

- amend implementation owner:$blueprint-start sha256:33abcb383af8f10b151fc58bcacc8ffa830bd4767c2855c2f2a28a7304c89a5d

- amend implementation owner:$blueprint-start sha256:ebd9e6ba088cdb1ab3a4770134b37040597dad9e144723acc0c66700970c1cb2

- amend implementation owner:$blueprint-start sha256:e88585df9a018d6be5c7734d5cc77ce9fcb7cde4eb7cd86bd6f301ae76614c22

- amend implementation owner:$blueprint-start sha256:e1c2b0581a9656fd6548517e6945517a87d32606475437650e30ffa2e6c3da6c

- amend implementation owner:$blueprint-start sha256:f6b9e942fceb652bd272037f722ffc2a25e42c82bc65025c5e6f8750bc04bcec

- amend implementation owner:$blueprint-start sha256:0dd236583cca008978ddb014bdecb82507759c1fa2d4f63a11b8b4f5886bade0

- amend spec owner:$blueprint-start sha256:17b005d2db5850a0a19f1557df70569e76e287a6da130c90f404ad1c18a05857

- amend implementation owner:$blueprint-start sha256:2066e0139d7f3c6ddbbfac804cdcb70518492c0ca1cc5788cb99d1df5139c88c

- amend implementation owner:$blueprint-start sha256:fbe2e995f012795482d54deba83de099d8a6fb840a67b8f44f1dbd184e48634a

- amend implementation owner:$blueprint-start sha256:20401031d6141766b2aef1131f03354424bdd5345e4046a2cf185c38c72d952e

- amend implementation owner:$blueprint-start sha256:3ba014fcfb21729be3c968e31771584c59c68fd8c0a875c1c0a48f0e185d078b

- record-result D1-S2 commit:db2437a7e

- close D1-S2 closed commit:db2437a7e93e1b38163e1f306cc071713c3b5668

- amend implementation owner:$blueprint-start sha256:1106fe92f8600516567af6211910bf44aa779ed45f66d13eacd2a87fab6fdc4a

- amend implementation owner:$blueprint-start sha256:d612ce22f654177dabcf04761dab335bd57f11858d551f8a2c8df468fe38c636

- amend implementation owner:$blueprint-start sha256:c4f7fdb558ef26cdfbef603e3525f0aeaeb11bc7fc4a1d0a73b6cfafcaa9d783

- amend implementation owner:$blueprint-start sha256:2678f354b0b6482c0f5291228f9edb18693b8a84ec3bd3fb6dc3268a5eba1d7f

- amend spec owner:$blueprint-start sha256:0b61eea62923242ab9e4f72c4299d6d5199937aa537846cc4ba50712ad031ed9

- amend spec owner:$blueprint-start sha256:6ee850f1521a654438c32ef596e1415e18648e8ff70723cfce62f750fa9f579f

- amend implementation owner:$blueprint-start sha256:4792aa9c875a59a2f355d52b9f511bcac3c6c9bedcb796cfb117449876dd10ac

- deviation D1-S3: SDK typecheck, all 67 contract tests and build pass. The additional check:sdk strict naming audit reports 21 existing S1/S2 naming findings (lower-case exported schema helpers, approved NIL_ID, ERROR/error); no registry violations. D1-S7 KG_API_001 already owns scripts/sdk-contract-audit.ts and the final SDK compatibility gate; resolve the findings there before publication. S3 privacy checks do not waive that gate.

- amend implementation owner:$blueprint-start sha256:3c9484863348b0649283504dc403994dcd136c7c66137a7897299a835b728b06

- amend implementation owner:$blueprint-start sha256:b878579a068ba38f942a2a7ddba8ee7201ab72b410fd9122a84f6d135dbf8e28

- record-result D1-S3 commit:a980ef7d6705b59fcc896d54a5b35c58bec51f5d

- close D1-S3 closed commit:a980ef7d6705b59fcc896d54a5b35c58bec51f5d

- amend implementation owner:$blueprint-start sha256:01d6981096edc07af863059422fba37b3c7e435c9ed2d0ec19ea2ed489754ddd

- amend implementation owner:$blueprint-start sha256:6918672d4d4928340e9f1a202369c8c5f601afbb4919dfefc03e7a6d90e0ed38

- amend implementation owner:$blueprint-start sha256:b3c6c1dc40a004b947b6ebfbb31d4e7bf91e3d2ccc3e918a6988f9ae805d3107

- amend spec owner:$blueprint-start sha256:e7ba33d50f2e42d7a82ee9391d485cdd57706bd0622ca190d0cd57f9e004a91e

- amend implementation owner:$blueprint-start sha256:237acdfaac698273c13aac543faf812b58724d5f5bff788612b964e253176623

- amend implementation owner:$blueprint-start sha256:b6e2a925736af204f564a5ae0a43adf07fedccbb2ba8d1c6eb4c87c56512dc28

- amend spec owner:$blueprint-start sha256:073ce109dbc6d732fc7d32b3b5904855f82d932bcf9bb0f20a6884db7ff8a1a6

- amend implementation owner:$blueprint-start sha256:f98b9bcfcf20c11864bcac81ada2fff95e7b4541b1c5c85e46751bad525c2fc2

- amend implementation owner:$blueprint-start sha256:5b3f648273052562df7eec0396d255d11e6ce83a6472317d8d806bdc6f1a32c6

- amend implementation owner:$blueprint-start sha256:86062cd452dd5d5201fc4f9646b3b51a491792c0ceea4895c799e2d79853cf98

- deviation D1-S4: Versioned legacy workspace relation conversion remains assigned to KG_PROCESS_002 (D1-S6 step 3), where the shared codec changes once for kind/origin/pin/private/system ownership together. D1-S4 migrates database links, effective claims and withdrawals; its current v6 transfer path cannot yet import retired relation names. Documented in docs/backend/workspace-transfer.md; publication stays gated on D1-S6 and matching D2 producer migration.

- amend implementation owner:$blueprint-start sha256:d8626d47a6ef18ae86d0beae0ae27428b17df9a03912758bbdee717e4f92c4c9

- deviation D1-S4: Runtime work is in a2874e3a71acf83b505ee979efdb8ee44cbac7d3 (541 backend pass, 1 existing skip; 73 frontend pass). A metadata closure commit follows: Drizzle pull confirmed the migration table and supplied exact constraint names; four reference pages needed re-verification after that work commit moved their anchors. The documentation gate requires ancestor stamps, so amending the original work commit would invalidate those stamps. No additional runtime behavior is introduced by the closure commit.

- record-result D1-S4 commit:d5cce13a15cd5b58b31d63ed075da8073bdc611e

- close D1-S4 closed commit:d5cce13a15cd5b58b31d63ed075da8073bdc611e

- amend implementation owner:$blueprint-start sha256:9854d09b36fd5e7e3d5246d46bfdfd1972e0c96e2bb3c89cea7861cb82c6181e

- amend implementation owner:$blueprint-start sha256:ae9ac55bcd719c4a238fcb61159fc8fed27751df56435f566838f8b011cb9b30

- amend implementation owner:$blueprint-start sha256:fdfff49081bc13a957f02a6ca603ce4d7d1a6483741a9e9100f1516d3777aa0c

- amend implementation owner:$blueprint-start sha256:8a6bef131cf095173e4332292a7a25b6c5a36528dd023db1b8d8665c34d4ce18

- amend implementation owner:$blueprint-start sha256:f255b98ed27a7450e75c54ee8023947aee52b7d8ede49b81e7fa7d274ba86149

- amend implementation owner:$blueprint-start sha256:a460b4d7df0ae05f5a7eb3367d4e6aa82fb6f7ad998574151e92d25b61416ada

- amend implementation owner:$blueprint-start sha256:dddea8c158cca46625f7a0e9de265f60dc080b2b1c2b90f3cdd7212212b53655

- amend implementation owner:$blueprint-start sha256:818296c6219a4b6c50cd8710ddfa07c2952ce26a94aa48031bf966cc337d9acf

- amend spec owner:$blueprint-start sha256:af8a52fe7f736dad09a240f1fe12f065b79367ab28cf746455a0c1c30f162c57

- amend implementation owner:$blueprint-start sha256:6aa302c89480f08a0384fbf89b34b6121e9240b6d08b1adc4e4fb34e4f860ca8

- amend implementation owner:$blueprint-start sha256:81ad0052a5bfef2dc3c4c8b97aff6d67b5ce8b66ccaad9606fcead8b6bc9d9d3

- amend implementation owner:$blueprint-start sha256:9dd0e74725004552f55d2285432b61af6514785ec6a4d51bd4fa1b07b7cbae9a

- deviation D1-S5: The full frontend hook found a stale S2 test fixture still sending removed Entity operational fields to graph.entity.get; corrected that fixture to the approved domain-only response. No frontend behavior changed. One docs runner timeout passed in isolation and the subsequent complete docs hook passed.

- amend implementation owner:$blueprint-start sha256:6bcde8cc747623f32ffb08915a8a7c198fba856b1377f3dc39ca1a22eda689b1

- amend implementation owner:$blueprint-start sha256:d8d35ee96acda2e34e9f89c7e59017a3326c5bf42ca7c55b3f7351c844fcd8ee

- deviation D1-S5: Expanded commit checks exposed tests that assumed no system Entity/owner Links and stale S2 pin/archive read fields. Updated assertions to preserve ordinary relation/history/ACL checks, compare rollback against seeded state, and verify target ownership separately from portable workspace content. The template fixture also reproduced UUID-looking user names being mistaken for graph references; native users.user name/surname values now remain literal through export/materialization. Scoped repair run: 131 tests across 16 files pass; backend typecheck and lint pass.

- amend spec owner:$blueprint-start sha256:e99c8d9ff100cd36727cba44d3be20e07e62606142329b5b2a56492805b661b9

- amend implementation owner:$blueprint-start sha256:b9e2cd94ea53cb4cbf12ecf6700b21ffbf2fcf86584ba480da3d63b8228483b9

- record-result D1-S5 commit:7fa1dbc7a2042438320729517f7200a773225bf7

- close D1-S5 closed commit:7fa1dbc7a2042438320729517f7200a773225bf7

- amend implementation owner:$blueprint-start sha256:38784adcdeeda937bd3e5f8b16ec592b08d84bda0666c2c9b6e2f19c08f9f236

- amend implementation owner:$blueprint-start sha256:e7484487c1d1d5aff16023f15c93562d2176d6a7534d16f8be02b4a46a7e4e61

- amend spec owner:$blueprint-start sha256:e189592e1ddf9a317c7c7481429b0ed08754af91545c8d731a4501328ed94d8f

- amend spec owner:$blueprint-start sha256:c2e87bb6cee71324fab28a5557332668b03373005cb8c5fdf4b9e2b61bfcbce8

- amend spec owner:$blueprint-start sha256:6f95081b5b2f8be0adad27a2b6450a140b0b735165287d770649b8bfaa61194f

- amend implementation owner:$blueprint-start sha256:3b9a58cbdcd1cf37ca2353df209402492e73740e9aa10cfe84d952e2739172b6

- amend implementation owner:$blueprint-start sha256:926b8606fcd2ef46be5b60e6c43e210cf4eac2249aa9972b4c0fea7436cc57c1

- amend implementation owner:$blueprint-start sha256:8bda980a0d5426aad16085e45c73777522a024be846f726a98a55acb8d2b6c25

- amend implementation owner:$blueprint-start sha256:b8a524f9d14d51fec42e90e8d4d5481bd9f0ca198ad6eca8d22c3b0333869fc6

- amend implementation owner:$blueprint-start sha256:85ab599ed6766480edddbf1acce886eebe5350e30472a08135885b950c05e03b

- amend implementation owner:$blueprint-start sha256:526969882c0082a504fff317abe9718c5907b85c1290cd86692fea52adc6081b

- amend implementation owner:$blueprint-start sha256:8db15f59d72138b958c8bbe171eee9f3268847500feb3eda686f05894abffdf9

- amend implementation owner:$blueprint-start sha256:8e9615a1f3a5d97e51fd6f2f9bf027d6dde309aa3cebd12fda59a76d2910560b

- record-result D1-S6 commit:105f732d236433a02670445de97a8807ec71a51e

- close D1-S6 closed commit:105f732d236433a02670445de97a8807ec71a51e

- amend implementation owner:$blueprint-start sha256:e150827ad5c7e181dd861766304cfbc0677f62a361aef675d9ec0c1a050e49c1

- amend implementation owner:$blueprint-start sha256:5452a7933c850e85e8532d08cba8d2ad34d7d6699bcd79f0fe6419bb523b7c68

- amend spec owner:$blueprint-start sha256:d7d228dbc2ecedd9993c96646fee925590e22dc37de581f0cd622f0c5411935a

- amend implementation owner:$blueprint-start sha256:c8eafbcc06c0bd8b1029019667a5c22b56e91fbba3b65a032ded492184a4fa6a

- amend implementation owner:$blueprint-start sha256:9d9b56e3fbf41e588d621f389eea0872a2f814fba259e7dafb9cc8f73cde0549

- amend implementation owner:$blueprint-start sha256:ca2a59becef208a3650847f10fb445dacd17eab5469f7b7bab28c936cda05588

- amend implementation owner:$blueprint-start sha256:547b68e61e2d314d0bd4ec985ce1a5a8ac36cf8d643c3a138ca7d3fce3b70728

- amend implementation owner:$blueprint-start sha256:6dfa3636c2b4047479b1abecdc28982e982467e341ac8f7c3f3dcb96a674027a

- amend implementation owner:$blueprint-start sha256:f4fbdd8fd52487dff16e84dbe21ec28e38979e093180e732f51d673d1168fe63

- amend implementation owner:$blueprint-start sha256:7014b4bdf70b7048412a2443208ac27549bba47eaf3dfd2b597305ce82328d65

- amend implementation owner:$blueprint-start sha256:8c3f071cc1f73a8715a9886c743c1300f0095a3e1b796becfe385b77bdca1061

- amend implementation owner:$blueprint-start sha256:5298856a1fc7f87557d02e623138133287b45eb9fbd85315226bc89928fb8568

- amend implementation owner:$blueprint-start sha256:7067218cac64c8d21e1b9cdef4a3e780b8adcf2b4c393c65f5c89b8c30b797e4

- amend implementation owner:$blueprint-start sha256:f493b651d105c4446ed2e0bad808951b8f8a44ef7a8e26cbd935ce271f1e68ef

- amend implementation owner:$blueprint-start sha256:0bd95047b0ae163edb1a6c981928d9796630d8ab1cf37d05d1a252f0e867b85a

- amend implementation owner:$blueprint-start sha256:5b433c914b504fad69489ee1e5ee2bee023eacd0ab9c5cd503e02f4452f6c431

- amend implementation owner:$blueprint-start sha256:a13702306930262317982756e60370fe1b4572aab15487bc63e2f6ab4db921b9

- amend implementation owner:$blueprint-start sha256:79314906ee5b5081e76b9de394a6a0ecb872418f89860ab351c6d4dc50b577c8

- amend implementation owner:$blueprint-start sha256:727222615f5d68a48431ed4d16d1b5f3811e2a6e7911d0e304784ac925369ef9

- amend implementation owner:$blueprint-start sha256:ccad5152c00bae72d2dbacd144876906ea33825d281d7e87662b575415591206

- amend implementation owner:$blueprint-start sha256:8d22b21a65d7d9162a585bb7c21df28116985da288e16490462e2f0e322aa702

- amend spec owner:$blueprint-start sha256:9a7fd4cfffbb0329a793afbc3be53b6d3b0ff6d77d9f0a1ebf1a9a0ee4fd93e5

- record-result D1-S7 commit:592a0335722d26c66d146c945143798f3f5211c4

- close D1-S7 closed commit:592a0335722d26c66d146c945143798f3f5211c4

- amend implementation owner:$blueprint-start sha256:47eff849cf09a70ea1adabfbb59790c534208b3c7533cb52acb82c2f3ed196a9

- amend implementation owner:$blueprint-start sha256:5dd8b061c4897e353d81ccc263b2fcb3f9448c6cae6ab2206c8e09acfc980ca4

- amend implementation owner:$blueprint-start sha256:7da7b7b64ad31acd136d049e3dec633c7c606bb7580c4e86d6773a5177fc7a8c

- amend implementation owner:$blueprint-start sha256:008f7d25d81fbfb689e7faa5f886c5752679b2c7912301202bc449c36dc5a4c0

- record-result D1-S7 commit:30bae8c7a44d7a1d7a92d8c509b11b1cd88c9ad1

- deviation D1-S7: One D1-S7 repair commit was required after catalog integration proved declaration-only SDK generation could not supply the canonical runtime validator and repeated generation reused a cache for deleted declarations.

- close D1-S7 closed commit:30bae8c7a44d7a1d7a92d8c509b11b1cd88c9ad1

- amend implementation owner:$blueprint-start sha256:dabb9f4b021fbb72d556a2e53b0d2555b93ae8ba5aaa1032aea75b3e15e082ea

- amend implementation owner:$blueprint-start sha256:04d245751546567f20844030e185415d1fe9b736d073d86ea21d4511b507f7e6

- amend implementation owner:$blueprint-start sha256:8768b35ee0f3da3b8e54dcd4f2712d3346e7c4e36685101bda52163693e44016

- amend implementation owner:$blueprint-start sha256:a62d92a6ce721ae686327409ce996250bf82faaa5506096ad097229f40b5f550

- amend implementation owner:$blueprint-start sha256:51c5a2630eba6d461fcb274b2bef85e8e826ae3820d058e52cdb2cf6298602e4

- amend implementation owner:$blueprint-start sha256:ad9a7018745847681b4f285afe0b484db68ce7df8e46753bd6fbdaee3226aa24

- amend implementation owner:$blueprint-start sha256:0cb61ec3a91a52359e4c6b5501c9deb608aa8aee5dce60657d20f92040209319

- amend implementation owner:$blueprint-start sha256:c606eb61fdb7c1fb84011f5c267ac13a19ebb577822a7cbbaec312bc58683384

- amend implementation owner:$blueprint-start sha256:94c6ce89dffebe4b964482dc6b545c3db7668600f50e229d8f5dd360b8459f59

- amend implementation owner:$blueprint-start sha256:e469c5884ab81d68d9b7c51d1915a815daed826cc2ff41b421feccc3be01c966

- amend spec owner:$blueprint-start sha256:80ceb01105f97da37d7fdf8ca69a0e610de9fbbf402c583df4c4d773321e533b

- amend spec owner:$blueprint-start sha256:911de26db554633a354a091a1fd2100d4487bb4d5d944df3171361d4bbb0eac6

- record-result D1-S2 commit:9dced935d6c782b5f3519caf499c05aec5e063e2

- deviation D1-S2: A separate repair commit follows D1-S2: catalog integration exposed extras:true leaking into strict module list/get RPCs. The repair preserves each RPC input contract.

- close D1-S2 closed commit:9dced935d6c782b5f3519caf499c05aec5e063e2

- amend spec owner:$blueprint-start sha256:0fc7ec7c403510424b60ed7a86328a93dcdf4fcf8aaa2ff84b0f2ba0f635d87b

- amend spec owner:телеграмм приведем к единообразию, исправим это sha256:88451c2b868a1604c36545b415d5bfeaf4dd7df82ec0e69236b1e7425ef10006

- amend spec owner:телеграмм приведем к единообразию, исправим это sha256:a746ffe649aea9b5e0e416d000be1570b4dbda30f4b2a56c88cc2f123364d5b2

- amend implementation owner:телеграмм приведем к единообразию, исправим это sha256:2a389bb9ba1e185230860c95e0bed28fa7156b86a8ecf49d9176c1785a535d0a

- amend implementation owner:телеграмм приведем к единообразию, исправим это sha256:bd5bbf6f7336b6887fa28e44f08d6a2186d6d9b3bcbe5ebc5ebf1a05842972ea

- amend spec owner:телеграмм приведем к единообразию, исправим это sha256:6808be0a0ab8b34a1e17abc040053b04d606d460e7604a133f52c5c31a7937ac

- record-result D2-S1 commit:8c16a0682f4f664c8079bd0260e22e884061d32e

- deviation D2-S1: Owner chose one Telegram syncEnabled control, without a permission getter or new extras field; stored legacy chat choice only informs initialization/migration.

- deviation D2-S1: Email/Notes/Projects detail DTOs also carry extras for rows opened outside the current list page.

- close D2-S1 closed commit:8c16a0682f4f664c8079bd0260e22e884061d32e

- amend implementation owner:$blueprint-start sha256:a07eb45e38995899670fa72b6fa6795b2fef31dd9f33bbdef799f8da936f7eab

- amend implementation owner:$blueprint-start sha256:cf888622caade5d871af98bb9a26c58fcfcabaa97687412b8581d5d7805d63c2

- record-result D2-S2 commit:5c369ddb69fd30ddf344950b285ca9ea183243cc

- deviation D2-S2: Additional existing Meetings/Telegram fixture consumers and the Meeting card test were enumerated through planctl before migration; no Source protocol change.

- deviation D2-S2: The generic Trigger detail DTO keeps a null parent for an unparented definition; execution's requirement for exactly one Episode remains enforced by the native engine.

- close D2-S2 closed commit:5c369ddb69fd30ddf344950b285ca9ea183243cc

- amend spec owner:телеграмм приведем к единообразию, исправим это sha256:1a0a688adf6b0cc94880d51ee93036e115c83c67548d36ce28a90fea702fb124

- amend implementation owner:$blueprint-start sha256:ef975c5bfdc4e285ab8559f975b5b5d4626cf16587bb6c5f311ff15ab66347fb

- amend implementation owner:$blueprint-start sha256:b585fe1c704df063ff3907d8685defc6b3885664aaf76161333ff6c828e56ade

- record-result D1-S2 commit:800711b78d629016941174fa8f4d99a656c236b4

- deviation D1-S2: Additional D1-S2 repair commit completes the owner's Telegram sync unification; existing false processing permissions remain unchanged for other schemas and current v7 documents. The commit also reconciles frontend module documentation with the already-tested strict-RPC repair.

- close D1-S2 closed commit:800711b78d629016941174fa8f4d99a656c236b4

- amend spec owner:Минимальная модель (рекомендую) sha256:2c6cf5a3549acae82947fa09996a6f3b0b5acede4b44875cfaa94d16d0c6bc39

- amend spec owner:Минимальная модель (рекомендую) sha256:52c31eea32b05ab1548512168ed93826bf4a11861e66579ed75ef86489125587

- amend implementation owner:Минимальная модель (рекомендую) sha256:a562ba793ebfab83c1f8533572b971cf8f93f2c0b052f5470e8596cedcafe2f6

- amend implementation owner:Минимальная модель (рекомендую) sha256:a7547351c085236397d9be6262c4b65687982f096a0da68b32605e5c8fdbde99

- amend implementation owner:Минимальная модель (рекомендую) sha256:e9eda3d2c8e7a475eb79be98c0e689213ab81fa5dae83c81ab8f2ff73f24b0b8

- amend spec owner:Минимальная модель (рекомендую) sha256:c3c4c70924b37f5c13e4271f10fbd83eaeb10e7d017dc0be8caa9bbc939ed114

- amend implementation owner:Минимальная модель (рекомендую) sha256:044cbeba26b483168a2df9009cc7a58d58027098b09a62be42b828d973c61343

- amend implementation owner:Минимальная модель (рекомендую) sha256:e755c4c2046ca74abd3692d1f3b65134a8f094902731e89279e5893b6dc325a8

- amend implementation owner:$blueprint-start sha256:ec3d0664e6347052257a6fbe793cde520f92d42ab77a2073ed595c6649a2fa74

- amend implementation owner:$blueprint-start sha256:8a1266b03953ce3fb96e5f515814b3c2242512ce2e43ec2e3207868f3d870ac4

- amend spec owner:Минимальная модель (рекомендую) sha256:c36a0768abe3db154a23da49b5ca4111cf51a06f944bffcdaca1dcb3e748d6b4

- amend implementation owner:Минимальная модель (рекомендую) sha256:ca8929b3ef442e24400d94f9696a64531bc454fc4226475c48213b9b2a2603e3

- amend implementation owner:Минимальная модель (рекомендую) sha256:d3c37656f3548feb1ef3de242e28a28156503845914cc6038175ca1bce5cc299

- amend spec owner:Минимальная модель (рекомендую) sha256:86bdd075418f6d513691ea0e934ea58b82e9556e1f6abc81f2e425e47b2e54b2

- record-result D1-S8 commit:59faa711c631212398bb917b55fdd3c53abef1aa

- deviation D1-S8: Generic retirement of a referenced conversation is refused atomically in this minimal model; richer conversation merge is not introduced.

- deviation D1-S8: The existing manual-send module/user stamp is accepted only for sent with an explicit account-qualified provider message key. Legacy Episode sent records remain readable/portable without becoming delivery observations.

- deviation D1-S8: Reconciled the shared relation-count fixture and workspace documentation through declared scope after the commit hook identified them.

- close D1-S8 closed commit:59faa711c631212398bb917b55fdd3c53abef1aa

- amend implementation owner:Минимальная модель (рекомендую) sha256:47e03ffb48806ab3b3d39e50743e727e343a7335b3597617edb42b4e7a887f9d

- amend implementation owner:Минимальная модель (рекомендую) sha256:ecdda66002f60a687071e07049ac049ffa9de710b4c844e30a0f899079ef5e42

- amend implementation owner:$blueprint-start sha256:1c896b4876fd756d701a00736021684153c9af167c77e8e362112f957f8149e3

- amend implementation owner:$blueprint-start sha256:7745c22646da90c47d75320b9a9b5a92edc0c6a4176199eee9232dc557416ade

- amend implementation owner:$blueprint-start sha256:1bfa56014021b12ece06973e1507c878557ec40a4fda4428f401ee9c7cecef54

- amend implementation owner:$blueprint-start sha256:e7f261bd3cd9cf00d19112639aede1b4b91ab8d079e8a4487bf6021269aec8f7

- amend implementation owner:$blueprint-start sha256:cbb535dc1c20d6dcd6eb4d08fe4355c31dbd4cb25f0ee873cf2ed06afab37773

- amend implementation owner:$blueprint-start sha256:91f54761f4227fcdd640bf8b8f6e709f3b5cc2620d0c80f7e8b44ebd74776267

- amend implementation owner:$blueprint-start sha256:b4fb276949cb0ef54b0ffdf20dfd5533ec12e479cbe1a0dff65d40ebe3ed9c74

- amend implementation owner:$blueprint-start sha256:d437fcd6fbfd44beb1ae4cf863f9369e434de2fc3189d52fc04248b68b0f9c73

- amend implementation owner:$blueprint-start sha256:1346f357054533ed84f8c8f1417e977256e21458e4b9e6ffbeba493df485b5a7

- amend implementation owner:$blueprint-start sha256:8a2e7922b8a047d5daa1ceb45dc8767c143814402c487ab93b880bae313105aa

- amend implementation owner:$blueprint-start sha256:6e093fa65f272459b76c19b6770cb43c8a50ddb7bce2410adfcd6ab78168cc96

- amend implementation owner:$blueprint-start sha256:894f3cd6d76575b899b51e56445f0e9f240cb7169b209075d5487ef94b9d50d4
<!-- plan:execution:end -->
