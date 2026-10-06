// Contacts plugin — backend module (V8). Decorated class; the
// read path (list/get) mirrors the legacy Rust ContactsModuleService.

import { linkedEntitySummary, reachedEndpoints, rpc, searchEntitiesPage, tool, writeTool, type GetParams, type GraphService, type PluginDeps, type PluginUtil, type RpcExecutor, type SetSyncEnabledResult, type SyncTargetResult } from "@magnis/plugin-sdk";
import type {
  Entity,
  EntitySearchHit,
  JsonValue,
  LinkedEntitySummary,
  MergeInput,
  MergePreview,
  MergeResult,
  PaginatedResponse,
  SetSyncEnabledParams,
} from "@magnis/sdk";
import type {
  CompleteXSyncMigrationParams,
  BatchCreateParams,
  BatchCreateResult,
  BatchCreateRow,
  ContactDetailView,
  ContactSyncTarget,
  ContactListItem,
  ContactsListParams,
  CreateParams,
  SearchParams,
  GetSocialTrackingByHandleParams,
  SocialTrackingByHandle,
  RenameIfPlaceholderParams,
  SocialTracking,
  ToolResult,
  UpdateParams,
} from "../types.ts";
import {
  buildListItem,
  computeInitials,
  composeChannels,
  pickAvatarColor,
} from "./helpers.ts";
import { CONTACT } from "../schema.ts";
import { chatExternalId } from "../../telegram/schema.ts";

/**
 * Bulk message records. A contact's replicas sit on one edge per message ever
 * addressed to them, and those are read through the owning module's own paging
 * surface rather than inherited by the hub. See the note in `get`.
 */
const SYNC_IDENTITY_SCHEMAS = new Set(["email.address", "x.profile", "telegram.account"]);

const MESSAGE_SCHEMAS = new Set(["email.message", "telegram.message"]);

/** Contacts sits above email: an address reaches a person from the module
 * that syncs it, never through the hub's create. */
const NO_EMAIL = "contacts.create takes no email: an address reaches a person from the module that syncs it";

const CONTACT_CREATE_PARAMS = {
  type: "object",
  properties: {
    name: { type: "string" },
    phone: { type: "string" },
    company: { type: "string" },
    role: { type: "string" },
  },
  required: ["name"],
  additionalProperties: false,
};

const CONTACT_BATCH_CREATE_PARAMS = {
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
};

/** The frontend names its own ids for an optimistic create; the agent never
 * invents one, so only the rpc() params carry `client_id`. */
const CLIENT_ID_PROPERTY = { client_id: { type: "string", format: "uuid" } };

const CONTACT_CREATE_DESCRIPTION = "Create one contact or a batch of contacts.";

const CONTACT_GET_SPEC = {
  description: "Get a full contact detail view (dictionary, links) by id.",
  params: {
    type: "object",
    properties: { id: { type: "string", format: "uuid" } },
    required: ["id"],
    additionalProperties: false,
  },
};

const CONTACT_UPDATE_SPEC = {
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
};

const CONTACT_MERGE_PARAMS = {
      type: "object",
      properties: {
        survivorId: { type: "string", format: "uuid" },
        retiredId: { type: "string", format: "uuid" },
        preview: { type: "boolean" },
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
        reason: { type: ["string", "null"] },
      },
      required: ["survivorId", "retiredId", "preview", "overrides", "reason"],
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

  @writeTool("setSyncEnabled", {
    entity: "contacts.person",
    description: "Start or stop synchronization for this contact's currently linked email, X and Telegram identities.",
    params: {
      type: "object", properties: { id: { type: "string", format: "uuid" }, syncEnabled: { type: "boolean" } },
      required: ["id", "syncEnabled"], additionalProperties: false,
    },
  })
  async setSyncEnabled(params: SetSyncEnabledParams): Promise<SetSyncEnabledResult> {
    const detail = await this.graph.getEntityFull(params.id, { links: true });
    if (detail?.entity.schemaId !== CONTACT) throw new Error(`contact not found: ${params.id}`);
    const ids = [...new Set(detail.links.filter(link => link.kind === "identity" && link.from === params.id && link.validUntil === null).map(link => link.to))];
    const identities = new Map((ids.length === 0 ? [] : await this.graph.getEntities(ids)).map(row => [row.id, row]));
    const results: SyncTargetResult[] = [];
    for (const identityId of ids) {
      try {
        const identity = identities.get(identityId);
        if (!identity) throw new Error("Linked identity is unavailable");
        if (!SYNC_IDENTITY_SCHEMAS.has(identity.schemaId)) continue;
        const result = await this.rpc.execute<SetSyncEnabledResult>(`${identity.schemaId}.setSyncEnabled`, { id: identityId, syncEnabled: params.syncEnabled });
        if (result.results.length !== 1 || result.results[0]?.identityId !== identityId) throw new Error("Identity owner returned an invalid synchronization result");
        results.push(result.results[0]);
      } catch (error) {
        results.push({ identityId, targetId: null, kind: "failed", message: error instanceof Error ? error.message : String(error) });
      }
    }
    return { results };
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

    let rows: Entity[];
    let total: number;
    if (search) {
      // Shared paging helper (2026-07-03): the old limit+offset fetch truncated
      // `total` to the visible window → hasMore never fired → infinite scroll
      // was dead in search mode (surfaced at 1000+ contacts).
      const page = await searchEntitiesPage(this.graph, {
        query: search,
        schemaId: CONTACT,
        limit,
        offset,
      });
      total = page.total;
      rows = page.items;
    } else {
      // The Telegram "group"-tier filter retired with the archive that
      // held the tier: nothing has written `relevance_tier` since the fold,
      // so `include_all` no longer changes what the list shows. The
      // parameter stays on the wire until the clients drop it.
      const page = await this.graph.listEntities({
        schemaId: CONTACT,
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

  private async syncTarget(identity: Entity): Promise<ContactSyncTarget> {
    const target = { identityId: identity.id, schemaId: identity.schemaId, name: identity.name };
    try {
      let row = identity;
      if (identity.schemaId === "telegram.account") {
        const userId = (identity.properties as Record<string, unknown>).telegram_user_id;
        if (typeof userId !== "number" || !Number.isSafeInteger(userId)) throw new Error("Telegram identity has no provider user ID");
        const id = await this.graph.findByExternalId(chatExternalId(String(userId)));
        if (id === null) throw new Error("Telegram identity has no stored direct chat");
        const chat = await this.graph.getEntity(id);
        if (chat?.schemaId !== "telegram.chat" || (chat.properties as Record<string, unknown>).type !== "private") throw new Error("Telegram identity's stored chat is not a direct chat");
        row = chat;
      }
      if (!("syncEnabled" in row) || typeof row.syncEnabled !== "boolean" || !("syncRevision" in row)
        || typeof row.syncRevision !== "string" || !/^\d+$/.test(row.syncRevision)) throw new Error("Identity target has no saved synchronization choice");
      return { ...target, state: { kind: "ready", id: row.id, syncEnabled: row.syncEnabled, syncRevision: row.syncRevision } };
    } catch (error) {
      return { ...target, state: { kind: "unavailable", message: error instanceof Error ? error.message : String(error) } };
    }
  }

  @rpc("get", CONTACT_GET_SPEC)
  @tool("get", { entity: "contacts.person", ...CONTACT_GET_SPEC })
  async get(params: GetParams): Promise<ContactDetailView> {
    // Entity + link edges in ONE fetch (user-scoped → null for a non-owner
    // or wrong schema); link neighbours resolved in ONE getEntities batch.
    const detail = await this.graph.getEntityFull(params.id, { links: true });
    if (detail?.entity.schemaId !== CONTACT) {
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
        links.filter((l) => l.kind === "identity" && l.from === e.id).map((l) => l.to),
      ),
    ];
    const replicaSet = new Set(identityIds);
    const replicaLinks =
      identityIds.length === 0 ? [] : await this.graph.listLinksForEntities(identityIds);

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
    const neighbours = new Map<string, Entity>();
    const reachedIds = [...reached.keys()];
    if (reachedIds.length > 0) {
      for (const t of await this.graph.getEntities(reachedIds)) neighbours.set(t.id, t);
    }

    const linked: LinkedEntitySummary[] = [];
    for (const [id, reach] of reached) {
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
      if (MESSAGE_SCHEMAS.has(t.schemaId)) continue;
      linked.push(linkedEntitySummary(t, reach.link, reach.linkKind));
    }

    // S6: the base card reads the hub's dictionary plus the identity
    // neighbours the detail already resolved — no canonical read.
    const identityNeighbours = links
      .filter((l) => l.kind === "identity" && l.from === e.id)
      .map((l) => neighbours.get(l.to))
      .filter((n): n is Entity => n !== undefined);
    const base = buildListItem(e, identityNeighbours);
    const syncTargets: ContactSyncTarget[] = [];
    const activeIds = new Set(links.filter(link => link.kind === "identity" && link.from === e.id && link.validUntil === null).map(link => link.to));
    for (const id of activeIds) {
      const identity = neighbours.get(id);
      if (!identity) throw new Error(`Linked identity is unavailable: ${id}`);
      if (SYNC_IDENTITY_SCHEMAS.has(identity.schemaId)) syncTargets.push(await this.syncTarget(identity));
    }

    // ── S3 (§5.1): the card is composed at read time ────────────────────
    // Curated claims = the hub's dictionary. Source claims = the replica
    // dictionaries one identity hop away. Emails = shared email.address
    // nodes. Phones = curated ∪ replica, deduped by normalised value,
    // labeled by origin. No propagation step exists to forget.
    const curated = e.properties as Record<string, unknown>;
    const emails: { id: string; address: string }[] = [];
    const replicas: ContactDetailView["replicas"] = [];
    for (const id of identityIds) {
      const t = neighbours.get(id);
      if (!t) continue;
      if (t.schemaId === "email.address") {
        if (t.name === null) throw new Error(`email.address ${t.id} has no name`);
        emails.push({ id: t.id, address: t.name });
      } else if (t.schemaId !== CONTACT) {
        replicas.push({
          id: t.id,
          schemaId: t.schemaId,
          name: t.name,
          properties: t.properties as Record<string, unknown>,
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
      const source = r.schemaId === "addressbook.card" ? "google" : r.schemaId;
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
      schemaId: e.schemaId,
      name: base.name,
      email: emails[0]?.address ?? base.email,
      phone: phones[0]?.phone ?? base.phone,
      role:
        base.role ?? (typeof firstOrg?.title === "string" ? firstOrg.title : null),
      company:
        base.company ?? (typeof firstOrg?.name === "string" ? firstOrg.name : null),
      channels: composeChannels(curated, emails.length > 0, replicas),
      avatarColor: pickAvatarColor(e.id),
      initials: computeInitials(base.name),
      // S6: the canonical block is empty by construction — nothing resolves
      // into it any more, and the DTO keeps the field only until the wire
      // shape drops it.
      syncTargets,
      canonical: {},
      linkedEntities: linked,
      createdAt: base.createdAt,
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
  private async identityNeighboursByEntity(ids: string[]): Promise<Map<string, Entity[]>> {
    const out = new Map<string, Entity[]>();
    if (ids.length === 0) return out;
    const owned = new Set(ids);
    const edges = (await this.graph.listLinksForEntities(ids)).filter(
      (l) => l.kind === "identity" && owned.has(l.from),
    );
    if (edges.length === 0) return out;
    const targets = await this.graph.getEntities([...new Set(edges.map((l) => l.to))]);
    const byId = new Map(targets.map((t) => [t.id, t]));
    for (const edge of edges) {
      const target = byId.get(edge.to);
      if (!target) continue;
      const arr = out.get(edge.from) ?? [];
      arr.push(target);
      out.set(edge.from, arr);
    }
    return out;
  }

  // Single-entity list-item shaping for the WRITE paths (create/update return
  // values) — the node it just wrote and its identity edges. Not the hot read
  // path (no N+1 loop).
  private async listItemFor(entity: Entity): Promise<ContactListItem> {
    const fresh = await this.graph.getEntity(entity.id);
    const node = fresh ?? entity;
    const identity = await this.identityNeighboursByEntity([entity.id]);
    return buildListItem({ ...entity, properties: node.properties }, identity.get(entity.id) ?? []);
  }

  // Mirrors the native ContactsModuleController::create_single_contact
  // graph writes (controller.rs:43-211): the person and its curated claims.
  // Contacts sits above email in the dependency graph, so it never asks
  // email for an address; an `email` argument is refused. `params` is
  // agent-facing: it omits `client_id` so the agent never invents an id;
  // the handler still accepts it from the frontend WS path via CreateParams.
  async create(params: CreateParams): Promise<ContactListItem & { fields: Record<string, unknown> }>;
  async create(params: BatchCreateParams): Promise<BatchCreateResult>;
  @rpc("create", {
    description: CONTACT_CREATE_DESCRIPTION,
    params: { oneOf: [
      { ...CONTACT_CREATE_PARAMS, properties: { ...CONTACT_CREATE_PARAMS.properties, ...CLIENT_ID_PROPERTY } },
      { ...CONTACT_BATCH_CREATE_PARAMS, properties: { ...CONTACT_BATCH_CREATE_PARAMS.properties, ...CLIENT_ID_PROPERTY } },
    ] },
  })
  @writeTool("create", {
    entity: "contacts.person",
    description: CONTACT_CREATE_DESCRIPTION,
    params: { oneOf: [CONTACT_CREATE_PARAMS, CONTACT_BATCH_CREATE_PARAMS] },
  })
  async create(params: CreateParams | BatchCreateParams): Promise<(ContactListItem & { fields: Record<string, unknown> }) | BatchCreateResult> {
    if ("contacts" in params) {
      if ("name" in params) throw new Error("Supply a contact or contacts, not both");
      return this.batch_create(params);
    }
    return this.createSingle(params);
  }

  private async createSingle(params: CreateParams): Promise<ContactListItem & { fields: Record<string, unknown> }> {
    if ("email" in params) throw new Error(NO_EMAIL);
    // Idempotency: an existing client_id returns the existing contact,
    // no re-write (native controller.rs:67 find_entity_for_user).
    if (params.client_id) {
      const existing = await this.graph.getEntity(params.client_id);
      if (existing) {
        const item = await this.listItemFor(existing);
        return { ...item, fields: { name: item.name } };
      }
    }

    const entity = await this.graph.createEntity({
      schemaId: CONTACT,
      name: params.name,
      clientId: params.client_id,
      idx: params.name.toLowerCase(),
    });
    // S3: the hub dict takes the curated claims.
    const curated: Record<string, JsonValue> = {};
    if (params.phone) {
      curated.phones = [{ phone: params.phone, type: null, is_primary: true }];
    }
    if (params.role) curated.role = params.role;
    if (params.company) curated.company = params.company;
    if (Object.keys(curated).length > 0) {
      await this.graph.updateProperties({ entityId: entity.id, properties: curated });
    }

    const item = await this.listItemFor(entity);
    return {
      ...item,
      fields: {
        name: params.name,
        ...(params.role ? { role: params.role } : {}),
        ...(params.company ? { company: params.company } : {}),
      },
    };
  }

  // Mirrors native contacts.batch_create (controller.rs:469). Per-row
  // ids derive as uuid_v5(batch client_id, "contacts.batch_create:{i}")
  // so a retried batch reuses the same entity ids (idempotent), exactly
  // as the native handler (controller.rs:531). Each row delegates to
  // create(), inheriting the same dictionary writes.
  @rpc("batch_create", {
    description: "Create a batch of contacts; a retried batch with the same client_id reuses its ids.",
    params: { ...CONTACT_BATCH_CREATE_PARAMS, properties: { ...CONTACT_BATCH_CREATE_PARAMS.properties, ...CLIENT_ID_PROPERTY } },
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
      if ("email" in c) throw new Error(`contact[${String(i)}]: ${NO_EMAIL}`);
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
        phone: c.phone,
        company: c.company,
        role: c.role,
        client_id: rowClientId,
      });
      created += 1;
      results.push({ id: item.id, name: c.name, status: "created" });
    }

    return { results, total: contacts.length, created, excluded: excludedCount };
  }

  // Mirrors native contacts.update (controller.rs:562) — name only:
  // rename the entity and rewrite first_name on the replica. The
  // updateEntityName op is ownership-checked.
  @rpc("update", CONTACT_UPDATE_SPEC)
  @writeTool("update", { entity: "contacts.person", ...CONTACT_UPDATE_SPEC })
  async update(params: UpdateParams): Promise<ContactListItem> {
    const existing = await this.graph.getEntity(params.id);
    if (!existing) throw new Error(`contact not found: ${params.id}`);

    if (params.name) {
      // S3: the name vouch lives on the entity row alone.
      await this.graph.updateEntityName(params.id, params.name);
    }

    const fresh = await this.graph.getEntity(params.id);
    return this.listItemFor(fresh ?? existing);
  }

  // Read-only merge preview (controller.rs:631). Ownership is enforced
  // backend-side in the op.
  @rpc("merge_preview", {
    description: "Preview merging two contacts: which links move and which dictionary keys conflict.",
    params: {
      type: "object",
      properties: {
        survivorId: CONTACT_MERGE_PARAMS.properties.survivorId,
        retiredId: CONTACT_MERGE_PARAMS.properties.retiredId,
      },
      required: ["survivorId", "retiredId"],
      additionalProperties: false,
    },
  })
  async merge_preview(params: Pick<MergeInput, "survivorId" | "retiredId">): Promise<MergePreview> {
    return this.graph.mergePreview({ survivorId: params.survivorId, retiredId: params.retiredId });
  }

  // Merge two contacts (controller.rs:656): transfer links from
  // retired to survivor, delete retired, then re-derive the survivor's
  // name/idx from the resolved canonicals (first_name [+ last_name]).
  @writeTool("merge", {
    entity: "contacts.person",
    description: "Preview or merge contacts, preserving the resolved name.",
    params: CONTACT_MERGE_PARAMS,
  })
  @rpc("merge", {
    description:
      "Merge two contacts into one. Transfers all links and history from " +
      "retired to survivor, then deletes retired.",
    params: CONTACT_MERGE_PARAMS,
  })
  async merge(params: MergeInput): Promise<MergeResult | MergePreview> {
    for (const id of [params.survivorId, params.retiredId]) {
      const entity = await this.graph.getEntity(id);
      if (entity?.schemaId !== CONTACT) throw new Error(`contact not found: ${id}`);
    }
    if (params.preview) return this.merge_preview(params);
    const result = await this.graph.mergeExecute({
      survivorId: params.survivorId,
      retiredId: params.retiredId,
      overrides: params.overrides,
      reason: params.reason,
    });

    // S6: re-derive entity name/idx from the survivor's merged DICTIONARY —
    // the canonical map is dead and would always read empty here, silently
    // skipping the rename.
    const merged = await this.graph.getEntity(params.survivorId);
    const dict = (merged?.properties ?? {}) as Record<string, unknown>;
    const first = dict.first_name;
    if (typeof first === "string" && first.length > 0) {
      const last = dict.last_name;
      const full = typeof last === "string" && last.length > 0 ? `${first} ${last}` : first;
      await this.graph.updateEntityName(params.survivorId, full);
      await this.graph.updateEntityIdx(params.survivorId, full.toLowerCase());
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
    // The old path called listEntitiesByContext() — which loads EVERY entity
    // in the context (38k+ on a real account), marshals them all across the V8
    // boundary, and filters in JS with the cap applied AFTER. On a large account
    // that ran ~50s and TAINTED the plugin isolate, bricking every contacts.*
    // call (search + batch_create) until a backend restart. searchEntitiesByName
    // caps at the DB, so it stays fast and never poisons the isolate.
    const MAX_LIMIT = 50;
    const limit = Math.min(params.limit ?? 25, MAX_LIMIT);
    const matched = await this.graph.searchEntitiesByName({
      query: params.query ?? "",
      schemaIds: [CONTACT],
      limit,
    });

    const results: EntitySearchHit[] = matched.map((e) => ({
      id: e.id,
      name: e.name && e.name.length > 0 ? e.name : null,
      schemaId: e.schemaId,
    }));
    results.sort((a, b) => {
      const an = a.name ?? "";
      const bn = b.name ?? "";
      if (an !== bn) return an < bn ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

    return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
  }

  // Compare-and-set rename — a contact auto-created from a URL
  // carries its handle as a placeholder name; the first profile ingest upgrades
  // it to the real display name ONLY while the placeholder is still in place.
  // Internal RPC (never an agent tool).
  @rpc("rename_if_placeholder", {
    description: "Rename a contact only while its name is still the given placeholder.",
    params: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        expected_name: { type: "string" },
        new_name: { type: "string" },
      },
      required: ["id", "expected_name", "new_name"],
      additionalProperties: false,
    },
  })
  async rename_if_placeholder(params: RenameIfPlaceholderParams): Promise<{ renamed: boolean }> {
    const entity = await this.graph.getEntity(params.id);
    if (entity?.schemaId !== CONTACT) return { renamed: false };
    if (entity.name !== params.expected_name) return { renamed: false };
    if (!params.new_name.trim() || params.new_name === params.expected_name) {
      return { renamed: false };
    }
    await this.graph.updateEntityName(params.id, params.new_name);
    return { renamed: true };
  }

  @rpc("completeXSyncMigration", { description: "Remove an X legacy choice after its profile and identity link are committed.", params: {
    type: "object", properties: { contactId: { type: "string" }, profileId: { type: "string" }, handle: { type: "string" }, enabled: { type: "boolean" } },
    required: ["contactId", "profileId", "handle", "enabled"], additionalProperties: false,
  } })
  async completeXSyncMigration(params: CompleteXSyncMigrationParams): Promise<{ removed: boolean }> {
    const detail = await this.graph.getEntityFull(params.contactId, { links: true });
    if (detail?.entity.schemaId !== CONTACT) throw new Error("X migration contact is missing");
    if (!detail.links.some((link) => link.from === params.contactId && link.to === params.profileId && link.kind === "identity" && link.validUntil === null)) throw new Error("X migration identity link is not committed");
    const profile = await this.graph.getEntity(params.profileId);
    if (profile?.schemaId !== "x.profile" || !("syncEnabled" in profile) || typeof profile.syncEnabled !== "boolean"
      || !("syncRevision" in profile) || typeof profile.syncRevision !== "string" || !/^\d+$/.test(profile.syncRevision)) throw new Error("X migration profile has no saved choice");
    const handle = (profile.properties as Record<string, unknown>).handle;
    if (profile.origin !== "canonical" || !/^x:profile:\d+$/.test(profile.source.externalId)
      || typeof handle !== "string" || handle.trim().toLowerCase() !== params.handle) throw new Error("X migration profile identity does not match the legacy entry");
    const existing = trackingOf(detail.entity);
    const remaining = existing.filter((entry) => !(entry.platform === "x" && entry.handle?.trim().toLowerCase() === params.handle && entry.enabled === params.enabled));
    if (remaining.length === existing.length) return { removed: false };
    const tracking = remaining.map(({ platform, handle, enabled }) => ({ platform, ...(handle === undefined ? {} : { handle }), enabled }));
    await this.graph.updateProperties({ entityId: params.contactId, properties: { tracking } });
    return { removed: true };
  }

  // Search-plan stage First: the tracked hubs, straight from the FILTERED
  // window — only dictionaries that carry `tracking` come back, so the walk
  // is bounded by the tracked set, not by the address book. The old paged
  // full scans read every person 500 at a time.
  private async trackedHubs(): Promise<Entity[]> {
    const PAGE = 500;
    const out: Entity[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const page = await this.graph.listEntitiesWindow({
        schema: CONTACT,
        filterField: { propertyPath: "tracking" },
        filterOp: "exists",
        limit: PAGE,
        offset,
      });
      out.push(...page.items);
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
        out.push({ contact_id: e.id, name: e.name !== null && e.name.length > 0 ? e.name : handle, handle });
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
    const e = await this.graph.getEntity(id);
    return e ? trackingView(e) : {};
  }
}

/** One `tracking[]` entry of the hub dictionary (plan §7 S3). */
interface TrackingEntry {
  platform: "x" | "linkedin";
  handle?: string | null;
  enabled: boolean;
}

function trackingOf(e: Entity): TrackingEntry[] {
  const props = e.properties as Record<string, unknown>;
  return Array.isArray(props.tracking) ? (props.tracking as TrackingEntry[]) : [];
}

function trackingEntryOf(
  e: Entity,
  platform: "x" | "linkedin",
): TrackingEntry | undefined {
  return trackingOf(e).find((t) => t.platform === platform);
}

/** The wire view the tools speak, derived from the dictionary entries. */
function trackingView(e: Entity): SocialTracking {
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
