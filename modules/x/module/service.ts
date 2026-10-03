import { rpc } from "@magnis/plugin-sdk";
// X plugin — backend module (V8 isolate). Read-only ingest of X profiles +
// posts via the `x` surface, plus read tools. Per-platform module (telegram-
// shaped): a WRITE seam (DM / compose / reply) belongs HERE later — add write
// tools + op_composer like the telegram module, without
// touching linkedin. v1 is read-only. (Split from the old shared `social` module,
// see plan Revision.)
// Writes ONLY `x.*` (implicit own-namespace grant); soft-reads contacts.person.
// Idempotent: records carry externalId = the source remote id (re-poll upserts).
// Provenance is stamped host-side from the calling plugin + envelope.

import { searchEntitiesPage, syncHandler, tool, type GraphService, type PluginDeps } from "@magnis/plugin-sdk";
import type {
  BatchEntityInput,
  BatchLink,
  Entity,
  JsonObject,
  PaginatedResponse,
  SyncEnvelope,
  SyncHandlerParams,
  SyncReceipt,
} from "@magnis/sdk";
import type {
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

export class XModule {
  private readonly graph: GraphService;
  private readonly rpc: PluginDeps["rpc"];
  constructor(deps: PluginDeps) {
    this.graph = deps.graph;
    this.rpc = deps.rpc;
  }

  /// Sync ingest — one page of canonical envelopes (profile + post). Both X and
  /// LinkedIn connectors feed the same surface; `payload.entity_type` discriminates.
  /// `generation` is the pass the worker is in; it is absent for a Source
  /// effect outside a worker, which states nothing.
  @syncHandler("x")
  async ingest(params: SyncHandlerParams): Promise<SyncReceipt> {
    const envelopes = params.envelopes;
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

    const entities: BatchEntityInput[] = [];
    const links: BatchLink[] = [];
    // handle → batch key of the profile entity (to wire authored_by within the page).
    const profileKeyByHandle = new Map<string, string>();

    for (const env of envelopes) {
      const remoteId = env.remoteId;
      const payload = env.payload as JsonObject;
      const entityType = str(payload, "entity_type");
      if (!remoteId || env.kind === "delete") {
        if (remoteId && env.kind === "delete") dropped.push(remoteId); // no delete path yet
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
          properties,
        });
        if (identity.handle) profileKeyByHandle.set(identity.handle.toLowerCase(), remoteId);
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

    // authored_by links: post → its author profile when present in THIS page.
    for (const env of envelopes) {
      const payload = env.payload as JsonObject;
      if (str(payload, "entity_type") !== "post" || !env.remoteId) continue;
      const handle = str(payload, "author_handle");
      if (!handle) continue;
      const profileKey = profileKeyByHandle.get(handle.toLowerCase());
      if (profileKey) {
        links.push({
          fromKey: env.remoteId,
          toKey: profileKey,
          kind: AUTHORED_BY,
          confidence: null,
          metadata: null,
          declaredBy: env.remoteId,
          validFrom: null,
          validUntil: null,
        });
      }
    }

    if (entities.length > 0) {
      const applied = await this.graph.applyBatch({ entities, refs: [], links });
      // Identity link + placeholder-name upgrade. A profile is
      // only ever ingested because a contact tracks its handle — resolve the
      // owner and link profile→person (idempotent by (from,to,kind)). Any RPC
      // failure is swallowed: the next poll cycle re-ingests the profile and
      // repairs the link (self-healing).
      await this.linkProfilesToContacts(envelopes, applied.ids);
    }
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

  private async linkProfilesToContacts(
    envelopes: readonly SyncEnvelope[],
    ids: Readonly<Record<string, string>>,
  ): Promise<void> {
    for (const env of envelopes) {
      const payload = env.payload as JsonObject;
      if (str(payload, "entity_type") !== "profile" || !env.remoteId) continue;
      const handle = str(payload, "handle");
      const profileId = ids[env.remoteId];
      if (!handle || !profileId) continue;
      try {
        const owner = await this.rpc.execute<{ contact_id: string } | null>(
          "contacts.get_social_tracking_by_handle",
          { platform: "x", handle },
        );
        if (!owner) continue;
        // S5: `identity` runs hub → channel, so the CONTACT is the from
        // endpoint — the same edge contacts writes to every other replica.
        await this.graph.addLink({
          from: owner.contact_id,
          to: profileId,
          kind: IDENTITY,
        });
        // CAS rename — only upgrades a handle-placeholder name.
        const displayName = str(payload, "display_name");
        if (displayName) {
          await this.rpc.execute("contacts.rename_if_placeholder", {
            id: owner.contact_id,
            expected_name: handle,
            new_name: displayName,
          });
        }
      } catch {
        // Self-healing: repaired on the next poll cycle.
      }
    }
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
