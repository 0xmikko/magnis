// Contacts plugin — backend module (V8). Decorated class; Stage-3
// read path (list/get) mirrors the legacy Rust ContactsModuleService.

import { rpc, searchEntitiesPage, syncHandler, tool, writeTool, type GraphService, type PluginDeps, type PluginUtil, type RawEntity, type RpcExecutor } from "@magnis/plugin-sdk";
import type {
  BatchEntityInput,
  BatchFacetInput,
  FacetRecord,
  GetParams,
  MergePreview,
  MergeResult,
  PaginatedResponse,
} from "@magnis/plugin-sdk";
import type {
  BatchCreateParams,
  BatchCreateResult,
  BatchCreateRow,
  ContactCanonical,
  ContactDetailView,
  ContactFacets,
  ContactListItem,
  ContactsListParams,
  CreateParams,
  LinkedEntitySummary,
  MergeParams,
  MergePreviewParams,
  SearchParams,
  SearchResultItem,
  SetSocialTrackingParams,
  GetSocialTrackingByHandleParams,
  SocialTrackingByHandle,
  TrackSocialProfileParams,
  TrackSocialProfileResult,
  BatchTrackSocialParams,
  BatchTrackSocialResult,
  BatchTrackSocialRow,
  RenameIfPlaceholderParams,
  SocialTracking,
  ToolResult,
  UpdateParams,
} from "../types/index.ts";
import {
  buildListItem,
  computeInitials,
  detectChannels,
  detectRelevanceTier,
  pickAvatarColor,
} from "./helpers.ts";
import { parseSocialUrl } from "./socialUrl.ts";
import type { SocialPlatform } from "./socialUrl.ts";

const SCHEMA = "contacts.person";
const SOCIAL_FACET = "contacts.person.social";

// Handles are stored bare: no leading `@`, trimmed. The sync scheduler builds
// the tracked-handle set from these; the connectors query the platform APIs by
// bare handle.
function normalizeHandle(handle: string): string {
  return handle.trim().replace(/^@+/, "");
}

/** observed_at (RFC3339) → epoch ms; unparseable → 0 (never wins a max). */
function facetTime(f: FacetRecord): number {
  const t = Date.parse(f.observed_at);
  return Number.isNaN(t) ? 0 : t;
}

/** The newest contacts.person.social facet, by observed_at — NOT by list
 * position (the runtime returns newest-first; picking a list end reads the
 * OLDEST facet and resurrects stale tracked state — live bug 2026-07-02). */
function latestSocialFacet(facets: readonly FacetRecord[]): FacetRecord | undefined {
  let best: FacetRecord | undefined;
  for (const f of facets) {
    if (f.schema_id !== SOCIAL_FACET) continue;
    if (!best || facetTime(f) > facetTime(best)) best = f;
  }
  return best;
}

/// Max contacts.person entities folded into one apply_batch (mirrors email's
/// INGEST_CHUNK). A whole sync page is sliced into chunks so the lone PGlite
/// connection is freed between transactions.
const INGEST_CHUNK = 200;

/// plan §7 required-fields contract for social_contact envelopes.
function isValidSocialContact(p: Record<string, unknown>): boolean {
  return (
    typeof p.handle === "string" &&
    p.handle.length > 0 &&
    typeof p.display_name === "string" &&
    p.display_name.length > 0 &&
    typeof p.profile_url === "string" &&
    p.profile_url.length > 0
  );
}

/// A sync envelope routed to the contacts surface by the host bridge.
/// `payload` is a Google connector `Contact` (plugins/sources/google/src/
/// surfaces.rs): { id, display_name, given_name, family_name, emails[],
/// phones[], organizations[], photo_url, external_url }.
interface ContactsSyncEnvelope {
  source_id?: string;
  surface?: string;
  account_id?: string;
  user_id?: string;
  kind?: string;
  remote_id?: string;
  payload?: Record<string, unknown>;
  timestamp?: string;
}

interface GoogleContactEmail {
  address?: string;
  label?: string | null;
  is_primary?: boolean;
}
interface GoogleContactPhone {
  number?: string;
  label?: string | null;
  is_primary?: boolean;
}
interface GoogleContactPayload {
  id?: string;
  display_name?: string | null;
  given_name?: string | null;
  family_name?: string | null;
  emails?: GoogleContactEmail[];
  phones?: GoogleContactPhone[];
  external_url?: string | null;
}

export class ContactsModule {
  private readonly graph: GraphService<ContactFacets, ContactCanonical>;
  private readonly util: PluginUtil;
  private readonly rpc: RpcExecutor;
  constructor(deps: PluginDeps<ContactFacets, ContactCanonical>) {
    this.graph = deps.graph;
    this.util = deps.util;
    this.rpc = deps.rpc;
  }

  @tool("list", {
    description:
      "List contacts with pagination and optional name search. By default, " +
      "Telegram group-only co-members (relevance_tier 'group') are hidden; " +
      "pass include_all: true to show every contact.",
    params: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1 },
        offset: { type: "integer", minimum: 0 },
        search: { type: "string" },
        include_all: { type: "boolean" },
      },
      additionalProperties: false,
    },
  })
  async list(params: ContactsListParams): Promise<PaginatedResponse<ContactListItem>> {
    const limit = params.limit ?? 100;
    const offset = params.offset ?? 0;
    const search = (params.search ?? "").trim();
    const includeAll = params.include_all ?? false;

    let rows: { id: string; schema_id: string; name: string; created_at?: string; is_pinned?: boolean | null }[];
    let total: number;
    // When the search path pre-fetches facets (to filter by tier), it reuses
    // that map for hydration so the page is not facet-read twice.
    let prefetchedFacets: Map<string, FacetRecord[]> | null = null;
    if (search) {
      // Shared paging helper (2026-07-03): the old limit+offset fetch truncated
      // `total` to the visible window → hasMore never fired → infinite scroll
      // was dead in search mode (surfaced at 1000+ contacts).
      const page = await searchEntitiesPage(this.graph, {
        query: search,
        schema_id: SCHEMA,
        limit,
        offset,
        // Group-tier visibility filter (staging e8ec4c82) INSIDE the paging
        // helper: the helper re-fetches with a growing window until enough
        // SURVIVORS fill the page (+1 for honest hasMore), so tier filtering
        // no longer truncates totals. Facets fetched for the filter are
        // accumulated and reused for page hydration below (no second read).
        filter: includeAll
          ? undefined
          : async (entities): Promise<RawEntity[]> => {
              const facets = await this.facetsByEntity(entities.map((e) => e.id));
              prefetchedFacets = facets;
              return entities.filter(
                (e) => detectRelevanceTier(facets.get(e.id) ?? []) !== "group",
              );
            },
      });
      total = page.total;
      rows = page.entities;
    } else if (includeAll) {
      const page = await this.graph.list_entities({
        schema_id: SCHEMA,
        limit,
        offset,
        order: "idx",
      });
      rows = page.items;
      total = page.total;
    } else {
      // DEFAULT: hide Telegram "group"-tier co-members at the QUERY level. The
      // windowed read filters `telegram.contact.relevance_tier IS DISTINCT FROM
      // 'group'` (IS DISTINCT FROM → untiered/manually-created contacts, whose
      // tier is NULL, stay visible) so the page is full and `total` is the exact
      // VISIBLE (non-group) count — correct, efficient pagination.
      const page = await this.graph.list_entities_window({
        schema: SCHEMA,
        filter_field: { facet_schema: "telegram.contact", facet_path: "relevance_tier" },
        filter_eq: "group",
        filter_op: "distinct",
        order: [{ field: { entity_field: "idx" } }],
        limit,
        offset,
      });
      rows = page.items.map((r) => r.entity);
      total = page.total;
    }

    // Hydrate the page in TWO batch reads (no per-row N+1): canonical supplies
    // name/email/phone/role/company (collection-merged for emails/phones, so a
    // window cannot reproduce them — the batch op returns the same map
    // get_canonical does); facets supply channels + relevance_tier.
    const ids = rows.map((e) => e.id);
    const canonById = await this.canonicalByEntity(ids);
    // The paging `filter` closure above may have populated prefetchedFacets, but
    // TS control-flow narrows it back to `null` here (the assignment lives in a
    // deferred callback), so widen before the nullish fallback.
    const facetsById =
      (prefetchedFacets as Map<string, FacetRecord[]> | null) ?? (await this.facetsByEntity(ids));
    const items = rows.map((e) =>
      buildListItem(e, canonById.get(e.id) ?? {}, facetsById.get(e.id) ?? []),
    );
    return { items, total, limit, offset };
  }

  @tool("get", {
    description: "Get a full contact detail view (canonical, facets, links) by id.",
    params: {
      type: "object",
      properties: { id: { type: "string", format: "uuid" } },
      required: ["id"],
      additionalProperties: false,
    },
  })
  async get(params: GetParams): Promise<ContactDetailView> {
    // P1: entity + latest facets + link edges in ONE fetch (user-scoped → null
    // for a non-owner or wrong schema). One get_canonical for the detail view's
    // canonical block; link neighbours resolved in ONE get_entities batch.
    const detail = await this.graph.get_entity_full(params.id, { links: true });
    if (detail?.entity.schema_id !== SCHEMA) {
      throw new Error(`contact not found: ${params.id}`);
    }
    const { entity: e, links } = detail;
    // ALL facets (get_entity_full dedups to latest-per-schema, which would drop
    // the collection email/phone facets channels/relevance_tier + the DTO rely
    // on). One fetch for a single entity — not the hot list path.
    const facets = await this.graph.list_facets_for_entity(e.id);
    const canonical = await this.graph.get_canonical(e.id, ["contacts.person"]);
    const base = buildListItem(e, canonical, facets);

    const linked: LinkedEntitySummary[] = [];
    if (links.length > 0) {
      const neighbourId = (l: { from_id: string; to_id: string }): string =>
        l.from_id === e.id ? l.to_id : l.from_id;
      const targets = await this.graph.get_entities([...new Set(links.map(neighbourId))]);
      const byId = new Map(targets.map((t) => [t.id, t]));
      for (const link of links) {
        const t = byId.get(neighbourId(link));
        if (!t) continue;
        linked.push({
          id: t.id,
          name: t.name,
          schema_id: t.schema_id,
          link_kind: link.kind,
          created_at: t.created_at ?? new Date(0).toISOString(),
          data: null,
        });
      }
    }

    return {
      id: e.id,
      schema_id: e.schema_id,
      name: base.name,
      email: base.email,
      phone: base.phone,
      role: base.role,
      company: base.company,
      channels: detectChannels(facets),
      avatar_color: pickAvatarColor(e.id),
      initials: computeInitials(base.name),
      canonical,
      facets,
      linked_entities: linked,
      created_at: base.created_at,
    };
  }

  // ── read helpers (batch hydration + single-entity write-path shaping) ──
  private async canonicalByEntity(ids: string[]): Promise<Map<string, Partial<ContactCanonical>>> {
    const out = new Map<string, Partial<ContactCanonical>>();
    for (const c of await this.graph.list_canonical_for_entities(ids)) {
      if (!c.entity_id) continue;
      const m = (out.get(c.entity_id) ?? {}) as Record<string, unknown>;
      m[c.key] = c.value;
      out.set(c.entity_id, m);
    }
    return out;
  }

  private async facetsByEntity(ids: string[]): Promise<Map<string, FacetRecord[]>> {
    const out = new Map<string, FacetRecord[]>();
    for (const f of await this.graph.list_facets_for_entities(ids)) {
      if (!f.entity_id) continue;
      const arr = out.get(f.entity_id) ?? [];
      arr.push(f);
      out.set(f.entity_id, arr);
    }
    return out;
  }

  // Single-entity list-item shaping for the WRITE paths (create/update return
  // values) — one canonical + one facet read for that entity, then the pure
  // builder. Not the hot read path (no N+1 loop).
  private async listItemFor(
    entity: { id: string; schema_id: string; name: string; created_at?: string; is_pinned?: boolean | null },
  ): Promise<ContactListItem> {
    const canonical = await this.graph.get_canonical(entity.id, ["contacts.person"]);
    const facets = await this.graph.list_facets_for_entity(entity.id);
    return buildListItem(entity, canonical, facets);
  }

  // Mirrors the native ContactsModuleController::create_single_contact
  // graph writes (controller.rs:43-211). The `email.address` entity +
  // `has_email` link are created via the cross-module RPC hub (DEC-9):
  // contacts asks the `email` module to ensure the address entity, then
  // links it — contacts never writes the foreign `email.address` schema
  // itself. `params` is agent-facing (DEC-11): it omits `client_id` so the
  // agent never invents an id; the handler still accepts it from the
  // frontend WS path via CreateParams.
  @writeTool("create", {
    description:
      "Create a new contact (person). Returns the created entity with id. " +
      "Pass client_id (UUID) as an idempotency key — if a contact already " +
      "exists with that id, the existing one is returned instead of a duplicate.",
    params: {
      type: "object",
      properties: {
        name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        company: { type: "string" },
        role: { type: "string" },
      },
      required: ["name"],
      additionalProperties: false,
    },
  })
  async create(
    params: CreateParams,
  ): Promise<ContactListItem & { fields: Record<string, unknown> }> {
    // Idempotency: an existing client_id returns the existing contact,
    // no re-write (native controller.rs:67 find_entity_for_user).
    if (params.client_id) {
      const existing = await this.graph.get_entity(params.client_id);
      if (existing) {
        const item = await this.listItemFor(existing);
        return { ...item, fields: { name: item.name, email_address_entity_id: null } };
      }
    }

    const entity = await this.graph.create_entity({
      schema_id: SCHEMA,
      name: params.name,
      client_id: params.client_id,
      idx: params.name.toLowerCase(),
    });
    await this.graph.attach_facet({
      entity_id: entity.id,
      schema_id: "contacts.person.profile",
      data: { first_name: params.name },
    });
    if (params.email) {
      await this.graph.attach_facet({
        entity_id: entity.id,
        schema_id: "contacts.person.email",
        data: { email: params.email, is_primary: true },
      });
    }
    if (params.phone) {
      await this.graph.attach_facet({
        entity_id: entity.id,
        schema_id: "contacts.person.phone",
        data: { phone: params.phone, is_primary: true },
      });
    }

    // Hub (DEC-9): ask the email module to ensure the email.address entity,
    // then link has_email. Restores native controller.rs:143-165 behavior
    // without contacts writing the foreign email.address schema directly.
    let email_address_entity_id: string | null = null;
    if (params.email) {
      try {
        const addr = await this.rpc.execute<{ id: string }>("email.ensure_address", {
          address: params.email,
        });
        email_address_entity_id = addr.id;
        await this.graph.add_link({ from_id: entity.id, to_id: addr.id, kind: "has_email" });
      } catch {
        // Parity with native controller.rs:167 — warn-and-continue. On the
        // single-runtime path (no host AppState) the email hub is unavailable;
        // the contact + its email facet still persist, just without the
        // email.address entity and has_email link.
        email_address_entity_id = null;
      }
    }

    const item = await this.listItemFor(entity);
    return {
      ...item,
      fields: {
        name: params.name,
        email_address_entity_id,
        ...(params.email ? { email: params.email } : {}),
        ...(params.role ? { role: params.role } : {}),
        ...(params.company ? { company: params.company } : {}),
      },
    };
  }

  // Mirrors native contacts.batch_create (controller.rs:469). Per-row
  // ids derive as uuid_v5(batch client_id, "contacts.batch_create:{i}")
  // so a retried batch reuses the same entity ids (idempotent), exactly
  // as the native handler (controller.rs:531). Each row delegates to
  // create(), inheriting the same facet writes AND the email.address +
  // has_email hub path (DEC-9) when a row carries an email.
  @writeTool("batch_create", {
    description:
      "Create multiple contacts at once. Each requires a name, with optional " +
      "email, phone, company, role. Pass client_id (UUID) as a batch idempotency key.",
    params: {
      type: "object",
      properties: {
        contacts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              email: { type: "string" },
              phone: { type: "string" },
              company: { type: "string" },
              role: { type: "string" },
            },
            required: ["name"],
            additionalProperties: false,
          },
          minItems: 1,
          maxItems: 50,
        },
        excluded_indices: { type: "array", items: { type: "integer", minimum: 0 } },
      },
      required: ["contacts"],
      additionalProperties: false,
    },
  })
  async batch_create(params: BatchCreateParams): Promise<BatchCreateResult> {
    const contacts = params.contacts;
    if (contacts.length < 1 || contacts.length > 50) {
      throw new Error(`batch size must be 1..=50, got ${String(contacts.length)}`);
    }
    contacts.forEach((c, i) => {
      if (!c.name || c.name.trim().length === 0) {
        throw new Error(`contact[${String(i)}]: missing or empty name`);
      }
    });

    const excluded = new Set(params.excluded_indices ?? []);
    const results: BatchCreateRow[] = [];
    let created = 0;
    let excludedCount = 0;

    for (let i = 0; i < contacts.length; i++) {
      const c = contacts[i];
      if (excluded.has(i)) {
        excludedCount += 1;
        results.push({ id: null, name: c.name, status: "excluded" });
        continue;
      }
      const rowClientId = params.client_id
        ? await this.util.uuid_v5(params.client_id, `contacts.batch_create:${String(i)}`)
        : undefined;
      const item = await this.create({
        name: c.name,
        email: c.email,
        phone: c.phone,
        company: c.company,
        role: c.role,
        client_id: rowClientId,
      });
      created += 1;
      results.push({ id: item.id, name: c.name, email: c.email ?? null, status: "created" });
    }

    return { results, total: contacts.length, created, excluded: excludedCount };
  }

  // Mirrors native contacts.update (controller.rs:562) — name only:
  // rename the entity and re-attach the profile facet's first_name. The
  // update_entity_name op is ownership-checked (DEC-12).
  @writeTool("update", {
    description: "Update a contact's name.",
    params: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        name: { type: "string" },
      },
      required: ["id"],
      additionalProperties: false,
    },
  })
  async update(params: UpdateParams): Promise<ContactListItem> {
    const existing = await this.graph.get_entity(params.id);
    if (!existing) throw new Error(`contact not found: ${params.id}`);

    if (params.name) {
      await this.graph.update_entity_name(params.id, params.name);
      await this.graph.attach_facet({
        entity_id: params.id,
        schema_id: "contacts.person.profile",
        data: { first_name: params.name },
      });
    }

    const fresh = await this.graph.get_entity(params.id);
    return this.listItemFor(fresh ?? existing);
  }

  // Read-only merge preview (controller.rs:631). Ownership is enforced
  // backend-side in the op (DEC-12).
  @tool("merge_preview", {
    description: "Preview merging two contacts: which facets/links move and which fields conflict.",
    params: {
      type: "object",
      properties: {
        survivor_id: { type: "string", format: "uuid" },
        retired_id: { type: "string", format: "uuid" },
      },
      required: ["survivor_id", "retired_id"],
      additionalProperties: false,
    },
  })
  async merge_preview(params: MergePreviewParams): Promise<MergePreview> {
    return this.graph.merge_preview({
      survivor_id: params.survivor_id,
      retired_id: params.retired_id,
    });
  }

  // Merge two contacts (controller.rs:656): transfer facets/links from
  // retired to survivor, delete retired, then re-derive the survivor's
  // name/idx from the resolved canonicals (first_name [+ last_name]).
  @writeTool("merge", {
    description:
      "Merge two contacts into one. Transfers all facets, links, and history from " +
      "retired to survivor, then deletes retired.",
    params: {
      type: "object",
      properties: {
        survivor_id: { type: "string", format: "uuid" },
        retired_id: { type: "string", format: "uuid" },
        overrides: {
          type: "array",
          items: {
            type: "object",
            properties: { canonical_key: { type: "string" }, value: {} },
            required: ["canonical_key", "value"],
          },
        },
        reason: { type: "string" },
      },
      required: ["survivor_id", "retired_id"],
      additionalProperties: false,
    },
  })
  async merge(params: MergeParams): Promise<MergeResult> {
    const result = await this.graph.merge_execute({
      survivor_id: params.survivor_id,
      retired_id: params.retired_id,
      overrides: params.overrides,
      reason: params.reason,
    });

    // Re-derive entity name/idx from the merged canonicals so the
    // survivor's display name reflects the resolved profile.
    const canon = await this.graph.get_canonical(params.survivor_id, ["contacts.person"]);
    const first = canon["person.first_name"];
    if (typeof first === "string" && first.length > 0) {
      const last = canon["person.last_name"];
      const full = typeof last === "string" && last.length > 0 ? `${first} ${last}` : first;
      await this.graph.update_entity_name(params.survivor_id, full);
      await this.graph.update_entity_idx(params.survivor_id, full.toLowerCase());
    }

    return result;
  }

  // Agent search tool (shared::search_entities, shared.rs:447): the
  // user's contacts (optionally within a context) whose name contains
  // the query, sorted by (name, id), truncated to limit. Returns an MCP
  // ToolResult whose text is the pretty-printed SearchResultItem[].
  @tool("search", {
    description: "Search contacts by name.",
    params: {
      type: "object",
      properties: {
        query: { type: "string" },
        context: { type: "string" },
        limit: { type: "integer", minimum: 1 },
      },
      additionalProperties: false,
    },
  })
  async search(params: SearchParams): Promise<ToolResult> {
    // BOUNDED at the DB (reuses the same name search the contacts list uses).
    // The old path called list_entities_by_context() — which loads EVERY entity
    // in the context (38k+ on a real account), marshals them all across the V8
    // boundary, and filters in JS with the cap applied AFTER. On a large account
    // that ran ~50s and TAINTED the plugin isolate, bricking every contacts.*
    // call (search + batch_create) until a backend restart. search_entities_by_name
    // caps at the DB, so it stays fast and never poisons the isolate.
    const MAX_LIMIT = 50;
    const limit = Math.min(params.limit ?? 25, MAX_LIMIT);
    const matched = await this.graph.search_entities_by_name({
      query: params.query ?? "",
      schema_ids: [SCHEMA],
      limit,
    });

    const results: SearchResultItem[] = matched.map((e) => ({
      id: e.id,
      name: e.name && e.name.length > 0 ? e.name : null,
      schema_id: e.schema_id,
      schema_version: 1,
    }));
    results.sort((a, b) => {
      const an = a.name ?? "";
      const bn = b.name ?? "";
      if (an !== bn) return an < bn ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

    return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
  }

  // ── sync ingest (@syncHandler) ────────────────────────────────
  // Invoked by the host PluginModuleController bridge (`contacts.__sync__`) with
  // a WHOLE page of `contacts` envelopes (Google People API snapshots). Mirrors
  // the email ingest principle: a page's contacts fold into apply_batch chunks —
  // one contacts.person entity per contact + its profile/email/phone/
  // external_link facets, all in ONE atomic graph.apply_batch per chunk.
  //
  // Idempotency: the entity key AND the facets' external_id are the envelope
  // `remote_id` (`gpeople:{stable_id}`), so re-ingesting the same contact
  // upserts on that key — no duplicate entity (apply_batch resolves-or-creates
  // by facet external_id, like email's message ingest).
  @syncHandler("contacts")
  async ingest(params: { envelopes?: ContactsSyncEnvelope[] }): Promise<{
    ok: boolean;
    dropped_remote_ids: string[];
  }> {
    const envelopes = Array.isArray(params.envelopes) ? params.envelopes : [];
    const dropped: string[] = [];

    // Fold by remote_id so two envelopes for the same resourceName collapse to
    // ONE entity in the batch (last-write-wins on payload). Native parity: an
    // envelope with no owning user is skipped — the dispatcher couldn't resolve
    // user_id, so we cannot user-scope the write.
    const byRemoteId = new Map<string, ContactsSyncEnvelope>();
    for (const env of envelopes) {
      if (!env.user_id) continue;
      if (env.kind !== "snapshot" && env.kind !== "live") continue;
      if (!env.remote_id) continue;
      // social_contact contract (plan §7): ALL fields required — a violating
      // envelope is reported dropped, never half-ingested.
      const payload = (env.payload ?? {});
      if (payload.kind === "social_contact" && !isValidSocialContact(payload)) {
        dropped.push(env.remote_id);
        continue;
      }
      byRemoteId.set(env.remote_id, env);
    }

    let chunk: ContactsSyncEnvelope[] = [];
    const flush = async (): Promise<void> => {
      if (chunk.length > 0) {
        await this.ingestContactBatch(chunk);
        await Promise.resolve(); // yield so waiting RPCs get the connection
      }
      chunk = [];
    };
    for (const env of byRemoteId.values()) {
      if (chunk.length >= INGEST_CHUNK) await flush();
      chunk.push(env);
    }
    await flush();

    return { ok: dropped.length === 0, dropped_remote_ids: dropped };
  }

  /// One chunk → one apply_batch. Each contact becomes a contacts.person entity
  /// keyed by its remote_id, carrying profile + per-email + per-phone +
  /// external_link facets. All facets stamp `external_id = remote_id` so the
  /// host upserts on a stable, resourceName-derived key.
  private async ingestContactBatch(envelopes: ContactsSyncEnvelope[]): Promise<void> {
    const entities: BatchEntityInput[] = [];

    for (const env of envelopes) {
      const remoteId = env.remote_id;
      if (!remoteId) continue;
      const raw = (env.payload ?? {});

      // social_contact mapper (plan §7, S5): x/linkedin following imports on
      // the SAME surface. Mints an UNTRACKED social contact (tracking is a
      // per-person opt-in — importing must never start API spend, DEC-7).
      // FIND-OR-CREATE (INV-8): a contact already carrying this handle is
      // returned untouched — re-importing must NEVER untrack an opted-in
      // person or duplicate an existing one.
      if (raw.kind === "social_contact") {
        const platform = env.source_id === "linkedin" ? "linkedin" : "x";
        const handle = raw.handle as string;
        const existing = await this.get_social_tracking_by_handle({
          platform,
          handle,
        });
        if (existing) continue;
        const displayName = raw.display_name as string;
        const profileUrl = raw.profile_url as string;
        entities.push({
          key: remoteId,
          schema_id: SCHEMA,
          name: displayName,
          idx: displayName.toLowerCase() || undefined,
          facets: [
            {
              schema_id: "contacts.person.profile",
              data: {},
              external_id: remoteId,
              confidence: 90,
            },
            {
              schema_id: SOCIAL_FACET,
              data:
                platform === "linkedin"
                  ? { linkedin_handle: handle, tracked_linkedin: false }
                  : { x_handle: handle, tracked_x: false },
              confidence: 90,
            },
            {
              schema_id: "contacts.person.external_link",
              data: {
                source_type: platform,
                external_id: remoteId,
                external_url: profileUrl,
                external_name: displayName,
              },
              confidence: 90,
            },
          ],
        });
        continue;
      }

      const p = raw as GoogleContactPayload;

      const facets: BatchFacetInput[] = [];

      // profile facet — first/last name. external_id is the entity's
      // resolve-or-create identity (first facet carrying one).
      const profile: Record<string, unknown> = {};
      if (p.given_name) profile.first_name = p.given_name;
      if (p.family_name) profile.last_name = p.family_name;
      facets.push({
        schema_id: "contacts.person.profile",
        data: profile,
        external_id: remoteId,
        confidence: 90,
      });

      // email facets — one per address (collection-merged canonical).
      for (const e of p.emails ?? []) {
        const address = typeof e.address === "string" ? e.address : undefined;
        if (!address) continue;
        const data: Record<string, unknown> = { email: address };
        if (e.label) data.type = e.label;
        if (typeof e.is_primary === "boolean") data.is_primary = e.is_primary;
        facets.push({ schema_id: "contacts.person.email", data, confidence: 90 });
      }

      // phone facets — one per number.
      for (const ph of p.phones ?? []) {
        const number = typeof ph.number === "string" ? ph.number : undefined;
        if (!number) continue;
        const data: Record<string, unknown> = { phone: number };
        if (ph.label) data.type = ph.label;
        if (typeof ph.is_primary === "boolean") data.is_primary = ph.is_primary;
        facets.push({ schema_id: "contacts.person.phone", data, confidence: 90 });
      }

      // external_link facet — provenance back to the Google contact.
      const extData: Record<string, unknown> = {
        source_type: "google",
        external_id: typeof p.id === "string" ? p.id : remoteId,
      };
      if (p.external_url) extData.external_url = p.external_url;
      if (p.display_name) extData.external_name = p.display_name;
      facets.push({ schema_id: "contacts.person.external_link", data: extData, confidence: 90 });

      const name = typeof p.display_name === "string" ? p.display_name : "";
      entities.push({
        key: remoteId,
        schema_id: SCHEMA,
        name,
        idx: name.toLowerCase() || undefined,
        facets,
      });
    }

    if (entities.length === 0) return;
    // One atomic op (rolls back on failure; idempotent on facet external_id).
    await this.graph.apply_batch({ entities, refs: [], links: [] });
  }

  // ── social tracking (DEC-9) ──────────────────────────────────────
  // contacts OWNS the contacts.person.social facet. Opting a contact in on a
  // platform places its handle in the sync scheduler's tracked set (DEC-8);
  // opting out removes it → that handle is no longer fetched (INV-1). One handle
  // per platform per person; the facet merges across platforms (latest wins).
  @writeTool("set_social_tracking", {
    description:
      "Opt a contact in or out of social tracking on X or LinkedIn. Only tracked " +
      "handles are fetched by the social source connectors. Optionally set the handle.",
    params: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        platform: { type: "string", enum: ["x", "linkedin"] },
        tracked: { type: "boolean" },
        handle: { type: "string" },
      },
      required: ["id", "platform", "tracked"],
      additionalProperties: false,
    },
  })
  async set_social_tracking(params: SetSocialTrackingParams): Promise<SocialTracking> {
    const existing = await this.graph.get_entity(params.id);
    if (existing?.schema_id !== SCHEMA) {
      throw new Error(`contact not found: ${params.id}`);
    }
    // Merge onto the current facet so toggling one platform never clears the
    // other's opt-in / handle.
    const next: SocialTracking = { ...(await this.readSocialTracking(params.id)) };
    if (params.platform === "x") {
      next.tracked_x = params.tracked;
      if (params.handle !== undefined) next.x_handle = normalizeHandle(params.handle);
    } else {
      next.tracked_linkedin = params.tracked;
      if (params.handle !== undefined) next.linkedin_handle = normalizeHandle(params.handle);
    }
    await this.graph.attach_facet({
      entity_id: params.id,
      schema_id: SOCIAL_FACET,
      data: next,
    });
    return next;
  }

  // ── social-contact-identity S1 (DEC-2/4/8.3) ──────────────────────
  @writeTool("track_social_profile", {
    description:
      "Track a person's X or LinkedIn profile from a URL or handle. Finds the contact " +
      "that already owns the handle (or creates one) and turns tracking ON. NOTE: every " +
      "tracked handle costs paid API calls on each sync cycle.",
    params: {
      type: "object",
      properties: {
        platform: { type: "string", enum: ["x", "linkedin"] },
        url_or_handle: { type: "string" },
        name: { type: "string" },
      },
      required: ["platform", "url_or_handle"],
      additionalProperties: false,
    },
  })
  async track_social_profile(
    params: TrackSocialProfileParams,
  ): Promise<TrackSocialProfileResult> {
    const parsed = parseSocialUrl(params.platform, params.url_or_handle);
    if (!parsed.ok) {
      throw new Error(`invalid_url: not a ${params.platform} profile: ${params.url_or_handle}`);
    }
    const existing = await this.get_social_tracking_by_handle({
      platform: params.platform,
      handle: parsed.handle,
    });
    if (existing) {
      if (!existing.tracked) {
        await this.set_social_tracking({
          id: existing.contact_id,
          platform: params.platform,
          tracked: true,
        });
      }
      return { contact_id: existing.contact_id, handle: existing.handle, created: false };
    }
    const contact = await this.create({ name: params.name ?? parsed.handle });
    await this.set_social_tracking({
      id: contact.id,
      platform: params.platform,
      tracked: true,
      handle: parsed.handle,
    });
    return { contact_id: contact.id, handle: parsed.handle, created: true };
  }

  // DEC-3: batch entry for a pasted URL list. Per-row isolation — an invalid
  // URL marks its row and never aborts the rest; a retried batch (same
  // client_id) resolves creates to the same uuid_v5 ids (INV-5).
  @writeTool("batch_track_social", {
    description:
      "Track MANY X or LinkedIn profiles at once from pasted URLs/handles (1-50). Each " +
      "becomes a contact (found or created) with tracking ON. COST WARNING: every tracked " +
      "handle is fetched on every sync cycle and costs paid API credits — confirm large " +
      "batches with the operator first.",
    params: {
      type: "object",
      properties: {
        platform: { type: "string", enum: ["x", "linkedin"] },
        profiles: {
          type: "array",
          minItems: 1,
          maxItems: 50,
          items: {
            type: "object",
            properties: {
              url_or_handle: { type: "string" },
              name: { type: "string" },
            },
            required: ["url_or_handle"],
            additionalProperties: false,
          },
        },
        excluded_indices: { type: "array", items: { type: "integer", minimum: 0 } },
      },
      required: ["platform", "profiles"],
      additionalProperties: false,
    },
  })
  async batch_track_social(params: BatchTrackSocialParams): Promise<BatchTrackSocialResult> {
    const profiles = params.profiles;
    if (profiles.length < 1 || profiles.length > 50) {
      throw new Error(`batch size must be 1..=50, got ${String(profiles.length)}`);
    }
    const excluded = new Set(params.excluded_indices ?? []);
    const results: BatchTrackSocialRow[] = [];
    let created = 0;
    let excludedCount = 0;

    for (let i = 0; i < profiles.length; i++) {
      const row = profiles[i];
      if (excluded.has(i)) {
        excludedCount += 1;
        results.push({
          contact_id: null,
          handle: null,
          url_or_handle: row.url_or_handle,
          status: "excluded",
        });
        continue;
      }
      const parsed = parseSocialUrl(params.platform, row.url_or_handle);
      if (!parsed.ok) {
        results.push({
          contact_id: null,
          handle: null,
          url_or_handle: row.url_or_handle,
          status: "invalid_url",
        });
        continue;
      }
      const existing = await this.get_social_tracking_by_handle({
        platform: params.platform,
        handle: parsed.handle,
      });
      if (existing) {
        if (!existing.tracked) {
          await this.set_social_tracking({
            id: existing.contact_id,
            platform: params.platform,
            tracked: true,
          });
        }
        results.push({
          contact_id: existing.contact_id,
          handle: existing.handle,
          url_or_handle: row.url_or_handle,
          status: "tracked",
        });
        continue;
      }
      const rowClientId = params.client_id
        ? await this.util.uuid_v5(params.client_id, `contacts.batch_track_social:${String(i)}`)
        : undefined;
      const contact = await this.create({
        name: row.name ?? parsed.handle,
        client_id: rowClientId,
      });
      await this.set_social_tracking({
        id: contact.id,
        platform: params.platform,
        tracked: true,
        handle: parsed.handle,
      });
      created += 1;
      results.push({
        contact_id: contact.id,
        handle: parsed.handle,
        url_or_handle: row.url_or_handle,
        status: "created",
      });
    }

    return { results, total: profiles.length, created, excluded: excludedCount };
  }

  // DEC-4 (INV-7): compare-and-set rename — a contact auto-created from a URL
  // carries its handle as a placeholder name; the first profile ingest upgrades
  // it to the real display name ONLY while the placeholder is still in place.
  // Internal RPC (never an agent tool).
  @rpc("rename_if_placeholder")
  async rename_if_placeholder(params: RenameIfPlaceholderParams): Promise<{ renamed: boolean }> {
    const entity = await this.graph.get_entity(params.id);
    if (entity?.schema_id !== SCHEMA) return { renamed: false };
    if (entity.name !== params.expected_name) return { renamed: false };
    if (!params.new_name.trim() || params.new_name === params.expected_name) {
      return { renamed: false };
    }
    await this.graph.update_entity_name(params.id, params.new_name);
    return { renamed: true };
  }

  @tool("get_social_tracking_by_handle", {
    description:
      "Resolve which contact tracks a given X / LinkedIn handle and whether tracking " +
      "is currently on. Case-insensitive. Returns null when no contact has the handle.",
    params: {
      type: "object",
      properties: {
        platform: { type: "string", enum: ["x", "linkedin"] },
        handle: { type: "string" },
      },
      required: ["platform", "handle"],
      additionalProperties: false,
    },
  })
  async get_social_tracking_by_handle(
    params: GetSocialTrackingByHandleParams,
  ): Promise<SocialTrackingByHandle | null> {
    const want = params.handle.trim().toLowerCase();
    if (!want) return null;
    const handleKey = params.platform === "x" ? "x_handle" : "linkedin_handle";
    const trackedKey = params.platform === "x" ? "tracked_x" : "tracked_linkedin";

    // Page through persons + batch-read facets (no N+1). Personal-CRM scale;
    // the latest contacts.person.social facet per person wins (attach order).
    const PAGE = 500;
    for (let offset = 0; ; offset += PAGE) {
      const page = await this.graph.list_entities({ schema_id: SCHEMA, limit: PAGE, offset });
      if (page.items.length === 0) return null;
      const facets = await this.graph.list_facets_for_entities(page.items.map((e) => e.id));
      const latestFacetByEntity = new Map<string, FacetRecord>();
      for (const f of facets) {
        if (f.schema_id !== SOCIAL_FACET || !f.entity_id) continue;
        const cur = latestFacetByEntity.get(f.entity_id);
        if (!cur || facetTime(f) > facetTime(cur)) latestFacetByEntity.set(f.entity_id, f);
      }
      const latestByEntity = new Map<string, SocialTracking>();
      for (const [eid, f] of latestFacetByEntity) {
        latestByEntity.set(eid, f.data as SocialTracking);
      }
      for (const [entityId, social] of latestByEntity) {
        const stored = social[handleKey]?.trim();
        if (stored?.toLowerCase() === want) {
          return { contact_id: entityId, tracked: social[trackedKey] === true, handle: stored };
        }
      }
      if (offset + PAGE >= page.total) return null;
    }
  }

  @tool("list_social_tracking", {
    description:
      "List every contact with social tracking ON for a platform (X / LinkedIn): " +
      "contact id, name and tracked handle. Feeds pending 'Syncing' rows in the " +
      "platform modules.",
    params: {
      type: "object",
      properties: { platform: { type: "string", enum: ["x", "linkedin"] } },
      required: ["platform"],
      additionalProperties: false,
    },
  })
  async list_social_tracking(params: {
    platform: SocialPlatform;
  }): Promise<{ contact_id: string; name: string; handle: string }[]> {
    const handleKey = params.platform === "x" ? "x_handle" : "linkedin_handle";
    const trackedKey = params.platform === "x" ? "tracked_x" : "tracked_linkedin";
    const out: { contact_id: string; name: string; handle: string }[] = [];
    // Same paged scan as get_social_tracking_by_handle: latest social facet
    // per person wins (runtime returns facets NEWEST-FIRST — never trust
    // append order).
    const PAGE = 500;
    for (let offset = 0; ; offset += PAGE) {
      const page = await this.graph.list_entities({ schema_id: SCHEMA, limit: PAGE, offset });
      if (page.items.length === 0) break;
      const facets = await this.graph.list_facets_for_entities(page.items.map((e) => e.id));
      const latestFacetByEntity = new Map<string, FacetRecord>();
      for (const f of facets) {
        if (f.schema_id !== SOCIAL_FACET || !f.entity_id) continue;
        const cur = latestFacetByEntity.get(f.entity_id);
        if (!cur || facetTime(f) > facetTime(cur)) latestFacetByEntity.set(f.entity_id, f);
      }
      for (const [entityId, f] of latestFacetByEntity) {
        const social = f.data as SocialTracking;
        const handle = social[handleKey]?.trim();
        if (social[trackedKey] === true && handle) {
          const name = page.items.find((e) => e.id === entityId)?.name ?? handle;
          out.push({ contact_id: entityId, name, handle });
        }
      }
      if (offset + PAGE >= page.total) break;
    }
    return out;
  }

  @tool("get_social_tracking", {
    description: "Get a contact's social-tracking opt-in state (X / LinkedIn) and handles.",
    params: {
      type: "object",
      properties: { id: { type: "string", format: "uuid" } },
      required: ["id"],
      additionalProperties: false,
    },
  })
  async get_social_tracking(params: GetParams): Promise<SocialTracking> {
    return this.readSocialTracking(params.id);
  }

  // Latest contacts.person.social facet for an entity, or {} when the contact
  // has never been tracked. The runtime returns facets NEWEST-FIRST (`ORDER BY
  // observed_at DESC`) — pick max(observed_at) explicitly, never a list end
  // (live bug 2026-07-02: picking the OLDEST facet resurrected tracked=true on
  // every toggle, so Untrack never stopped the scheduler fetching).
  private async readSocialTracking(id: string): Promise<SocialTracking> {
    const facets = await this.graph.list_facets_for_entity(id);
    const latest = latestSocialFacet(facets);
    return ((latest?.data as SocialTracking | undefined) ?? {}) satisfies SocialTracking;
  }
}
