# Graph typing improvements

> Historical draft, superseded by the [graph reference](vision.md) and [migration plan](plans/2026-10-06-entity-docs.md). The examples below predate the decisions on flat extras, pin order, system ownership, synchronization and privacy; they are not the implementation contract.

This preserves the early typing discussion. Its examples and acceptance cases were proposals, not declarations that the SDK implemented them. Consult the reference and migration plan for the current design.

## Decisions and proposals

| Topic | Current direction | Status |
| --- | --- | --- |
| `isArchived`, `isPinned` | Required booleans on Entity and public projections | Owner correction |
| `pinOrder` | Remains `number \| null`; normalization preserves its value | Preserve existing meaning |
| Entity persistence | A nil UUID means an unsaved domain value; an assigned Graph ID identifies the persistent representation | Owner direction, supported by the WebSource draft |
| Identifier aliases | Retain meaningful names, especially `Link.from: EntityId` and `Link.to: EntityId` | Latest owner clarification; no blanket alias removal |
| `NullableId` | Nil literal or validated non-nil Entity ID; no JavaScript `null` | Proposed spelling and type construction |
| `Syncable` | Standalone capability containing the complete pair; composed with Entity | Proposed, still being discussed |
| `Link.kind` | Enumerated built-in vocabulary with module extensions | Owner direction; type spelling proposed below |

## Proposed type changes

The expanded Entity and Link definitions live in [sections 1 and 2](vision.md). The essential changes are:

```typescript
export const NIL_ID = "00000000-0000-0000-0000-000000000000";
export type NilId = typeof NIL_ID;

export const EntityIdSchema = UuidShapeSchema
  .refine((id) => id !== NIL_ID, "Entity ID must not be nil")
  .brand<"EntityId">();

export type EntityId = z.output<typeof EntityIdSchema>;
export type NullableId = EntityId | NilId;

// Fields of the target EntityBase, not a separate product type:
// id: NullableId;
// isPinned: boolean;
// pinOrder: number | null;
// isArchived: boolean;

export interface Syncable {
  syncEnabled: boolean;
  syncRevision: string;
}

export type Entity<P extends JsonValue = JsonValue> =
  (CanonicalEntity<P> | AgentEntity<P>) & (
    | Syncable
    | { syncEnabled?: never; syncRevision?: never }
  );

export type PersistentEntity<P extends JsonValue = JsonValue> =
  Entity<P> & { id: EntityId };

export type TransientEntity<P extends JsonValue = JsonValue> =
  Entity<P> & { id: NilId };

export type LinkType = BuiltinLinkType | (string & {});
```

`EntityId` gains an actual assignment constraint. `NilId` names the existing sentinel. `NullableId` is the owner's working term for their union; its name does not mean that `null` is accepted. `PersistentEntity` and `TransientEntity` describe two views of the same domain envelope. The persistence and sync guards proposed in the main document narrow that envelope without adding a serialized discriminator.

`BuiltinLinkType` names the fixed host vocabulary, while `LinkType` reuses the existing SDK export. The open union preserves literal suggestions without forbidding module-defined names. Registration, endpoint roles, symmetry and metadata checks remain runtime responsibilities of `link_kinds`.

A non-nil UUID does not prove that a row exists or is owned by the caller. Keep transactional existence and ownership checks. Do not apply the nil rejection to `UserId`, `SourceId`, `AccountId`, `SchemaId` or `externalId`: they have different contracts. In particular, a current local user uses the nil UUID, and a schema ID is a name such as `email.address`.

## Evidence and existing mechanisms

| Finding | Source inspected |
| --- | --- |
| Entity exposes nullable flags | App `entity-sync`, `packages/sdk/src/core/entity.ts` |
| Constructors initialize flags with `null` | App `entity-sync`, `backend/src/core/entity.ts` |
| Unarchive writes `true/null`; reads accept legacy null and false | App `entity-one-type`, `backend/src/services/graph/entity.repository.ts`, `graph.service.ts` |
| Missing viewer preference produces SQL null | App `entity-one-type`, `backend/src/db/repository-helpers.ts`, `pinStateFragments` |
| Pin state and order were deliberately preserved independently | App `docs/plans/entity-pins-per-user.md`; `backend/src/db/schema/graph.ts` |
| Unsaved Web results use nil IDs and the same CanonicalEntity envelope | Catalog `web-source`, `docs/plans/web-source.md`, “Unsaved results” |
| WebSource does not yet export NullableId | The checked catalog branch contains the contract draft; `modules/web` is not implemented there |
| Sync pairing is stronger at runtime than in TypeScript | App `entity-sync`, `packages/sdk/src/core/entity.ts`, `backend/src/core/entity.ts` |
| LinkType is currently just string | App SDK `packages/sdk/src/core/link.ts` |
| Host owns 23 base kinds; module kinds extend the registry | App `backend/migrations/20260916000002_link_kinds.sql`, `backend/src/services/graph/graph-contracts.ts` |

The active `entity-one-type`, `entity-sync`, related-owner and WebSource changes must be reconciled before implementation. This draft does not edit those working branches or restate their approved work as completed.

## Work sequence

### 1. Normalize public boolean states

Modify SDK Entity schemas and every public Entity projection, constructors, Graph return values and the storage-to-domain reader. Use required `z.boolean()` for both public flags.

Translate the known storage values deliberately: `true` remains true; historical `false`, SQL null and absence of a viewer pin row represent false. Keep `pinOrder` unchanged. Do not make malformed public JSON or missing required fields pass through a default. Keep viewer-scoped pin ownership and the existing query mechanism.

Storage normalization is a separate boundary from public parsing. A non-null storage migration is not required merely to stop leaking storage nulls into the API. Decide any storage migration separately; this draft does not authorize losing legacy pin-order information or rewriting every export format.

Affected owners:

- MODIFY app `packages/sdk/src/core/entity.ts` and SDK projection schemas that expose these flags.
- MODIFY app `backend/src/core/entity.ts`, Graph repository/service and shared pin projection helpers.
- MODIFY app Graph/search/transfer/UI callers identified by compiler errors; preserve transfer semantics explicitly.
- MODIFY catalog consumers and regenerated host stubs through their existing generation workflow.

### 2. Express temporary versus assigned identity

Extend the existing SDK ID/Entity vocabulary. Give entity graph references a checked non-nil type; let external domain results carry the nil literal. Reuse `UuidShapeSchema`, including its current acceptance of older UUID version/variant shapes. Do not introduce a different UUID grammar accidentally.

Apply the distinction at read/write boundaries: Graph storage and mutations use assigned IDs, external read/search results may be transient, and saving returns assigned IDs. Link endpoints and evidence cannot contain nil. The ID supplied by a client is still checked for existence and owner inside Graph.

Do not key transient results by the nil ID: use the domain identity already provided by WebSource, such as URL and content hash. The general Entity type remains usable before persistence. `GraphRef` and indexer proposal references keep their distinct semantics.

Affected owners:

- MODIFY app `packages/sdk/src/core/id.ts`, `entity.ts`, `link.ts`, `statement.ts`, graph/SDK boundary contracts and their exports as required by the chosen names.
- MODIFY Graph query/write signatures and parsers; follow compiler errors to consumers rather than performing a blanket textual ID replacement.
- MODIFY catalog WebSource result/save contracts when that module exists; its current draft is the integration reference.
- MODIFY linked projections, UI result keys and fixtures only where the new distinction exposes a real assumption.

### 3. Compose the synchronization capability

Once the interface is agreed, remove synchronization members from EntityBase and define the complete `Syncable` pair in one place. Compose the same flat Entity wire shape with either both fields or neither. Retain `schema.syncable` runtime validation and decimal revision validation.

Keep sync selection, persisted-versus-applied state, owner-lock admission, creation choices and Stop behavior unchanged. A mutation of a saved sync choice requires an assigned Entity ID. This change must retain `canonicalKey` and the initial `syncEnabled` added to owner preparation.

Affected owners:

- MODIFY app SDK Entity/capability schemas, `backend/src/core/entity.ts`, Graph constructors and sync adapters.
- MODIFY catalog module SDK/consumers through the shared Entity migration; do not create another RawEntity twin.
- MODIFY compile-time contract checks and runtime pairing cases.

### 4. Publish the built-in relation vocabulary

Use the 23 existing host kinds listed in the main document. Retain `LinkType` as the public open type and use it in relation-bearing fields. Keep discriminants such as `GraphRef.kind` separate.

Keep one maintained SDK list for the built-in literals and pin it to the existing host migration vocabulary with a contract check; do not rewrite already applied migrations or add a second registry for validation. Module declarations continue to own additional kinds and metadata. WebSource's proposed `contents` is integrated with that change when it lands, not silently treated as already active.

Affected owners:

- MODIFY app `packages/sdk/src/core/link.ts` for the type/list and related SDK exports.
- MODIFY relation-bearing interfaces that currently say only string, where the alias improves discovery.
- MODIFY existing relation-registry contract checks to detect vocabulary drift.

## Verification scenarios for implementation

1. Read a legacy unarchived Entity and an Entity with no viewer pin row. Verify both public flags are false. Pin/unpin and archive/unarchive it; verify booleans, event behavior and viewer independence. Repeat with an existing pin order and verify that its value survives normalization.
2. Parse public Entity JSON with a null or missing boolean. Verify rejection. Read historical SQL null through the explicit repository boundary. Verify a valid public Entity without masking a malformed stored primitive.
3. External Web search and opening an unknown URL return nil IDs and perform no Graph writes. Save by the declared URL/content input. Verify the result has an assigned ID, a repeat preserves identity, and a saved read has the same domain shape.
4. Submit nil as a link end, evidence reference or mutation target. Verify refusal and zero partial graph/event writes. Submit a non-nil UUID for an absent or foreign-owned row. Verify refusal too. Check that the existing local nil user and named schema identifiers still work.
5. Compile a caller that sends a transient Entity ID to a persistent graph operation. Verify a type error; narrow the same Entity through the agreed guard and verify the valid call compiles. The brand must originate at a parser or trusted constructor, not an unsafe cast.
6. Check all sync shapes: both fields absent, a valid pair, either field alone, malformed revision, and fields on an unsupported schema. Verify compile-time pairing and the runtime/schema checks; rerun existing creation and Stop/admission cases without changing their behavior.
7. Use a built-in kind and a registered module kind. Verify both work with legal endpoints. Try an unregistered kind, an incompatible endpoint and invalid metadata. Verify registry rejection. Check that the SDK built-in list matches the host vocabulary and that `same_as` stays symmetric.
8. Compile the app and catalog owners and regenerate boundary artifacts using their existing `agent:*` workflows. Run scoped existing SDK/Graph/transfer/plugin tests during implementation, and each affected repository's `agent:verify:pr` gate at publication. The documentation update itself does not claim those runtime checks have run.

## Still to settle in the dialogue

- Keep the name `NullableId` for nil-or-assigned, or choose wording that cannot be confused with JavaScript null.
- Adopt standalone `Syncable` with the complete pair, or retain a different capability composition while eliminating half-pair states.
- Specify what, if any, initial sync choice a transient preview should carry before a module saves it. Persisted mutation remains unavailable for nil IDs.

No mass deletion of semantic ID aliases, new runtime registry, new loader or autonomous implementation is part of this draft.
