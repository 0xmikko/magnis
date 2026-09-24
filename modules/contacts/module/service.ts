// Contacts plugin — backend module (V8). Decorated class; the
// read path (list/get) mirrors the legacy Rust ContactsModuleService.

import { reachedEndpoints, removeUnseenSourceReplicas, rpc, searchEntitiesPage, syncComplete, syncHandler, tool, writeTool, type GraphService, type PluginDeps, type PluginUtil, type RawEntity, type RpcExecutor } from "@magnis/plugin-sdk";
import type {
  BatchEntityInput,
  GetParams,
  MergePreview,
  MergeResult,
  PaginatedResponse,
} from "@magnis/plugin-sdk";
import type {
  BatchCreateParams,
  BatchCreateResult,
  BatchCreateRow,
  ContactDetailView,
  ContactListItem,
  ContactsListParams,
  CreateParams,
  LinkedEntitySummary,
  MergeParams,
  MergePreviewParams,
  SearchParams,
  SearchResultItem,
  GetSocialTrackingByHandleParams,
  SocialTrackingByHandle,
  RenameIfPlaceholderParams,
  SocialTracking,
  ToolResult,
  UpdateParams,
  ContactsSyncEnvelope,
  GoogleContactPayload,
} from "../types.ts";
import {
  buildListItem,
  computeInitials,
  INGEST_CHUNK,
  composeChannels,
  pickAvatarColor,
  replicaDict,
} from "./helpers.ts";
import {
  CONTACT,
  GOOGLE_CONTACT,
} from "../schema.ts";
import { addressBatchEntity } from "../../email/schema.ts";

/**
 * Bulk message records. A contact's replicas sit on one edge per message ever
 * addressed to them, and those are read through the owning module's own paging
 * surface rather than inherited by the hub. See the note in `get`.
 */
const MESSAGE_SCHEMAS = new Set(["email.message", "telegram.message"]);

const CONTACT_CREATE_PARAMS = {
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
};

const CONTACT_MERGE_PARAMS = {
      type: "object",
      properties: {
        survivor_id: { type: "string", format: "uuid" },
        retired_id: { type: "string", format: "uuid" },
        overrides: {
          type: "array",
          items: {
            type: "object",
            properties: {
              key: { type: "string" },
              // Canonical override values are scalars (name, email, phone…).
              // An explicit type union is REQUIRED: an empty `{}` schema is
              // rejected by OpenAI strict function-calling and 400s the whole
              // turn for every subscription/OpenAI-backed builtin chat.
              value: { type: ["string", "number", "boolean", "null"] },
            },
            required: ["key", "value"],
          },
        },
        reason: { type: "string" },
      },
      required: ["survivor_id", "retired_id"],
      additionalProperties: false,
    };

export class ContactsModule {
  private readonly graph: GraphService;
  private readonly util: PluginUtil;
  private readonly rpc: RpcExecutor;
  constructor(deps: PluginDeps) {
    this.graph = deps.graph;
    this.util = deps.util;
    this.rpc = deps.rpc;
  }

  @rpc("list", {
    description: "List contacts with pagination and optional name search.",
    params: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1 },
        offset: { type: "integer", minimum: 0 },
        search: { type: "string" },
        // Retired with the tier it filtered on; still accepted so a stored
        // agent call or an older client is not a hard error.
        include_all: { type: "boolean" },
      },
      additionalProperties: false,
    },
  })
  async list(params: ContactsListParams): Promise<PaginatedResponse<ContactListItem>> {
    const limit = params.limit ?? 100;
    const offset = params.offset ?? 0;
    const search = (params.search ?? "").trim();

    let rows: { id: string; schema_id: string; name: string; created_at?: string; is_pinned?: boolean | null }[];
    let total: number;
    if (search) {
      // Shared paging helper (2026-07-03): the old limit+offset fetch truncated
      // `total` to the visible window → hasMore never fired → infinite scroll
      // was dead in search mode (surfaced at 1000+ contacts).
      const page = await searchEntitiesPage(this.graph, {
        query: search,
        schema_id: CONTACT,
        limit,
        offset,
      });
      total = page.total;
      rows = page.entities;
    } else {
      // The Telegram "group"-tier filter retired with the archive that
      // held the tier: nothing has written `relevance_tier` since the fold,
      // so `include_all` no longer changes what the list shows. The
      // parameter stays on the wire until the clients drop it.
      const page = await this.graph.list_entities({
        schema_id: CONTACT,
        limit,
        offset,
        order: "idx",
      });
      rows = page.items;
      total = page.total;
    }

    // S6: the page hydrates from the hub's own DICTIONARY (it rides the rows)
    // plus its `identity` EDGES — the email and the channel badges are nodes
    // the hub reaches, so the edges are the answer. One batch read for the
    // whole page, no per-row N+1.
    const ids = rows.map((e) => e.id);
    const identityById = await this.identityNeighboursByEntity(ids);
    const items = rows.map((e) => buildListItem(e, identityById.get(e.id) ?? []));
    return { items, total, limit, offset };
  }

  @rpc("get")
  @tool("get", {
    entity: "contacts.person",
    description: "Get a full contact detail view (dictionary, links) by id.",
    params: {
      type: "object",
      properties: { id: { type: "string", format: "uuid" } },
      required: ["id"],
      additionalProperties: false,
    },
  })
  async get(params: GetParams): Promise<ContactDetailView> {
    // Entity + link edges in ONE fetch (user-scoped → null for a non-owner
    // or wrong schema); link neighbours resolved in ONE get_entities batch.
    const detail = await this.graph.get_entity_full(params.id, { links: true });
    if (detail?.entity.schema_id !== CONTACT) {
      throw new Error(`contact not found: ${params.id}`);
    }
    const { entity: e, links } = detail;

    // P2b: a contact is a hub, and the hub is empty. `identity` replaced the
    // facet model — the replicas (the address node, the source replicas, the
    // accounts) carry the edges, so THEIR links are read as the hub's own.
    // Two hops, not transitive, because that is how a contact is shaped.
    // @tested-by: tst_mod_contacts_001
    // @invariant: everything incident to a replica is the hub's linked entity,
    // except the hub itself — the replicas link back to it, and a hub is not
    // its own linked entity — and its replicas' message traffic, dropped by the
    // filter below (INV-P2b.4, as amended).
    const identityIds = [
      ...new Set(
        links.filter((l) => l.kind === "identity" && l.from_id === e.id).map((l) => l.to_id),
      ),
    ];
    const replicaSet = new Set(identityIds);
    const replicaLinks =
      identityIds.length === 0 ? [] : await this.graph.list_links_for_entities(identityIds);

    // The hub's own edges first, so its own labels win, then the replicas'.
    // Deduped by endpoint; the hub itself excluded.
    const reached = reachedEndpoints(
      [
        { links, ownerIds: new Set([e.id]) },
        { links: replicaLinks, ownerIds: replicaSet },
      ],
      new Set([e.id]),
    );

    // ONE batch over the hub's endpoints ∪ the replicas', whatever the count.
    const neighbours = new Map<string, RawEntity & { created_at?: string }>();
    const reachedIds = [...reached.keys()];
    if (reachedIds.length > 0) {
      for (const t of await this.graph.get_entities(reachedIds)) neighbours.set(t.id, t);
    }

    const linked: LinkedEntitySummary[] = [];
    for (const [id, kind] of reached) {
      const t = neighbours.get(id);
      if (!t) continue;
      // The hub does not inherit its replicas' message traffic (INV-P2b.4, as
      // amended). A shared `email.address` is on the far side of one edge per
      // message ever sent to it, so a real mailbox would put thousands of rows
      // in this response. The host skips `telegram.message` when grouping but
      // NOT `email.message` (`entityTabUtils.ts:65`), so those would also draw
      // a card per message in an Email tab on the contact's page. Messages are
      // read through the Email and Telegram surfaces, which page. Every other
      // endpoint is returned, including a company that shares the address.
      if (MESSAGE_SCHEMAS.has(t.schema_id)) continue;
      linked.push({
        id: t.id,
        name: t.name,
        schema_id: t.schema_id,
        link_kind: kind,
        created_at: t.created_at ?? new Date(0).toISOString(),
        data: null,
      });
    }

    // S6: the base card reads the hub's dictionary plus the identity
    // neighbours the detail already resolved — no canonical read.
    const identityNeighbours = links
      .filter((l) => l.kind === "identity" && l.from_id === e.id)
      .map((l) => neighbours.get(l.to_id))
      .filter((n): n is RawEntity & { created_at?: string } => n !== undefined);
    const base = buildListItem(e, identityNeighbours);

    // ── S3 (§5.1): the card is composed at read time ────────────────────
    // Curated claims = the hub's dictionary. Source claims = the replica
    // dictionaries one identity hop away. Emails = shared email.address
    // nodes. Phones = curated ∪ replica, deduped by normalised value,
    // labeled by origin. No propagation step exists to forget.
    const curated: Record<string, unknown> = e.properties ?? {};
    const emails: { id: string; address: string }[] = [];
    const replicas: ContactDetailView["replicas"] = [];
    for (const id of identityIds) {
      const t = neighbours.get(id);
      if (!t) continue;
      if (t.schema_id === "email.address") {
        emails.push({ id: t.id, address: t.name });
      } else if (t.schema_id !== CONTACT) {
        replicas.push({
          id: t.id,
          schema_id: t.schema_id,
          name: t.name,
          properties: ((t as { properties?: unknown }).properties ?? {}) as Record<
            string,
            unknown
          >,
        });
      }
    }
    const phones: ContactDetailView["phones"] = [];
    const seenPhone = new Set<string>();
    const pushPhone = (phone: unknown, type: unknown, origin: string): void => {
      if (typeof phone !== "string" || phone.length === 0) return;
      const norm = phone.replace(/[^0-9+]/gu, "");
      if (seenPhone.has(norm)) return;
      seenPhone.add(norm);
      phones.push({ phone, type: typeof type === "string" ? type : null, origin });
    };
    if (Array.isArray(curated.phones)) {
      for (const p of curated.phones as { phone?: unknown; type?: unknown }[]) {
        pushPhone(p.phone, p.type, "curated");
      }
    }
    for (const r of replicas) {
      const source = r.schema_id === GOOGLE_CONTACT ? "google" : r.schema_id;
      if (Array.isArray(r.properties.phones)) {
        for (const p of r.properties.phones as { number?: unknown; label?: unknown }[]) {
          pushPhone(p.number, p.label, source);
        }
      }
    }

    // Single-value picks stay deterministic: curated wins, else the
    // composed sections (first address / first phone / first replica org).
    const firstOrg = replicas
      .flatMap((r) =>
        Array.isArray(r.properties.organizations)
          ? (r.properties.organizations as { name?: unknown; title?: unknown }[])
          : [],
      )
      .find((o) => typeof o.name === "string" || typeof o.title === "string");

    return {
      id: e.id,
      schema_id: e.schema_id,
      name: base.name,
      email: emails[0]?.address ?? base.email,
      phone: phones[0]?.phone ?? base.phone,
      role:
        base.role ?? (typeof firstOrg?.title === "string" ? firstOrg.title : null),
      company:
        base.company ?? (typeof firstOrg?.name === "string" ? firstOrg.name : null),
      channels: composeChannels(curated, emails.length > 0, replicas),
      avatar_color: pickAvatarColor(e.id),
      initials: computeInitials(base.name),
      // S6: the canonical block is empty by construction — nothing resolves
      // into it any more, and the DTO keeps the field only until the wire
      // shape drops it.
      canonical: {},
      linked_entities: linked,
      created_at: base.created_at,
      curated,
      emails,
      phones,
      replicas,
    };
  }

  // ── read helpers (batch hydration + single-entity write-path shaping) ──
  /// Every hub's `identity` neighbours for a whole page: ONE batch edge read
  /// plus ONE batch entity read (S6). The channels and the email address are
  /// nodes the hub reaches, so a card cannot be built without them.
  private async identityNeighboursByEntity(ids: string[]): Promise<Map<string, RawEntity[]>> {
    const out = new Map<string, RawEntity[]>();
    if (ids.length === 0) return out;
    const owned = new Set(ids);
    const edges = (await this.graph.list_links_for_entities(ids)).filter(
      (l) => l.kind === "identity" && owned.has(l.from_id),
    );
    if (edges.length === 0) return out;
    const targets = await this.graph.get_entities([...new Set(edges.map((l) => l.to_id))]);
    const byId = new Map(targets.map((t) => [t.id, t]));
    for (const edge of edges) {
      const target = byId.get(edge.to_id);
      if (!target) continue;
      const arr = out.get(edge.from_id) ?? [];
      arr.push(target);
      out.set(edge.from_id, arr);
    }
    return out;
  }

  // Single-entity list-item shaping for the WRITE paths (create/update return
  // values) — the node it just wrote and its identity edges. Not the hot read
  // path (no N+1 loop).
  private async listItemFor(
    entity: { id: string; schema_id: string; name: string; created_at?: string; is_pinned?: boolean | null },
  ): Promise<ContactListItem> {
    const fresh = await this.graph.get_entity(entity.id);
    const node = fresh ?? { ...entity, properties: {} };
    const identity = await this.identityNeighboursByEntity([entity.id]);
    return buildListItem(
      { ...node, ...entity, properties: node.properties ?? {} },
      identity.get(entity.id) ?? [],
    );
  }

  // Mirrors the native ContactsModuleController::create_single_contact
  // graph writes (controller.rs:43-211). The `email.address` entity +
  // `has_email` link are created via the cross-module RPC hub:
  // contacts asks the `email` module to ensure the address entity, then
  // links it — contacts never writes the foreign `email.address` schema
  // itself. `params` is agent-facing: it omits `client_id` so the
  // agent never invents an id; the handler still accepts it from the
  // frontend WS path via CreateParams.
  async create(params: CreateParams): Promise<ContactListItem & { fields: Record<string, unknown> }>;
  async create(params: BatchCreateParams): Promise<BatchCreateResult>;
  @rpc("create")
  @writeTool("create", {
    entity: "contacts.person",
    description:
      "Create one contact or a batch of contacts.",
    params: { oneOf: [CONTACT_CREATE_PARAMS, {
      type: "object",
      properties: {
        contacts: {
          type: "array",
          items: CONTACT_CREATE_PARAMS,
          minItems: 1,
          maxItems: 50,
        },
        excluded_indices: { type: "array", items: { type: "integer", minimum: 0 } },
      },
      required: ["contacts"],
      additionalProperties: false,
    }] },
  })
  async create(params: CreateParams | BatchCreateParams): Promise<(ContactListItem & { fields: Record<string, unknown> }) | BatchCreateResult> {
    if ("contacts" in params) {
      if ("name" in params) throw new Error("Supply a contact or contacts, not both");
      return this.batch_create(params);
    }
    return this.createSingle(params);
  }

  private async createSingle(params: CreateParams): Promise<ContactListItem & { fields: Record<string, unknown> }> {
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
      schema_id: CONTACT,
      name: params.name,
      client_id: params.client_id,
      idx: params.name.toLowerCase(),
    });
    // S3: the hub dict takes the curated claims. The
    // email becomes an identity edge to the shared address node below.
    const curated: Record<string, unknown> = {};
    if (params.phone) {
      curated.phones = [{ phone: params.phone, type: null, is_primary: true }];
    }
    if (params.role) curated.role = params.role;
    if (params.company) curated.company = params.company;
    if (Object.keys(curated).length > 0) {
      await this.graph.update_properties({ entity_id: entity.id, properties: curated });
    }

    // Hub: ask the email module to ensure the email.address entity, then
    // join them with an identity edge (S3: has_email retired — an address IS
    // an identity channel of the person).
    let email_address_entity_id: string | null = null;
    if (params.email) {
      try {
        const addr = await this.rpc.execute<{ id: string }>("email.ensure_address", {
          address: params.email,
        });
        email_address_entity_id = addr.id;
        await this.graph.add_link({ from_id: entity.id, to_id: addr.id, kind: "identity" });
      } catch {
        // Parity with native controller.rs:167 — warn-and-continue. On the
        // single-runtime path (no host AppState) the email hub is unavailable;
        // the contact + its email node still persist, just without the
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
  // create(), inheriting the same dictionary writes AND the email.address +
  // has_email hub path when a row carries an email.
  @rpc("batch_create")
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

    for (const [i, c] of contacts.entries()) {
      if (excluded.has(i)) {
        excludedCount += 1;
        results.push({ id: null, name: c.name, status: "excluded" });
        continue;
      }
      const rowClientId = params.client_id
        ? await this.util.uuid_v5(params.client_id, `contacts.batch_create:${String(i)}`)
        : undefined;
      const item = await this.createSingle({
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
  // rename the entity and rewrite first_name on the replica. The
  // update_entity_name op is ownership-checked.
  @rpc("update")
  @writeTool("update", {
    entity: "contacts.person",
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
      // S3: the name vouch lives on the entity row alone.
      await this.graph.update_entity_name(params.id, params.name);
    }

    const fresh = await this.graph.get_entity(params.id);
    return this.listItemFor(fresh ?? existing);
  }

  // Read-only merge preview (controller.rs:631). Ownership is enforced
  // backend-side in the op.
  @rpc("merge_preview", {
    description: "Preview merging two contacts: which links move and which dictionary keys conflict.",
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

  // Merge two contacts (controller.rs:656): transfer links from
  // retired to survivor, delete retired, then re-derive the survivor's
  // name/idx from the resolved canonicals (first_name [+ last_name]).
  @writeTool("merge", {
    entity: "contacts.person",
    description: "Preview or merge contacts, preserving the resolved name.",
    params: { ...CONTACT_MERGE_PARAMS,
      properties: { ...CONTACT_MERGE_PARAMS.properties, preview: { type: "boolean" } },
      required: [...CONTACT_MERGE_PARAMS.required, "preview"],
    },
  })
  @rpc("merge", {
    description:
      "Merge two contacts into one. Transfers all links and history from " +
      "retired to survivor, then deletes retired.",
    params: CONTACT_MERGE_PARAMS,
  })
  async merge(params: MergeParams & { preview?: boolean }): Promise<MergeResult | MergePreview> {
    for (const id of [params.survivor_id, params.retired_id]) {
      const entity = await this.graph.get_entity(id);
      if (entity?.schema_id !== CONTACT) throw new Error(`contact not found: ${id}`);
    }
    if (params.preview === true) return this.merge_preview(params);
    const result = await this.graph.merge_execute({
      survivor_id: params.survivor_id,
      retired_id: params.retired_id,
      overrides: params.overrides,
      reason: params.reason,
    });

    // S6: re-derive entity name/idx from the survivor's merged DICTIONARY —
    // the canonical map is dead and would always read empty here, silently
    // skipping the rename.
    const merged = await this.graph.get_entity(params.survivor_id);
    const dict = merged?.properties ?? {};
    const first = dict.first_name;
    if (typeof first === "string" && first.length > 0) {
      const last = dict.last_name;
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
  @rpc("search", {
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
      schema_ids: [CONTACT],
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
  // external_link replicas, all in ONE atomic graph.apply_batch per chunk.
  //
  // Idempotency: the entity key AND the anchors are the envelope
  // `remote_id` (`gpeople:{stable_id}`), so re-ingesting the same contact
  // upserts on that key — no duplicate entity (apply_batch resolves-or-creates
  // by anchor, like email's message ingest).
  @syncHandler("contacts")
  async ingest(params: {
    envelopes?: ContactsSyncEnvelope[];
    command?: "bootstrap" | "catch_up" | "backfill";
    /** The pass the worker is in; absent for a Source effect outside a
     * worker, which states nothing. */
    generation?: string;
  }): Promise<{
    dropped_remote_ids: string[];
    trigger_checks: [];
    plan?: Record<string, { total: number; skipped: number }>;
  }> {
    const envelopes = Array.isArray(params.envelopes) ? params.envelopes : [];
    const dropped: string[] = [];
    // What the page states for the plan, as the People API counts the list:
    // the whole of it on the list envelope that opens a pass, and the persons
    // a page left out as skipped.
    // @tested-by: tst_module_contacts_plan_001
    const stated = typeof params.generation === "string" && params.generation !== "";
    const fullPass = params.command === "bootstrap";
    const plan = { total: 0, skipped: 0 };

    // Fold by remote_id so two envelopes for the same resourceName collapse to
    // ONE entity in the batch (last-write-wins on payload). Native parity: an
    // envelope with no owning user is skipped — the dispatcher couldn't resolve
    // user_id, so we cannot user-scope the write.
    const byRemoteId = new Map<string, ContactsSyncEnvelope>();
    for (const env of envelopes) {
      if (!env.user_id) continue;
      if (env.kind === "delete") {
        if (await this.deleteGoogleReplica(env) && stated && !fullPass) plan.total -= 1;
        continue;
      }
      if (env.kind !== "snapshot" && env.kind !== "live") continue;
      if (!env.remote_id) continue;
      if (env.payload?.entity_type === "list") {
        const total = env.payload.total_people;
        const skipped = env.payload.skipped;
        if (typeof total === "number" && stated && fullPass) plan.total += total;
        if (typeof skipped === "number" && stated && fullPass) plan.skipped += skipped;
        continue;
      }
      byRemoteId.set(env.remote_id, env);
    }

    let chunk: ContactsSyncEnvelope[] = [];
    const flush = async (): Promise<void> => {
      if (chunk.length > 0) {
        plan.total += await this.ingestContactBatch(chunk, params.generation, fullPass);
        await Promise.resolve(); // yield so waiting RPCs get the connection
      }
      chunk = [];
    };
    for (const env of byRemoteId.values()) {
      if (chunk.length >= INGEST_CHUNK) await flush();
      chunk.push(env);
    }
    await flush();

    if (!stated) return { dropped_remote_ids: dropped, trigger_checks: [] };
    return { dropped_remote_ids: dropped, trigger_checks: [], plan: { [GOOGLE_CONTACT]: plan } };
  }

  /** @tested-by: tst_module_google_002 */
  private async deleteGoogleReplica(env: ContactsSyncEnvelope): Promise<boolean> {
    if (!env.remote_id) return false;
    const id = await this.graph.find_by_anchor(env.remote_id);
    if (!id) return false;
    const replica = await this.graph.get_entity(id);
    if (replica?.schema_id !== GOOGLE_CONTACT || replica.properties?.source_id !== env.source_id || replica.properties?.account_id !== env.account_id) return false;
    await this.graph.delete_entity(id);
    return true;
  }

  /** The host calls this only after the complete replacement pass. Never
   * delete a curated person hub; only this account's Google replicas depart.
   * @tested-by: tst_module_google_002 */
  @syncComplete()
  async onSyncComplete(params: { source_id: string; account_id: string; generation: string }): Promise<{
    departed: string[];
    plan: Record<string, { total: number; skipped: number }>;
  }> {
    if (!params.source_id || !params.account_id || !params.generation) {
      throw new Error("contacts sync complete requires source, account and generation");
    }
    await removeUnseenSourceReplicas(this.graph, GOOGLE_CONTACT, params.source_id, params.account_id, params.generation);
    return { departed: [], plan: { [GOOGLE_CONTACT]: { total: 0, skipped: 0 } } };
  }

  /// One chunk → one apply_batch. Each contact becomes a Google replica
  /// anchored on its stable resourceName-derived remote_id.
  private async ingestContactBatch(envelopes: ContactsSyncEnvelope[], generation: string | undefined, fullPass: boolean): Promise<number> {
    // 1. Fold envelopes into rows: payload + its lowercased addresses.
    interface Row {
      remoteId: string;
      p: GoogleContactPayload;
      addresses: string[];
      sourceId: string;
      accountId: string;
    }
    const rows: Row[] = [];
    for (const env of envelopes) {
      const remoteId = env.remote_id;
      if (!remoteId) continue;
      if (!env.source_id || !env.account_id) throw new Error("contacts ingest requires source and account");
      const p = (env.payload ?? {}) as GoogleContactPayload;
      const addresses = [
        ...new Set(
          (p.emails ?? [])
            .map((e) => (typeof e.address === "string" ? e.address.trim().toLowerCase() : ""))
            .filter((a) => a.length > 0),
        ),
      ];
      rows.push({ remoteId, p, addresses, sourceId: env.source_id, accountId: env.account_id });
    }
    if (rows.length === 0) return 0;

    const deltaAnchors = generation && !fullPass ? rows.map((row) => row.remoteId) : [];
    const known = deltaAnchors.length > 0 ? await this.graph.find_by_anchors(deltaAnchors) : [];
    const existing = new Set(deltaAnchors.filter((_, index) => known[index]));

    // 2. Address nodes and contact replicas share the sync transaction.
    // @tested-by: tst_module_contacts_ingest_002
    const allAddresses = [...new Set(rows.flatMap((r) => r.addresses))];
    const addressEntities = allAddresses.map((address) => addressBatchEntity(`addr:${address}`, address, null));

    // 3. Replica nodes (plan §5): fields-as-last-synced dictionaries,
    // anchored by the stable remote_id — ONE batch, and the sync
    // never writes the hub again.
    const entities: BatchEntityInput[] = [...addressEntities, ...rows.map(({ remoteId, p, sourceId, accountId }) => {
      const name = typeof p.display_name === "string" ? p.display_name : "";
      return {
        key: remoteId,
        schema_id: GOOGLE_CONTACT,
        name,
        idx: name.toLowerCase() || undefined,
        anchor: remoteId,
        properties: { ...replicaDict(p), source_id: sourceId, account_id: accountId, ...(generation ? { sync_pass: generation } : {}) },
      };
    })];
    const batch = await this.graph.apply_batch({ entities, refs: [], links: [] });
    const addressId = new Map(allAddresses.map((address) => {
      const id = batch.ids[`addr:${address}`];
      if (!id) throw new Error(`contacts ingest: address ${address} was not resolved`);
      return [address, id] as const;
    }));
    const created = deltaAnchors.filter((anchor) => !existing.has(anchor) && batch.ids[anchor]).length;

    // 4. Auto-attach (plan §5.2): attach / mint / merge-candidate, on
    // identity-grade anchors only. Fuzzy name matching is never automatic.
    for (const row of rows) {
      const replicaId = batch.ids[row.remoteId];
      if (!replicaId) continue;
      const addrIds = row.addresses
        .map((a) => addressId.get(a))
        .filter((id): id is string => typeof id === "string");
      await this.attachReplica(replicaId, row.remoteId, row.p, addrIds);
    }
    return created;
  }

  /// The three outcomes, in order (plan §5.2 + the S3 legacy probe):
  /// already-attached (re-sync) → done; exactly one hub holds identity to a
  /// shared address → attach; none → probe the legacy fleet by the hashed
  /// anchor, else mint a hub (name vouch, empty dictionary);
  /// several → mint a separate hub and record merge-candidate rows —
  /// ambiguity is a human decision, not a guess.
  private async attachReplica(
    replicaId: string,
    remoteId: string,
    p: GoogleContactPayload,
    addrIds: string[],
  ): Promise<void> {
    // Re-sync short-circuit: the replica already has its hub.
    const replicaLinks = await this.graph.list_links_for_entity(replicaId);
    if (replicaLinks.some((l) => l.kind === "identity" && l.to_id === replicaId)) {
      return;
    }

    // Hubs holding identity edges to any shared address. Companies hold
    // identity edges to addresses too — filter to persons.
    const candidates = new Set<string>();
    for (const addrId of addrIds) {
      const links = await this.graph.list_links_for_entity(addrId);
      for (const l of links) {
        if (l.kind === "identity" && l.to_id === addrId) candidates.add(l.from_id);
      }
    }
    let hubs: string[] = [];
    if (candidates.size > 0) {
      const found = await this.graph.get_entities([...candidates]);
      hubs = found.filter((e) => e.schema_id === CONTACT).map((e) => e.id);
    }

    let hubId: string | null = null;
    let mergeCandidates: string[] = [];
    if (hubs.length === 1) {
      hubId = hubs[0] ?? null;
    } else if (hubs.length > 1) {
      mergeCandidates = hubs;
    }

    if (hubId === null) {
      // Mint: the name vouch and an empty dictionary — the card composes
      // everything else from the replica at read time.
      const firstAddress = (p.emails ?? []).find(
        (e) => typeof e.address === "string" && e.address.length > 0,
      )?.address;
      const name =
        (typeof p.display_name === "string" && p.display_name.length > 0
          ? p.display_name
          : undefined) ??
        firstAddress ??
        "Contact";
      const hub = await this.graph.create_entity({
        schema_id: CONTACT,
        name,
        idx: name.toLowerCase(),
      });
      hubId = hub.id;
      // Several hubs claimed one address: record the ambiguity for a human.
      for (const other of mergeCandidates) {
        await this.graph.add_link({
          from_id: hubId,
          to_id: other,
          kind: "same_as",
          status: "candidate",
          declared_by: remoteId,
        });
      }
    }

    // The edges: hub → replica, hub → each shared address. Idempotent at the
    // graph layer (re-sync never duplicates an identity edge).
    await this.graph.add_link({
      from_id: hubId,
      to_id: replicaId,
      kind: "identity",
      declared_by: remoteId,
    });
    for (const addrId of addrIds) {
      await this.graph.add_link({
        from_id: hubId,
        to_id: addrId,
        kind: "identity",
        declared_by: remoteId,
      });
    }
  }

  // Compare-and-set rename — a contact auto-created from a URL
  // carries its handle as a placeholder name; the first profile ingest upgrades
  // it to the real display name ONLY while the placeholder is still in place.
  // Internal RPC (never an agent tool).
  @rpc("rename_if_placeholder")
  async rename_if_placeholder(params: RenameIfPlaceholderParams): Promise<{ renamed: boolean }> {
    const entity = await this.graph.get_entity(params.id);
    if (entity?.schema_id !== CONTACT) return { renamed: false };
    if (entity.name !== params.expected_name) return { renamed: false };
    if (!params.new_name.trim() || params.new_name === params.expected_name) {
      return { renamed: false };
    }
    await this.graph.update_entity_name(params.id, params.new_name);
    return { renamed: true };
  }

  // Search-plan stage First: the tracked hubs, straight from the FILTERED
  // window — only dictionaries that carry `tracking` come back, so the walk
  // is bounded by the tracked set, not by the address book. The old paged
  // full scans read every person 500 at a time.
  private async trackedHubs(): Promise<RawEntity[]> {
    const PAGE = 500;
    const out: RawEntity[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const page = await this.graph.list_entities_window({
        schema: CONTACT,
        filter_field: { property_path: "tracking" },
        filter_op: "exists",
        limit: PAGE,
        offset,
      });
      for (const row of page.items) out.push(row.entity);
      if (page.items.length === 0 || offset + page.items.length >= page.total) break;
    }
    return out;
  }

  @rpc("get_social_tracking_by_handle", {
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

    for (const e of await this.trackedHubs()) {
      const entry = trackingEntryOf(e, params.platform);
      if (!entry) continue;
      const stored = entry.handle?.trim();
      if (stored?.toLowerCase() === want) {
        return { contact_id: e.id, tracked: entry.enabled, handle: stored };
      }
    }
    return null;
  }

  @rpc("list_social_tracking", {
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
    platform: GetSocialTrackingByHandleParams["platform"];
  }): Promise<{ contact_id: string; name: string; handle: string }[]> {
    const out: { contact_id: string; name: string; handle: string }[] = [];
    for (const e of await this.trackedHubs()) {
      const entry = trackingEntryOf(e, params.platform);
      const handle = entry?.handle?.trim();
      if (entry?.enabled && handle) {
        out.push({ contact_id: e.id, name: e.name || handle, handle });
      }
    }
    return out;
  }

  @rpc("get_social_tracking", {
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

  // The hub dictionary's tracking view, or {} when the contact has never
  // been tracked (S3: `properties.tracking[]` is the single source).
  private async readSocialTracking(id: string): Promise<SocialTracking> {
    const e = await this.graph.get_entity(id);
    return e ? trackingView(e) : {};
  }
}

/** One `tracking[]` entry of the hub dictionary (plan §7 S3). */
interface TrackingEntry {
  platform: "x" | "linkedin";
  handle?: string | null;
  enabled: boolean;
}

function trackingOf(e: { properties?: unknown }): TrackingEntry[] {
  const props = (e.properties ?? {}) as Record<string, unknown>;
  return Array.isArray(props.tracking) ? (props.tracking as TrackingEntry[]) : [];
}

function trackingEntryOf(
  e: { properties?: unknown },
  platform: "x" | "linkedin",
): TrackingEntry | undefined {
  return trackingOf(e).find((t) => t.platform === platform);
}

/** The wire view the tools speak, derived from the dictionary entries. */
function trackingView(e: { properties?: unknown }): SocialTracking {
  const view: SocialTracking = {};
  for (const t of trackingOf(e)) {
    if (t.platform === "x") {
      view.tracked_x = t.enabled;
      if (t.handle) view.x_handle = t.handle;
    } else {
      view.tracked_linkedin = t.enabled;
      if (t.handle) view.linkedin_handle = t.handle;
    }
  }
  return view;
}
