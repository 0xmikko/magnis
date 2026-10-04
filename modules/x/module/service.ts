import { connectionReady, pageLimitMax, rpc, writeTool } from "@magnis/plugin-sdk";
// X profiles own synchronization choices. The module migrates legacy Contacts
// entries, supplies Source selection and admits provider events through Graph.
// Sending posts and DMs remains outside this module's current contract.
// Idempotent: records carry externalId = the source remote id (re-poll upserts).
// Provenance is stamped host-side from the calling plugin + envelope.

import { searchEntitiesPage, syncHandler, tool, type GraphService, type PluginDeps } from "@magnis/plugin-sdk";
import type {
  RawSyncableEntity,
  ResolveSyncMigrationParams,
  SetSyncEnabledParams,
  SetSyncEnabledResult,
  SyncableBatchEntityInput,
  SyncMigrationEntity,
  SyncMigrationIssue,
  SyncMigrationStatus,
  SyncSelection,
  SyncSelectionRequest,
} from "@magnis/plugin-sdk";
import type {
  BatchLink,
  BatchRef,
  Entity,
  JsonObject,
  PaginatedResponse,
  SyncEnvelope,
  SyncHandlerParams,
  SyncHookParams,
  SyncReceipt,
} from "@magnis/sdk";
import type {
  ResolvedXProfile,
  GetParams,
  Platform,
  PostContent,
  PostListItem,
  PostsListParams,
  ProfileIdentity,
  ProfileDetail,
  ProfileListItem,
  ProfilesListParams,
} from "../types.ts";
import type { CompleteXSyncMigrationParams } from "../../contacts/types.ts";
import { AUTHORED_BY, IDENTITY, POST, PROFILE } from "../schema.ts";
import { richPostFields, str } from "./helpers.ts";

/** `x.posts.get`'s input, shared by the RPC method and the agent tool. */
const POST_GET_SPEC = {
  description: "Get a x post by entity id.",
  params: {
    type: "object",
    properties: { id: { type: "string", format: "uuid" } },
    required: ["id"],
    additionalProperties: false,
  },
};

/** `x.profiles.get`'s input, shared by the RPC method and the agent tool. */
const PROFILE_GET_SPEC = {
  description: "Get a tracked x profile by entity id (name, handle, followers, bio, url).",
  params: {
    type: "object",
    properties: { id: { type: "string", format: "uuid" } },
    required: ["id"],
    additionalProperties: false,
  },
};

interface LegacyXChoice {
  contactId: string;
  handle: string;
  enabled: boolean;
}

interface XMigrationGroup {
  externalId: string;
  profile: ResolvedXProfile;
  row: SyncMigrationEntity | undefined;
  entries: LegacyXChoice[];
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizedHandle(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_]{1,15}$/.test(value.trim())) throw new Error("X profile has no valid handle");
  return value.trim().toLowerCase();
}

/** The record's `source.externalId`; an agent-written entity has none. */
function sourceExternalId(row: Entity): string | null {
  return row.origin === "canonical" ? row.source.externalId : null;
}

function savedProfile(row: Entity): RawSyncableEntity {
  if (row.schemaId !== PROFILE || !("syncEnabled" in row) || typeof row.syncEnabled !== "boolean"
    || !("syncRevision" in row) || typeof row.syncRevision !== "string" || !/^\d+$/.test(row.syncRevision)) throw new Error("X profile has no saved synchronization choice");
  return { ...row, syncEnabled: row.syncEnabled, syncRevision: row.syncRevision };
}

function profileFromEntity(row: Entity): ResolvedXProfile {
  const match = /^x:profile:(\d+)$/.exec(sourceExternalId(row) ?? "");
  if (match?.[1] === undefined) throw new Error("X profile has no stable provider identity external id");
  if (row.name === null) throw new Error("X profile has no name");
  const properties = row.properties as JsonObject;
  return { providerId: match[1], handle: normalizedHandle(properties.handle), displayName: row.name,
    bio: str(properties, "bio") ?? null, avatarUrl: str(properties, "avatar_url") ?? null };
}

function resolvedProfile(value: Record<string, unknown>): ResolvedXProfile {
  if (typeof value.providerId !== "string" || !/^\d+$/.test(value.providerId) || typeof value.displayName !== "string"
    || (value.bio !== null && typeof value.bio !== "string") || (value.avatarUrl !== null && typeof value.avatarUrl !== "string")) throw new Error("X profile lookup returned invalid identity data");
  return { providerId: value.providerId, handle: normalizedHandle(value.handle), displayName: value.displayName, bio: value.bio, avatarUrl: value.avatarUrl };
}

function profileProperties(profile: ResolvedXProfile): JsonObject {
  return { entity_type: "profile", platform: "x", handle: profile.handle, display_name: profile.displayName,
    bio: profile.bio, avatar_url: profile.avatarUrl, url: `https://x.com/${profile.handle}` };
}

export class XModule {
  private readonly graph: GraphService;
  private readonly rpc: PluginDeps["rpc"];
  constructor(deps: PluginDeps) {
    this.graph = deps.graph;
    this.rpc = deps.rpc;
  }

  private async profileRows(): Promise<SyncMigrationEntity[]> {
    const rows: SyncMigrationEntity[] = [];
    let after: string | null = null;
    do {
      const page = await this.graph.listSyncMigrationEntities({ schemaId: PROFILE, after, limit: pageLimitMax });
      if (page.next !== null && (page.next === after || page.items.length === 0)) throw new Error("X migration page did not advance");
      rows.push(...page.items);
      after = page.next;
    } while (after !== null);
    return rows;
  }

  private async legacyEntries(): Promise<LegacyXChoice[]> {
    const entries: LegacyXChoice[] = [];
    for (let offset = 0; ; offset += 500) {
      const page = await this.graph.listEntitiesWindow({ schema: "contacts.person", filterField: { propertyPath: "tracking" }, filterOp: "exists", limit: 500, offset });
      for (const entity of page.items) {
        const tracking = (entity.properties as JsonObject).tracking;
        if (!Array.isArray(tracking)) throw new Error(`Contact ${entity.id} has malformed legacy tracking`);
        for (const value of tracking) {
          const item: unknown = value;
          if (typeof item !== "object" || item === null || !("platform" in item)) throw new Error(`Contact ${entity.id} has malformed legacy tracking`);
          if (item.platform !== "x") continue;
          if (!("enabled" in item) || typeof item.enabled !== "boolean" || !("handle" in item) || typeof item.handle !== "string") throw new Error(`Contact ${entity.id} has an invalid X choice`);
          entries.push({ contactId: entity.id, handle: normalizedHandle(item.handle), enabled: item.enabled });
        }
      }
      if (page.items.length === 0 || offset + page.items.length >= page.total) return entries;
    }
  }

  private async migrationGroups(accountId?: string): Promise<{ groups: XMigrationGroup[]; issues: SyncMigrationIssue[] }> {
    const rows = await this.profileRows();
    const entries = await this.legacyEntries();
    const groups = new Map<string, XMigrationGroup>();
    const issues: SyncMigrationIssue[] = [];
    const pending = rows.filter((row) => row.syncEnabled === null || row.syncRevision === null);
    if (entries.length === 0 && pending.length === 0) return { groups: [], issues: [] };
    const savedIds = rows.filter((row) => row.syncEnabled !== null && row.syncRevision !== null).map((row) => row.id);
    const saved = new Map((savedIds.length === 0 ? [] : await this.graph.getEntities(savedIds)).map((row) => [row.id, row]));
    const contacts = [...new Set(entries.map((entry) => entry.contactId))];
    const links = contacts.length === 0 ? [] : await this.graph.listLinksForEntities(contacts);
    const resolved = new Map<string, ResolvedXProfile>();
    const resolve = async (handle: string): Promise<ResolvedXProfile> => {
      const cached = resolved.get(handle);
      if (cached !== undefined) return cached;
      if (accountId === undefined) {
        // The host's sync status answer keys each account by `account_id`.
        const status = await this.graph.syncState("status");
        const accounts = status.accounts;
        if (!Array.isArray(accounts) || accounts.length !== 1) throw new Error("X migration requires one connected account");
        const account: unknown = accounts[0];
        if (typeof account !== "object" || account === null || !("account_id" in account) || typeof account.account_id !== "string" || account.account_id === "") throw new Error("X migration has no connected account ID");
        accountId = account.account_id;
      }
      const profile = resolvedProfile(await this.graph.sourceCommand({ action: "resolveProfile", handle }, accountId));
      if (normalizedHandle(profile.handle) !== handle) throw new Error("X lookup returned a different handle identity");
      resolved.set(handle, profile);
      return profile;
    };
    const include = async (profile: ResolvedXProfile): Promise<XMigrationGroup> => {
      const externalId = `x:profile:${profile.providerId}`;
      const existing = groups.get(externalId);
      if (existing !== undefined) return existing;
      const id = await this.graph.findByExternalId(externalId);
      const row = id === null ? undefined : rows.find((candidate) => candidate.id === id);
      if (id !== null && row === undefined) throw new Error("X migration external id does not identify an owned profile");
      const group: XMigrationGroup = { externalId, profile, row, entries: [] };
      groups.set(externalId, group);
      return group;
    };
    for (const entry of entries) {
      try {
        const linked = links.filter((link) => link.kind === IDENTITY && link.from === entry.contactId && link.validUntil === null)
          .map((link) => saved.get(link.to)).filter((row): row is Entity => row !== undefined && normalizedHandle((row.properties as JsonObject).handle) === entry.handle);
        if (linked.length > 1) throw new Error("Legacy X entry has multiple saved profile identities");
        const held = linked[0];
        const profile = held === undefined ? await resolve(entry.handle) : profileFromEntity(held);
        (await include(profile)).entries.push(entry);
      } catch (error) {
        issues.push({ target: null, legacyIds: [entry.contactId], accounts: [], message: errorText(error) });
      }
    }
    for (const row of pending) {
      if ([...groups.values()].some((group) => group.row?.id === row.id)) continue;
      try {
        const group = await include(await resolve(normalizedHandle(row.properties.handle)));
        if (group.row?.id !== row.id) throw new Error("Existing X profile handle now identifies a different account");
      } catch (error) {
        issues.push({ target: null, legacyIds: [row.id], accounts: [], message: errorText(error) });
      }
    }
    return { groups: [...groups.values()], issues };
  }

  private migrationIssue(group: XMigrationGroup): SyncMigrationIssue {
    return { target: { schemaId: PROFILE, key: group.row?.id ?? group.externalId },
      legacyIds: [...new Set([...group.entries.map((entry) => entry.contactId), ...(group.row === undefined ? [] : [group.row.id])])], accounts: [],
      message: group.entries.length === 0 ? "Profile has no legacy synchronization choice" : new Set(group.entries.map((entry) => entry.enabled)).size > 1
        ? "Contacts have conflicting X synchronization choices" : "Profile synchronization migration is pending" };
  }

  @tool("syncMigration", { entity: PROFILE, description: "Read unresolved X profile synchronization migration.", params: { type: "object", properties: {}, additionalProperties: false } })
  async syncMigration(): Promise<SyncMigrationStatus> {
    const current = await this.migrationGroups();
    const issues = [...current.issues, ...current.groups.map((group) => this.migrationIssue(group))];
    return { complete: issues.length === 0, issues };
  }

  private async commitMigration(group: XMigrationGroup, syncEnabled: boolean): Promise<void> {
    let id = group.row?.id;
    if (id === undefined) {
      const profile: SyncableBatchEntityInput = { key: group.externalId, schemaId: PROFILE, name: group.profile.displayName,
        idx: null, date: null, externalId: group.externalId, properties: profileProperties(group.profile), syncEnabled };
      const applied = await this.graph.applyBatch({ entities: [profile], refs: [], links: [] });
      id = applied.ids[group.externalId];
      if (id === undefined) throw new Error("X migration did not create its profile");
    } else if (group.row?.syncEnabled === null || group.row?.syncRevision === null) {
      await this.graph.updateEntitySyncEnabled({ id, syncEnabled });
    }
    for (const contactId of new Set(group.entries.map((entry) => entry.contactId))) {
      await this.graph.addLink({ from: contactId, to: id, kind: IDENTITY });
    }
    for (const entry of group.entries) {
      await this.rpc.execute("contacts.rename_if_placeholder", { id: entry.contactId, expected_name: entry.handle, new_name: group.profile.displayName });
      await this.rpc.execute("contacts.completeXSyncMigration", { ...entry, profileId: id } satisfies CompleteXSyncMigrationParams);
    }
  }

  private async migrateSyncChoices(accountId?: string, explicit?: ResolveSyncMigrationParams): Promise<SyncMigrationStatus> {
    const current = await this.migrationGroups(accountId);
    if (explicit !== undefined && (explicit.target.schemaId !== PROFILE || !current.groups.some((group) => (group.row?.id ?? group.externalId) === explicit.target.key))) throw new Error("X migration target is missing or stale");
    // A failed lookup could belong to any group; do not freeze a partial vote.
    if (current.issues.length > 0) return { complete: false, issues: [...current.issues, ...current.groups.map((group) => this.migrationIssue(group))] };
    const issues: SyncMigrationIssue[] = [];
    for (const group of current.groups) {
      const initialized = group.row?.syncEnabled !== undefined && group.row.syncEnabled !== null && group.row.syncRevision !== null;
      const requested = explicit?.target.key === (group.row?.id ?? group.externalId) ? explicit.syncEnabled : undefined;
      const values = new Set(group.entries.map((entry) => entry.enabled));
      const choice = initialized ? group.row?.syncEnabled : requested ?? (values.size === 1 ? group.entries[0]?.enabled : undefined);
      if (choice === undefined || choice === null) { issues.push(this.migrationIssue(group)); continue; }
      try { await this.commitMigration(group, choice); }
      catch (error) { issues.push({ ...this.migrationIssue(group), message: errorText(error) }); }
    }
    return { complete: issues.length === 0, issues };
  }

  /// The host reads no answer: an incomplete migration stays readable through
  /// `syncMigration`, and `sync.selection` refuses until it completes.
  @connectionReady()
  async onConnectionReady(params: SyncHookParams): Promise<void> {
    await this.migrateSyncChoices(params.accountId);
    await this.graph.syncState("apply");
  }

  @writeTool("resolveSyncMigration", { entity: "x.profile", description: "Choose synchronization for an unresolved X profile.", params: {
    type: "object", properties: { target: { type: "object", properties: { schemaId: { const: PROFILE }, key: { type: "string" } }, required: ["schemaId", "key"], additionalProperties: false }, syncEnabled: { type: "boolean" } }, required: ["target", "syncEnabled"], additionalProperties: false,
  } })
  async resolveSyncMigration(params: ResolveSyncMigrationParams): Promise<SyncMigrationStatus> {
    const status = await this.migrateSyncChoices(undefined, params);
    await this.graph.syncState("apply");
    return status;
  }

  @rpc("sync.selection", { description: "Read stable X profile choices after completing legacy migration.", params: {
    type: "object", properties: { sourceId: { type: "string" }, accountId: { type: "string" }, accountGeneration: { type: "integer" } }, required: ["sourceId", "accountId", "accountGeneration"], additionalProperties: false,
  } })
  async syncSelection(params: SyncSelectionRequest): Promise<SyncSelection> {
    const status = await this.migrateSyncChoices(params.accountId);
    if (!status.complete) throw new Error(`X synchronization migration is incomplete: ${status.issues.map((issue) => issue.message).join("; ")}`);
    const rows = await this.profileRows();
    const profiles = rows.length === 0 ? [] : await this.graph.getEntities(rows.map((row) => row.id));
    if (profiles.length !== rows.length) throw new Error("X profile selection is incomplete");
    return { surface: "x", choices: profiles.map((row) => {
      const saved = savedProfile(row);
      const profile = profileFromEntity(saved);
      return { id: row.id, scopeId: profile.providerId, handle: normalizedHandle(profile.handle), syncEnabled: saved.syncEnabled, syncRevision: saved.syncRevision };
    }) };
  }

  @writeTool("setSyncEnabled", { entity: "x.profile", description: "Start or stop receiving this X profile and its posts.", params: {
    type: "object", properties: { id: { type: "string", format: "uuid" }, syncEnabled: { type: "boolean" } }, required: ["id", "syncEnabled"], additionalProperties: false,
  } })
  async setSyncEnabled(params: SetSyncEnabledParams): Promise<SetSyncEnabledResult> {
    let syncRevision: string;
    try {
      const row = await this.graph.getEntity(params.id);
      if (row?.schemaId !== PROFILE) throw new Error("Synchronization target is not an X profile");
      ({ syncRevision } = await this.graph.updateEntitySyncEnabled(params));
    } catch (error) {
      return { results: [{ identityId: params.id, targetId: params.id, kind: "failed", message: errorText(error) }] };
    }
    const saved = { identityId: params.id, targetId: params.id, kind: "saved" as const, syncEnabled: params.syncEnabled, syncRevision };
    try {
      await this.graph.syncState("apply");
      return { results: [{ ...saved, application: { kind: "pending" } }] };
    } catch (error) {
      return { results: [{ ...saved, application: { kind: "failed", message: errorText(error) } }] };
    }
  }

  private async admitEnvelopes(incoming: readonly SyncEnvelope[]): Promise<{ envelopes: SyncEnvelope[]; owners: Map<string, RawSyncableEntity>; deletions: Map<string, string> }> {
    const profileEvents = incoming.filter((env) => env.kind !== "delete" && (env.payload as JsonObject).entity_type === "profile");
    const externalIds = [...new Set(profileEvents.map((env) => {
      if (typeof env.remoteId !== "string" || !/^x:profile:\d+$/.test(env.remoteId)) throw new Error("X profile event has no stable identity");
      return env.remoteId;
    }))];
    const profileByExternalId = new Map<string, RawSyncableEntity>();
    if (externalIds.length > 0) {
      const ids = await this.graph.findByExternalIds(externalIds);
      if (ids.length !== externalIds.length) throw new Error("X profile lookup length mismatch");
      const found = ids.filter((id): id is string => id !== null);
      const held = new Map((found.length === 0 ? [] : await this.graph.getEntities(found)).map((row) => [row.id, row]));
      const missing = externalIds.filter((_, index) => ids[index] === null);
      if (missing.length > 0) {
        if ((await this.profileRows()).some((row) => row.syncEnabled === null || row.syncRevision === null) || (await this.legacyEntries()).length > 0) throw new Error("X discovery waits for synchronization migration");
        const rule = (await this.graph.moduleSettings()).newProfileSyncEnabled;
        if (rule !== "true" && rule !== "false") throw new Error("X newProfileSyncEnabled setting is missing or invalid");
        const entities = missing.map((externalId): SyncableBatchEntityInput => {
          const event = profileEvents.find((env) => env.remoteId === externalId);
          if (event === undefined) throw new Error("Missing X profile discovery event");
          const payload = event.payload as JsonObject;
          const handle = normalizedHandle(payload.handle);
          return { key: externalId, schemaId: PROFILE, name: str(payload, "display_name") ?? handle, idx: null, date: null, externalId,
            syncEnabled: rule === "true", properties: profileProperties({ providerId: externalId.slice("x:profile:".length), handle,
              displayName: str(payload, "display_name") ?? handle, bio: str(payload, "bio") ?? null, avatarUrl: str(payload, "avatar_url") ?? null }) };
        });
        const created = await this.graph.applyBatch({ entities, refs: [], links: [] });
        const createdIds: string[] = [];
        for (const externalId of missing) {
          const id = created.ids[externalId];
          if (id === undefined) throw new Error("X profile discovery did not create an identity");
          ids[externalIds.indexOf(externalId)] = id;
          createdIds.push(id);
        }
        for (const row of await this.graph.getEntities(createdIds)) held.set(row.id, row);
      }
      externalIds.forEach((externalId, index) => {
        const id = ids[index];
        const row = id === null || id === undefined ? undefined : held.get(id);
        if (row === undefined || sourceExternalId(row) !== externalId) throw new Error("X profile lookup returned an incomplete or mismatched identity");
        profileByExternalId.set(externalId, savedProfile(row));
      });
    }
    const byHandle = new Map<string, RawSyncableEntity>();
    for (const env of profileEvents) {
      if (typeof env.remoteId !== "string") throw new Error("X profile event has no remote ID");
      const profile = profileByExternalId.get(env.remoteId);
      if (profile === undefined) throw new Error("X profile event has no owner");
      const handle = normalizedHandle((env.payload as JsonObject).handle);
      const earlier = byHandle.get(handle);
      if (earlier !== undefined && earlier.id !== profile.id) throw new Error("X page has ambiguous handle ownership");
      byHandle.set(handle, profile);
    }
    let rows: SyncMigrationEntity[] | undefined;
    const owners = new Map<string, RawSyncableEntity>();
    const deletions = new Map<string, string>();
    for (const env of incoming) {
      const remoteId = env.remoteId;
      const payload = env.payload as JsonObject;
      if (typeof remoteId !== "string") throw new Error("X event has no remote ID");
      if (env.kind === "delete") {
        const id = await this.graph.findByExternalId(remoteId);
        if (id === null) continue;
        const stored = await this.graph.getEntityFull(id, { links: true });
        if (stored === null) throw new Error("X deletion target disappeared");
        let owner: Entity | null;
        if (stored.entity.schemaId === PROFILE) owner = stored.entity;
        else if (stored.entity.schemaId === POST) {
          const authors = stored.links.filter((link) => link.from === id && link.kind === AUTHORED_BY && link.validUntil === null);
          const author = authors[0];
          if (authors.length !== 1 || author === undefined) throw new Error("X deletion has no unique stored author");
          owner = await this.graph.getEntity(author.to);
        } else throw new Error("X deletion target has the wrong schema");
        if (owner === null) throw new Error("X deletion author is missing");
        owners.set(remoteId, savedProfile(owner));
        deletions.set(remoteId, id);
      } else if (payload.entity_type === "profile") {
        const owner = profileByExternalId.get(remoteId);
        if (owner === undefined) throw new Error("X profile has no owner");
        owners.set(remoteId, owner);
      } else if (payload.entity_type === "post") {
        const handle = normalizedHandle(payload.author_handle);
        let owner = byHandle.get(handle);
        if (owner === undefined) {
          rows ??= await this.profileRows();
          const matches = rows.filter((row) => normalizedHandle(row.properties.handle) === handle);
          const match = matches[0];
          if (matches.length !== 1 || match === undefined) throw new Error("X post has no unique profile owner");
          const held = await this.graph.getEntity(match.id);
          if (held === null) throw new Error("X post author is missing");
          owner = savedProfile(held);
          byHandle.set(handle, owner);
        }
        owners.set(remoteId, owner);
      } else throw new Error("Unsupported X event has no profile owner");
    }
    const groups = new Map<string, string[]>();
    for (const [remoteId, owner] of owners) {
      const ids = groups.get(owner.id) ?? [];
      ids.push(remoteId);
      groups.set(owner.id, ids);
    }
    const admitted = new Set(await this.graph.admitSyncEntities([...groups].map(([entityId, remoteIds]) => ({ entityId, remoteIds }))));
    return { envelopes: incoming.filter((env) => typeof env.remoteId === "string" && admitted.has(env.remoteId)), owners, deletions };
  }

  /// Sync ingest — one page of canonical envelopes (profile + post). Profile and
  /// post events use `payload.entity_type` to select the owned schema; only the
  /// events Graph admits for their profile's saved choice are written.
  /// `generation` is the pass the worker is in; it is absent for a Source
  /// effect outside a worker, which states nothing.
  @syncHandler("x")
  async ingest(params: SyncHandlerParams): Promise<SyncReceipt> {
    const incoming = params.envelopes;
    if (incoming.length === 0) return { droppedRemoteIds: [], triggerChecks: [], plan: null, excluded: [] };
    const { envelopes, owners, deletions } = await this.admitEnvelopes(incoming);
    const dropped: string[] = [];
    // What the page states for the plan: a profile once per pass, with the
    // window of posts it plans (the Source's recent ten of what X counts),
    // and one more post per post the graph did not hold yet in the same
    // pass. The pass is stamped on the profile's dictionary so a later poll
    // knows the profile was stated.
    // @tested-by: tst_plugin_x_plan_001
    const generation = params.generation !== undefined && params.generation !== "" ? params.generation : null;
    const plan = { profiles: { total: 0, skipped: 0 }, posts: { total: 0, skipped: 0 } };
    const known = generation === null ? new Map<string, JsonObject | null>() : await this.knownByExternalId(envelopes);
    const restatedProfiles = new Set<string>();

    const entities: SyncableBatchEntityInput[] = [];
    const links: BatchLink[] = [];

    for (const env of envelopes) {
      const remoteId = env.remoteId;
      const payload = env.payload as JsonObject;
      const entityType = str(payload, "entity_type");
      if (!remoteId) throw new Error("Admitted X event has no remote ID");
      const owner = owners.get(remoteId);
      if (owner === undefined) throw new Error("Admitted X event has no profile owner");
      if (env.kind === "delete") {
        const id = deletions.get(remoteId);
        if (id === undefined) throw new Error("Admitted X deletion has no target");
        await this.graph.deleteEntity(id);
        continue;
      }
      if (entityType === "profile") {
        const identity = payload as unknown as ProfileIdentity;
        let properties = payload;
        if (generation !== null) {
          const held = known.get(remoteId);
          if (held?.sync_pass !== generation) {
            plan.profiles.total += 1;
            const total = payload.posts_total;
            const skipped = payload.posts_skipped;
            if (typeof total === "number") plan.posts.total += total;
            if (typeof skipped === "number") plan.posts.skipped += skipped;
            restatedProfiles.add(identity.handle.toLowerCase());
          }
          properties = { ...payload, sync_pass: generation };
        }
        // `x:profile:<numeric id>` — X renames handles, never account ids, so
        // the remote id is the identity-grade key (plan §4).
        entities.push({
          key: remoteId,
          schemaId: PROFILE,
          name: identity.display_name ?? identity.handle,
          idx: null,
          date: null,
          // S5: the profile DICT is the record, under the issuer's own key.
          externalId: remoteId,
          syncEnabled: owner.syncEnabled,
          properties,
        });
      } else if (entityType === "post") {
        const content = payload as unknown as PostContent;
        // A post the graph did not hold, on a profile stated in an earlier
        // page of this pass, is one more than that statement planned.
        if (generation !== null && !known.has(remoteId) && !restatedProfiles.has((str(payload, "author_handle") ?? "").toLowerCase())) {
          plan.posts.total += 1;
        }
        // S5: content AND metrics are one dictionary — the metrics arrive
        // inside the same payload and were only ever split to fit two records.
        entities.push({
          key: remoteId,
          schemaId: POST,
          name: content.text.slice(0, 80),
          idx: null,
          date: content.created_at ?? null,
          externalId: remoteId,
          properties: payload,
        });
      } else {
        if (remoteId) dropped.push(remoteId);
      }
    }

    // authored_by links: post → its admitted owner profile, a ref when the
    // profile is not written in THIS page.
    const refs: BatchRef[] = [];
    for (const env of envelopes) {
      if (env.kind === "delete" || (env.payload as JsonObject).entity_type !== "post" || typeof env.remoteId !== "string") continue;
      const owner = owners.get(env.remoteId);
      const ownerExternalId = owner === undefined ? null : sourceExternalId(owner);
      if (ownerExternalId === null) throw new Error("X post author has no stable external id");
      const key = ownerExternalId;
      if (!entities.some((item) => item.key === key) && !refs.some((item) => item.key === key)) refs.push({ key, externalId: ownerExternalId });
      links.push({
        fromKey: env.remoteId,
        toKey: key,
        kind: AUTHORED_BY,
        confidence: null,
        metadata: null,
        declaredBy: env.remoteId,
        validFrom: null,
        validUntil: null,
      });
    }
    if (entities.length > 0) await this.graph.applyBatch({ entities, refs, links });
    if (generation === null) return { droppedRemoteIds: dropped, triggerChecks: [], plan: null, excluded: [] };
    return { droppedRemoteIds: dropped, triggerChecks: [], plan: { [PROFILE]: plan.profiles, [POST]: plan.posts }, excluded: [] };
  }

  /** The page's profiles and posts the graph already holds, by external id:
   * the profiles with their dictionaries (the pass stamp), the posts by
   * presence. Two Graph calls for the whole page, never one per envelope. */
  private async knownByExternalId(envelopes: readonly SyncEnvelope[]): Promise<Map<string, JsonObject | null>> {
    const known = new Map<string, JsonObject | null>();
    const externalIds = [...new Set(envelopes.flatMap((env) => (env.remoteId && env.kind !== "delete" ? [env.remoteId] : [])))];
    if (externalIds.length === 0) return known;
    const ids = await this.graph.findByExternalIds(externalIds);
    const profileIds: { externalId: string; id: string }[] = [];
    externalIds.forEach((externalId, index) => {
      const id = ids[index];
      if (!id) return;
      known.set(externalId, null);
      if (externalId.startsWith("x:profile:")) profileIds.push({ externalId, id });
    });
    if (profileIds.length === 0) return known;
    const profiles = await this.graph.getEntities(profileIds.map(({ id }) => id));
    const byId = new Map(profiles.map((item) => [item.id, item]));
    for (const { externalId, id } of profileIds) {
      const held = byId.get(id);
      if (held !== undefined) known.set(externalId, held.properties as JsonObject);
    }
    return known;
  }

  @rpc("posts.list", {
    description: "List ingested x posts (most recent first), optional platform filter.",
    params: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1 },
        offset: { type: "integer", minimum: 0 },
        platform: { type: "string", enum: ["x", "linkedin"] },
        author_handle: { type: "string" },
      },
      additionalProperties: false,
    },
  })
  async postsList(params: PostsListParams): Promise<PaginatedResponse<PostListItem>> {
    const limit = params.limit ?? 100;
    const offset = params.offset ?? 0;
    const win = await this.graph.listEntitiesWindow({
      schema: POST,
      order: [{ field: { propertyPath: "created_at" }, desc: true }],
      limit,
      offset,
    });
    let items = win.items.map((e) => this.postItem(e));
    if (params.platform) items = items.filter((i) => i.platform === params.platform);
    if (params.author_handle) items = items.filter((i) => i.author_handle === params.author_handle);
    return { items, total: win.total, limit, offset };
  }

  @rpc("posts.get", POST_GET_SPEC)
  @tool("get", { entity: "x.post", ...POST_GET_SPEC })
  async postsGet(params: GetParams): Promise<PostListItem> {
    const detail = await this.graph.getEntityFull(params.id, { links: false });
    if (detail?.entity.schemaId !== POST) {
      throw new Error(`x post not found: ${params.id}`);
    }
    const data = detail.entity.properties as JsonObject;
    return {
      id: detail.entity.id,
      post_id: str(data, "post_id") ?? null,
      conversation_id: str(data, "conversation_id") ?? null,
      platform: (str(data, "platform") as Platform | undefined) ?? null,
      author_handle: str(data, "author_handle") ?? null,
      text: str(data, "text") ?? "",
      created_at: str(data, "created_at") ?? null,
      url: str(data, "url") ?? null,
      ...richPostFields(data),
    };
  }

  @rpc("profiles.get", PROFILE_GET_SPEC)
  @tool("get", { entity: "x.profile", ...PROFILE_GET_SPEC })
  async profilesGet(params: GetParams): Promise<ProfileDetail> {
    const detail = await this.graph.getEntityFull(params.id, { links: false });
    if (detail?.entity.schemaId !== PROFILE) {
      throw new Error(`x profile not found: ${params.id}`);
    }
    const d = detail.entity.properties as JsonObject;
    const fc = d.follower_count;
    return {
      id: detail.entity.id,
      platform: (str(d, "platform") as Platform | undefined) ?? null,
      handle: str(d, "handle") ?? null,
      display_name: str(d, "display_name") ?? detail.entity.name,
      follower_count: typeof fc === "number" ? fc : null,
      bio: str(d, "bio") ?? null,
      url: str(d, "url") ?? null,
      avatar_url: str(d, "avatar_url") ?? null,
    };
  }

  @rpc("profiles.list", {
    description:
      "List tracked x profiles, optional platform filter and name search.",
    params: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1 },
        offset: { type: "integer", minimum: 0 },
        platform: { type: "string", enum: ["x", "linkedin"] },
        search: { type: "string" },
      },
      additionalProperties: false,
    },
  })
  async profilesList(params: ProfilesListParams): Promise<PaginatedResponse<ProfileListItem>> {
    const limit = params.limit ?? 100;
    const offset = params.offset ?? 0;
    const search = (params.search ?? "").trim();
    if (search) {
      // Framework list-pane search: shared paging helper (overfetch+1 keeps
      // hasMore truthful — infinite scroll works in search mode), identity
      // records batch-hydrated.
      const found = await searchEntitiesPage(this.graph, {
        query: search,
        schemaId: PROFILE,
        limit,
        offset,
      });
      // S5: the matched rows carry their dictionaries — nothing to hydrate.
      const items = found.items.map((e) => this.profileItem(e));
      return { items, total: found.total, limit, offset };
    }
    const win = await this.graph.listEntitiesWindow({
      schema: PROFILE,
      limit,
      offset,
    });
    let items = win.items.map((e) => this.profileItem(e));
    if (params.platform) items = items.filter((i) => i.platform === params.platform);
    return { items, total: win.total, limit, offset };
  }

  private postItem(e: Entity): PostListItem {
    const d = e.properties as JsonObject;
    return {
      id: e.id,
      post_id: str(d, "post_id") ?? null,
      conversation_id: str(d, "conversation_id") ?? null,
      platform: (str(d, "platform") as Platform | undefined) ?? null,
      author_handle: str(d, "author_handle") ?? null,
      // A nameless entity reads as the empty text the host used to send for it.
      text: str(d, "text") ?? e.name ?? "",
      created_at: str(d, "created_at") ?? null,
      url: str(d, "url") ?? null,
      ...richPostFields(d),
    };
  }

  private profileItem(e: Entity): ProfileListItem {
    const d = e.properties as JsonObject;
    const fc = d.follower_count;
    return {
      id: e.id,
      platform: (str(d, "platform") as Platform | undefined) ?? null,
      handle: str(d, "handle") ?? null,
      display_name: str(d, "display_name") ?? e.name,
      follower_count: typeof fc === "number" ? fc : null,
      avatar_url: str(d, "avatar_url") ?? null,
    };
  }
}
