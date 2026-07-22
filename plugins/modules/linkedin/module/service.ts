// LinkedIn plugin — backend module (V8 isolate). Read-only ingest of LinkedIn
// profiles + posts via the `linkedin` surface, plus read tools. Per-platform
// module (telegram-shaped): a WRITE seam (message / compose) belongs HERE later —
// add write tools + a source_command grant + op_composer like the telegram
// module, without touching x. v1 is read-only. (Split from the old shared
// `social` module, see plan Revision.)
// Writes ONLY `linkedin.*` (implicit own-namespace grant); soft-reads contacts.person.
// Idempotent: facets carry external_id = the source remote_id (re-poll
// upserts). Provenance is stamped host-side from the calling plugin + envelope.

import { searchEntitiesPage, str, syncHandler, tool, type GraphService, type PluginDeps } from "@magnis/plugin-sdk";
import type {
  BatchEntityInput,
  BatchLinkInput,
  PaginatedResponse,
  WindowRow,
} from "@magnis/plugin-sdk";
import type {
  GetParams,
  Platform,
  PostContent,
  PostListItem,
  PostMetrics,
  PostsListParams,
  ProfileIdentity,
  ProfileDetail,
  ProfileListItem,
  ProfilesListParams,
  LinkedinCanonical,
  LinkedinFacets,
  SyncEnvelope,
} from "../types.ts";
import {
  AUTHORED_BY,
  POST,
  POST_CONTENT,
  POST_METRICS,
  PROFILE,
  PROFILE_IDENTITY,
  PROFILE_PERSON_LINK,
} from "../schema.ts";
import { richPostFields } from "./helpers.ts";

export class LinkedinModule {
  private readonly graph: GraphService<LinkedinFacets, LinkedinCanonical>;
  private readonly rpc: PluginDeps<LinkedinFacets, LinkedinCanonical>["rpc"];
  constructor(deps: PluginDeps<LinkedinFacets, LinkedinCanonical>) {
    this.graph = deps.graph;
    this.rpc = deps.rpc;
  }

  /// Sync ingest — one page of canonical envelopes (profile + post). Both X and
  /// LinkedIn connectors feed the same surface; `payload.entity_type` discriminates.
  @syncHandler("linkedin")
  async ingest(params: {
    envelopes?: SyncEnvelope[];
  }): Promise<{ ok: boolean; dropped_remote_ids: string[] }> {
    const envelopes = Array.isArray(params.envelopes) ? params.envelopes : [];
    const dropped: string[] = [];

    const entities: BatchEntityInput[] = [];
    const links: BatchLinkInput[] = [];
    // handle → batch key of the profile entity (to wire authored_by within the page).
    const profileKeyByHandle = new Map<string, string>();

    for (const env of envelopes) {
      const remoteId = env.remote_id;
      const payload = env.payload;
      const entityType = str(payload, "entity_type");
      if (!remoteId || env.kind === "delete") {
        if (remoteId && env.kind === "delete") dropped.push(remoteId); // no delete path yet
        continue;
      }
      if (entityType === "profile") {
        const identity = payload as unknown as ProfileIdentity;
        entities.push({
          key: remoteId,
          schema_id: PROFILE,
          name: identity.display_name ?? identity.handle,
          facets: [
            { schema_id: PROFILE_IDENTITY, data: payload, external_id: remoteId, confidence: 100 },
          ],
        });
        if (identity.handle) profileKeyByHandle.set(identity.handle.toLowerCase(), remoteId);
      } else if (entityType === "post") {
        const content = payload as unknown as PostContent;
        const metrics = (payload.metrics ?? {}) as PostMetrics;
        const facets = [
          { schema_id: POST_CONTENT, data: payload, external_id: remoteId, confidence: 100 },
          { schema_id: POST_METRICS, data: metrics as Record<string, unknown>, external_id: `${remoteId}:metrics`, confidence: 100 },
        ];
        entities.push({
          key: remoteId,
          schema_id: POST,
          name: content.text.slice(0, 80),
          date: content.created_at ?? undefined,
          facets,
        });
      } else {
        if (remoteId) dropped.push(remoteId);
      }
    }

    // authored_by links: post → its author profile when present in THIS page.
    for (const env of envelopes) {
      const payload = env.payload;
      if (str(payload, "entity_type") !== "post" || !env.remote_id) continue;
      const handle = str(payload, "author_handle");
      if (!handle) continue;
      const profileKey = profileKeyByHandle.get(handle.toLowerCase());
      if (profileKey) {
        links.push({ from_key: env.remote_id, to_key: profileKey, kind: AUTHORED_BY });
      }
    }

    if (entities.length > 0) {
      const applied = await this.graph.apply_batch({ entities, links });
      // Identity link + placeholder-name upgrade. A profile is
      // only ever ingested because a contact tracks its handle — resolve the
      // owner and link profile→person (idempotent by (from,to,kind)). Any RPC
      // failure is swallowed: the next poll cycle re-ingests the profile and
      // repairs the link (self-healing).
      await this.linkProfilesToContacts(envelopes, applied.ids);
    }
    return { ok: dropped.length === 0, dropped_remote_ids: dropped };
  }

  private async linkProfilesToContacts(
    envelopes: SyncEnvelope[],
    ids: Record<string, string>,
  ): Promise<void> {
    for (const env of envelopes) {
      const payload = env.payload;
      if (str(payload, "entity_type") !== "profile" || !env.remote_id) continue;
      const handle = str(payload, "handle");
      const profileId = ids[env.remote_id];
      if (!handle || !profileId) continue;
      try {
        const owner = await this.rpc.execute<{ contact_id: string } | null>(
          "contacts.get_social_tracking_by_handle",
          { platform: "linkedin", handle },
        );
        if (!owner) continue;
        await this.graph.add_link({
          from_id: profileId,
          to_id: owner.contact_id,
          kind: PROFILE_PERSON_LINK,
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

  @tool("posts.list", {
    description:
      "List ingested linkedin posts (most recent first). Filter by author_handle " +
      "to get one tracked person's feed.",
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
    const win = await this.graph.list_entities_window({
      schema: POST,
      facet_schema: POST_CONTENT,
      order: [{ field: { facet_schema: POST_CONTENT, facet_path: "created_at" }, desc: true }],
      limit,
      offset,
    });
    let items = win.items.map((row) => this.postItem(row));
    if (params.platform) items = items.filter((i) => i.platform === params.platform);
    if (params.author_handle) items = items.filter((i) => i.author_handle === params.author_handle);
    return { items, total: win.total, limit, offset };
  }

  @tool("posts.get", {
    description: "Get a linkedin post by entity id.",
    params: {
      type: "object",
      properties: { id: { type: "string", format: "uuid" } },
      required: ["id"],
      additionalProperties: false,
    },
  })
  async postsGet(params: GetParams): Promise<PostListItem> {
    const detail = await this.graph.get_entity_full(params.id, { links: false });
    if (detail?.entity.schema_id !== POST) {
      throw new Error(`linkedin post not found: ${params.id}`);
    }
    const data =
      (detail.facets.find((f) => f.schema_id === POST_CONTENT)?.data as
        | Record<string, unknown>
        | undefined) ?? {};
    return {
      id: detail.entity.id,
      platform: (str(data, "platform") as Platform | undefined) ?? null,
      author_handle: str(data, "author_handle") ?? null,
      text: str(data, "text") ?? "",
      created_at: str(data, "created_at") ?? null,
      url: str(data, "url") ?? null,
      ...richPostFields(data),
    };
  }

  @tool("profiles.get", {
    description: "Get a tracked linkedin profile by entity id (name, handle, followers, bio, url).",
    params: {
      type: "object",
      // Plain string, not uuid: pending placeholders use "pending:<handle>"
      // ids and must pass schema validation.
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
  })
  async profilesGet(params: GetParams): Promise<ProfileDetail> {
    // A pending placeholder has no entity yet — synthesize the minimal
    // detail from the tracking record so the detail pane can render
    // "Syncing…" instead of erroring.
    if (params.id.startsWith("pending:")) {
      const handle = params.id.slice("pending:".length);
      let name = handle;
      try {
        const tracked: { name: string; handle: string }[] = await this.rpc.execute(
          "contacts.list_social_tracking",
          { platform: "linkedin" },
        );
        name = tracked.find((t) => t.handle === handle)?.name ?? handle;
      } catch {
        // tracking lookup is cosmetic here — the handle is the identity
      }
      return {
        id: params.id,
        platform: "linkedin",
        handle,
        display_name: name,
        follower_count: null,
        bio: null,
        url: `https://www.linkedin.com/in/${handle}/`,
        avatar_url: null,
        pending: true,
      };
    }
    const detail = await this.graph.get_entity_full(params.id, { links: false });
    if (detail?.entity.schema_id !== PROFILE) {
      throw new Error(`linkedin profile not found: ${params.id}`);
    }
    const d =
      (detail.facets.find((f) => f.schema_id === PROFILE_IDENTITY)?.data as
        | Record<string, unknown>
        | undefined) ?? {};
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

  @tool("profiles.list", {
    description:
      "List tracked linkedin profiles, optional platform filter and name search.",
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
      // facets batch-hydrated.
      const { entities: page, total } = await searchEntitiesPage(this.graph, {
        query: search,
        schema_id: PROFILE,
        limit,
        offset,
      });
      const facets = await this.graph.list_facets_for_entities(page.map((e) => e.id));
      const latest = new Map<string, { observed_at: string; data: Record<string, unknown> }>();
      for (const f of facets) {
        if (f.schema_id !== PROFILE_IDENTITY || !f.entity_id) continue;
        const cur = latest.get(f.entity_id);
        if (!cur || f.observed_at > cur.observed_at) {
          latest.set(f.entity_id, { observed_at: f.observed_at, data: f.data as Record<string, unknown> });
        }
      }
      const items = page.map((e) =>
        this.profileItem({
          entity: e,
          data: latest.get(e.id)?.data ?? {},
        }),
      );
      return { items, total, limit, offset };
    }
    const win = await this.graph.list_entities_window({
      schema: PROFILE,
      facet_schema: PROFILE_IDENTITY,
      limit,
      offset,
    });
    let items = win.items.map((row) => this.profileItem(row));
    if (params.platform) items = items.filter((i) => i.platform === params.platform);
    // Page 0 (no search) prepends tracked-but-not-yet-synced handles as
    // PENDING rows — the honest optimistic state right after "+": the row
    // appears instantly and is replaced by the real profile once sync
    // ingests it (its handle then exists among profiles).
    if (offset === 0) {
      const pending = await this.pendingProfiles(items.map((i) => i.handle));
      if (pending.length > 0) {
        items = [...pending, ...items];
        return { items, total: win.total + pending.length, limit, offset };
      }
    }
    return { items, total: win.total, limit, offset };
  }

  /// Tracked linkedin handles with NO ingested profile yet. A contacts
  /// RPC failure yields no placeholders, never a broken list (the real rows
  /// are the payload; pending rows are advisory).
  private async pendingProfiles(pageHandles: (string | null)[]): Promise<ProfileListItem[]> {
    let tracked: { contact_id: string; name: string; handle: string }[];
    try {
      tracked = await this.rpc.execute("contacts.list_social_tracking", {
        platform: "linkedin",
      });
    } catch {
      return [];
    }
    if (!Array.isArray(tracked) || tracked.length === 0) return [];
    // Handle-set of ALL ingested profiles (not just this page): profile count
    // tracks the tracked-handle count — personal-CRM scale.
    const known = new Set(
      pageHandles.filter((h): h is string => !!h).map((h) => h.toLowerCase()),
    );
    const win = await this.graph.list_entities_window({
      schema: PROFILE,
      facet_schema: PROFILE_IDENTITY,
      limit: 1000,
      offset: 0,
    });
    for (const row of win.items) {
      const h = str((row.data ?? {}) as Record<string, unknown>, "handle");
      if (h) known.add(h.toLowerCase());
    }
    return tracked
      .filter((t) => !known.has(t.handle.toLowerCase()))
      .map((t) => ({
        id: `pending:${t.handle}`,
        platform: "linkedin",
        handle: t.handle,
        display_name: t.name || t.handle,
        follower_count: null,
        avatar_url: null,
        pending: true,
      }));
  }

  private postItem(row: WindowRow): PostListItem {
    const d = (row.data ?? {}) as Record<string, unknown>;
    return {
      id: row.entity.id,
      platform: (str(d, "platform") as Platform | undefined) ?? null,
      author_handle: str(d, "author_handle") ?? null,
      text: str(d, "text") ?? row.entity.name,
      created_at: str(d, "created_at") ?? null,
      url: str(d, "url") ?? null,
      ...richPostFields(d),
    };
  }

  private profileItem(row: WindowRow): ProfileListItem {
    const d = (row.data ?? {}) as Record<string, unknown>;
    const fc = d.follower_count;
    return {
      id: row.entity.id,
      platform: (str(d, "platform") as Platform | undefined) ?? null,
      handle: str(d, "handle") ?? null,
      display_name: str(d, "display_name") ?? row.entity.name,
      follower_count: typeof fc === "number" ? fc : null,
      avatar_url: str(d, "avatar_url") ?? null,
    };
  }
}
