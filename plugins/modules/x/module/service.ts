// X plugin — backend module (V8 isolate). Read-only ingest of X profiles +
// posts via the `x` surface, plus read tools. Per-platform module (telegram-
// shaped): a WRITE seam (DM / compose / reply) belongs HERE later — add write
// tools + op_composer like the telegram module, without
// touching linkedin. v1 is read-only. (Split from the old shared `social` module,
// see plan Revision.)
// Writes ONLY `x.*` (facet_write_prefixes); soft-reads contacts.person.
// Idempotent: facets carry external_id = the source remote_id (re-poll upserts,
// INV-4). Provenance is stamped host-side from the calling plugin + envelope.

import { searchEntitiesPage, syncHandler, tool, writeTool, type GraphService, type PluginDeps } from "@magnis/plugin-sdk";
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
  PostMediaItem,
  PostMetrics,
  PostMetricsView,
  PostUrlEntity,
  PostsListParams,
  ProfileIdentity,
  ProfileDetail,
  ProfileListItem,
  ProfilesListParams,
  XCanonical,
  XFacets,
  SyncEnvelope,
} from "../types/index.ts";

const PROFILE = "x.profile";
const PROFILE_IDENTITY = "x.profile.identity";
const POST = "x.post";
const POST_CONTENT = "x.post.content";
const POST_METRICS = "x.post.metrics";
const AUTHORED_BY = "x.post:x.profile";
// Identity link (social-contact-identity DEC-1): declared in the manifest
// since the plugin split — created here at ingest, telegram-style.
const PROFILE_PERSON_LINK = "x.profile:contacts.person";

function str(o: Record<string, unknown>, k: string): string | undefined {
  const v = o[k];
  return typeof v === "string" ? v : undefined;
}

// Rich post fields (social-post-rendering S4): pass the connector's enriched
// payload through to list/get responses. Pre-S4 rows lack them → null/[].
function richPostFields(d: Record<string, unknown>): {
  post_type: string | null;
  article_title: string | null;
  media: PostMediaItem[];
  urls: PostUrlEntity[];
  metrics: PostMetricsView | null;
} {
  const m = d["metrics"];
  const num = (o: Record<string, unknown>, k: string): number | null =>
    typeof o[k] === "number" ? (o[k] as number) : null;
  return {
    post_type: str(d, "post_type") ?? null,
    article_title: str(d, "article_title") ?? null,
    media: Array.isArray(d["media"]) ? (d["media"] as PostMediaItem[]) : [],
    urls: Array.isArray(d["urls"]) ? (d["urls"] as PostUrlEntity[]) : [],
    metrics:
      m && typeof m === "object"
        ? {
            likes: num(m as Record<string, unknown>, "likes"),
            reposts: num(m as Record<string, unknown>, "reposts"),
            replies: num(m as Record<string, unknown>, "replies"),
            impressions: num(m as Record<string, unknown>, "impressions"),
          }
        : null,
  };
}

export class XModule {
  private readonly graph: GraphService<XFacets, XCanonical>;
  private readonly rpc: PluginDeps<XFacets, XCanonical>["rpc"];
  constructor(deps: PluginDeps<XFacets, XCanonical>) {
    this.graph = deps.graph;
    this.rpc = deps.rpc;
  }

  /// Sync ingest — one page of canonical envelopes (profile + post). Both X and
  /// LinkedIn connectors feed the same surface; `payload.entity_type` discriminates.
  @syncHandler("x")
  async ingest(params: {
    envelopes?: SyncEnvelope[];
  }): Promise<{ ok: boolean; dropped_remote_ids: string[] }> {
    const envelopes = Array.isArray(params?.envelopes) ? params.envelopes : [];
    const dropped: string[] = [];

    const entities: BatchEntityInput[] = [];
    const links: BatchLinkInput[] = [];
    // handle → batch key of the profile entity (to wire authored_by within the page).
    const profileKeyByHandle = new Map<string, string>();

    for (const env of envelopes) {
      const remoteId = env.remote_id;
      const payload = (env.payload ?? {}) as Record<string, unknown>;
      const entityType = str(payload, "entity_type");
      if (!remoteId || env.kind === "delete") {
        if (remoteId && env.kind === "delete") dropped.push(remoteId); // S0: no delete path yet
        continue;
      }
      if (entityType === "profile") {
        const identity = payload as unknown as ProfileIdentity;
        entities.push({
          key: remoteId,
          schema_id: PROFILE,
          name: identity.display_name ?? identity.handle ?? remoteId,
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
          name: (content.text ?? "").slice(0, 80),
          date: content.created_at ?? undefined,
          facets,
        });
      } else {
        if (remoteId) dropped.push(remoteId);
      }
    }

    // authored_by links: post → its author profile when present in THIS page.
    for (const env of envelopes) {
      const payload = (env.payload ?? {}) as Record<string, unknown>;
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
      // Identity link + placeholder-name upgrade (DEC-1/DEC-4). A profile is
      // only ever ingested because a contact tracks its handle — resolve the
      // owner and link profile→person (idempotent by (from,to,kind)). Any RPC
      // failure is swallowed: the next poll cycle re-ingests the profile and
      // repairs the link (self-healing, INV-1).
      await this.linkProfilesToContacts(envelopes, applied.ids ?? {});
    }
    return { ok: dropped.length === 0, dropped_remote_ids: dropped };
  }

  // ── X friend import = a bootstrap TRIGGER (plan §7, S5) ─────────────────
  // The following list flows through the ONE canonical ingest path: the host
  // seeds the x source's `contacts` surface with the import spec (cursor),
  // the connector emits social_contact envelopes, and the contacts module's
  // @syncHandler mints untracked contacts via apply_batch. This tool writes
  // NOTHING itself — it only schedules the bootstrap.
  @writeTool("import_following", {
    description:
      "Import the accounts an X user follows as contacts. Schedules a sync " +
      "bootstrap of the x source's contacts surface — the import itself runs " +
      "through the standard sync pipeline. Imported friends are NOT tracked; " +
      "tracking their tweets stays a per-person opt-in. Re-running refreshes " +
      "the list idempotently.",
    params: {
      type: "object",
      properties: {
        handle: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 5000 },
      },
      required: ["handle"],
      additionalProperties: false,
    },
  })
  async import_following(params: {
    handle: string;
    limit?: number;
  }): Promise<{ scheduled: boolean; surface: string }> {
    await this.rpc.execute("source.sync.bootstrap", {
      source_id: "x",
      surface: "contacts",
      params: {
        handle: params.handle,
        ...(params.limit != null ? { limit: params.limit } : {}),
      },
    });
    return { scheduled: true, surface: "contacts" };
  }

  private async linkProfilesToContacts(
    envelopes: SyncEnvelope[],
    ids: Record<string, string>,
  ): Promise<void> {
    for (const env of envelopes) {
      const payload = (env.payload ?? {}) as Record<string, unknown>;
      if (str(payload, "entity_type") !== "profile" || !env.remote_id) continue;
      const handle = str(payload, "handle");
      const profileId = ids[env.remote_id];
      if (!handle || !profileId) continue;
      try {
        const owner = await this.rpc.execute<{ contact_id: string } | null>(
          "contacts.get_social_tracking_by_handle",
          { platform: "x", handle },
        );
        if (!owner) continue;
        await this.graph.add_link({
          from_id: profileId,
          to_id: owner.contact_id,
          kind: PROFILE_PERSON_LINK,
        });
        // DEC-4 (INV-7): CAS rename — only upgrades a handle-placeholder name.
        const displayName = str(payload, "display_name");
        if (displayName) {
          await this.rpc.execute("contacts.rename_if_placeholder", {
            id: owner.contact_id,
            expected_name: handle,
            new_name: displayName,
          });
        }
      } catch {
        // Self-healing (DEC-1): repaired on the next poll cycle.
      }
    }
  }

  @tool("posts.list", {
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
    description: "Get a x post by entity id.",
    params: {
      type: "object",
      properties: { id: { type: "string", format: "uuid" } },
      required: ["id"],
      additionalProperties: false,
    },
  })
  async postsGet(params: GetParams): Promise<PostListItem> {
    const detail = await this.graph.get_entity_full(params.id, { links: false });
    if (!detail || detail.entity.schema_id !== POST) {
      throw new Error(`x post not found: ${params.id}`);
    }
    const data =
      (detail.facets.find((f) => f.schema_id === POST_CONTENT)?.data as
        | Record<string, unknown>
        | undefined) ?? {};
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

  @tool("profiles.get", {
    description: "Get a tracked x profile by entity id (name, handle, followers, bio, url).",
    params: {
      type: "object",
      properties: { id: { type: "string", format: "uuid" } },
      required: ["id"],
      additionalProperties: false,
    },
  })
  async profilesGet(params: GetParams): Promise<ProfileDetail> {
    const detail = await this.graph.get_entity_full(params.id, { links: false });
    if (!detail || detail.entity.schema_id !== PROFILE) {
      throw new Error(`x profile not found: ${params.id}`);
    }
    const d =
      (detail.facets.find((f) => f.schema_id === PROFILE_IDENTITY)?.data as
        | Record<string, unknown>
        | undefined) ?? {};
    const fc = d["follower_count"];
    return {
      id: detail.entity.id,
      platform: (str(d, "platform") as Platform | undefined) ?? null,
      handle: str(d, "handle") ?? null,
      display_name: str(d, "display_name") ?? detail.entity.name ?? null,
      follower_count: typeof fc === "number" ? fc : null,
      bio: str(d, "bio") ?? null,
      url: str(d, "url") ?? null,
      avatar_url: str(d, "avatar_url") ?? null,
    };
  }

  @tool("profiles.list", {
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
        } as WindowRow),
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
    return { items, total: win.total, limit, offset };
  }

  private postItem(row: WindowRow): PostListItem {
    const d = (row.data ?? {}) as Record<string, unknown>;
    return {
      id: row.entity.id,
      post_id: str(d, "post_id") ?? null,
      conversation_id: str(d, "conversation_id") ?? null,
      platform: (str(d, "platform") as Platform | undefined) ?? null,
      author_handle: str(d, "author_handle") ?? null,
      text: str(d, "text") ?? row.entity.name ?? "",
      created_at: str(d, "created_at") ?? null,
      url: str(d, "url") ?? null,
      ...richPostFields(d),
    };
  }

  private profileItem(row: WindowRow): ProfileListItem {
    const d = (row.data ?? {}) as Record<string, unknown>;
    const fc = d["follower_count"];
    return {
      id: row.entity.id,
      platform: (str(d, "platform") as Platform | undefined) ?? null,
      handle: str(d, "handle") ?? null,
      display_name: str(d, "display_name") ?? row.entity.name ?? null,
      follower_count: typeof fc === "number" ? fc : null,
      avatar_url: str(d, "avatar_url") ?? null,
    };
  }
}
