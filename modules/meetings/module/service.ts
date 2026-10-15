// Meetings plugin — graph-native module. Read path: list (windowed
// over meetings.calendar_event, starts_at DESC, the node dictionary inline),
// get (entity + links), search (meetings.EVENT schema — native quirk).
// Output is byte-compatible with the native module (types.rs MeetingListItem /
// MeetingDetailView) and the UI's plugins/meetings/ui copies.
//
// Read-time enrichment ported from the native domain adapter: attendees are the
// event's `meetings.attendee` edges, each resolving through its address node to a
// contacts.person over `identity` (plan §3/§6), and get's
// linkedEntities resolve the entity's link neighbours. Canonical is deferred to
// {} on this hot path (mirrors the email/telegram modules; the detail UI is verified
// visually in the frontend stage).

import {
  linkedEntitySummary,
  rpc,
  removeUnseenSourceReplicas,
  syncComplete,
  syncHandler,
  tool,
  writeTool,
  type GraphService,
  type PluginDeps,
  type RpcExecutor,
} from "@magnis/plugin-sdk";
import type {
  BatchEntityInput,
  BatchLink,
  Entity,
  EntitySearchHit,
  JsonObject,
  JsonValue,
  LinkedEntitySummary,
  SyncEnvelope,
  SyncHandlerParams,
  SyncHookParams,
  SyncReceipt,
  SyncReconcileAnswer,
  SyncStateResetResult,
  SyncStateStatusResult,
  TriggerCheckEvent,
} from "@magnis/sdk";
import type {
  GetParams,
  ListParams,
  MeetingCalendarEventDetails,
  MeetingDetailView,
  MeetingListItem,
  NewMeetingParams,
  SearchParams,
  ToolResult,
} from "../types.ts";
import {
  attendeesForPage,
  buildListItem,
  dictOf,
  enrichAttendees,
  formatDateTime,
  normalizeAttendees,
  parseAttendees,
  parseRfc3339,
  str,
} from "./helpers.ts";
import { CAL, EVENT, MEETING } from "../schema.ts";
import { addressFragment } from "../../email/schema.ts";

/// A Source message's payload is the event's JSON object; anything else is a
/// malformed envelope.
function payloadOf(env: SyncEnvelope): JsonObject {
  const payload = env.payload;
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`meetings ingest: envelope payload is not an object (remoteId=${env.remoteId ?? "unknown"})`);
  }
  return payload;
}

// One spec per method: an rpc() stacked on a tool publishes the same input.
const GET_SPEC = {
  description: "Get a full meeting detail view by entity id.",
  params: {
    type: "object",
    properties: { id: { type: "string", format: "uuid" } },
    required: ["id"],
    additionalProperties: false,
  },
};

const CREATE_SPEC = {
  description:
    "Create a new meeting (calendar event) with title, start/end times, and optional attendees.",
  params: {
    type: "object",
    properties: {
      title: { type: "string", description: "Meeting title (non-empty)" },
      starts_at: { type: "string", format: "date-time" },
      ends_at: { type: "string", format: "date-time" },
      attendees: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: ["string", "null"] },
            email: { type: "string" },
          },
          required: ["email"],
        },
      },
      description: { type: "string" },
      location: { type: "string" },
      client_id: { type: "string", format: "uuid" },
    },
    required: ["title", "starts_at", "ends_at"],
    additionalProperties: false,
  },
};

export class MeetingsModule {
  private readonly graph: GraphService;
  private readonly rpc: RpcExecutor;
  constructor(deps: PluginDeps) {
    this.graph = deps.graph;
    this.rpc = deps.rpc;
  }

  // ── meetings.list ─────────────────────────────────────────────
  @rpc("list", {
    description: "List meetings with pagination and optional search.",
    params: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1 },
        offset: { type: "integer", minimum: 0 },
        search: { type: "string" },
      },
      additionalProperties: false,
    },
  })
  async list(
    params: ListParams,
  ): Promise<{ items: MeetingListItem[]; total: number; limit: number; offset: number }> {
    const limit = params.limit ?? 100;
    const offset = params.offset ?? 0;
    const search = (params.search ?? "").trim();

    if (search.length > 0) {
      // Search path (native domain.list search branch): name match over
      // meetings.calendar_event. S5: the matched rows carry their own
      // dictionaries, so nothing is hydrated after the search.
      const matched = await this.graph.searchEntitiesByName({
        query: search,
        schemaIds: [CAL],
        limit: limit + offset,
      });
      const total = matched.length;
      const page = matched.slice(offset, offset + limit);
      // S6: the whole page's attendees in four fixed crossings — never
      // per-row edge reads.
      const attendees = await attendeesForPage(this.graph, page.map((e) => e.id));
      const items = page.map((e) => buildListItem(e, dictOf(e), attendees.get(e.id) ?? []));
      return { items, total, limit, offset };
    }

    // ONE window — page of meetings.calendar_event ordered by the dictionary's
    // starts_at DESC, each row carrying its dictionary inline.
    const win = await this.graph.listEntitiesWindow({
      schema: CAL,
      order: [{ field: { propertyPath: "starts_at" }, desc: true }],
      limit,
      offset,
    });
    // S6: the whole page's attendees in four fixed crossings.
    const pageAttendees = await attendeesForPage(
      this.graph,
      win.items.map((entity) => entity.id),
    );
    const items = win.items.map((entity) =>
      buildListItem(entity, dictOf(entity), pageAttendees.get(entity.id) ?? []),
    );
    return { items, total: win.total, limit, offset };
  }

  // ── meetings.get ──────────────────────────────────────────────
  @rpc("get", GET_SPEC)
  @tool("get", { entity: "meetings.calendar_event", ...GET_SPEC })
  async get(params: GetParams): Promise<MeetingDetailView> {
    const detail = await this.graph.getEntityFull(params.id, { links: true });
    if (detail?.entity.schemaId !== CAL) {
      throw new Error(`meeting ${params.id} not found`);
    }
    const { entity, links } = detail;
    // S5: the event DICT is the record.
    const d = dictOf(entity);

    // The links the detail already fetched carry the attendee edges — no
    // second crossing to read them.
    const attendees = await enrichAttendees(this.graph, entity.id, links);
    const { date, time } = formatDateTime(
      str(d, "starts_at") ?? undefined,
      str(d, "ends_at") ?? undefined,
    );


    // Resolve link neighbours (created-by project, attendee contacts, …) for the
    // Context panel. Link edges carry ids + kind only; one batch getEntities
    // (user-scoped → drops non-owned targets) hydrates names/schemas.
    const linkedEntities: LinkedEntitySummary[] = [];
    if (links.length > 0) {
      const neighbourId = (l: { from: string; to: string }): string =>
        l.from === entity.id ? l.to : l.from;
      const targets = await this.graph.getEntities([...new Set(links.map(neighbourId))]);
      const byId = new Map<string, Entity>(targets.map((t) => [t.id, t]));
      for (const l of links) {
        const t = byId.get(neighbourId(l));
        if (!t) continue;
        // An empty name reads as no name (native parity).
        linkedEntities.push({ ...linkedEntitySummary(t, l, l.kind), name: t.name && t.name.length > 0 ? t.name : null });
      }
    }

    return {
      id: entity.id,
      schemaId: entity.schemaId,
      title: entity.name && entity.name.length > 0 ? entity.name : "Untitled Meeting",
      date,
      time,
      startsAt: str(d, "starts_at"),
      endsAt: str(d, "ends_at"),
      location: str(d, "location"),
      description: str(d, "description"),
      conferenceLink: str(d, "conference_link"),
      attendees,
      canonical: {},
      linkedEntities,
      createdAt: entity.createdAt,
    };
  }

  // ── meetings.search (agent search — native quirk: meetings.EVENT) ─
  // Native controller routes meetings.search to shared::search_entities over the
  // "meetings.event" schema (NOT calendar_event). Preserved verbatim.
  @rpc("search", {
    description: "Search events by title.",
    params: {
      type: "object",
      properties: {
        query: { type: "string" },
        context: {
          type: "string",
          format: "uuid",
          description: "Optional context entity UUID. Omit to search every meeting.",
        },
        limit: { type: "integer", minimum: 1 },
      },
      additionalProperties: false,
    },
  })
  async search(params: SearchParams): Promise<ToolResult> {
    const query = (params.query ?? "").toLowerCase();
    const entities = await this.graph.listEntitiesByContext(params.context);

    let results: EntitySearchHit[] = entities
      .filter((e) => e.schemaId === EVENT)
      .filter((e) => (query.length === 0 ? true : e.name?.toLowerCase().includes(query) === true))
      .map((e) => ({
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

    if (params.limit !== undefined && results.length > params.limit) {
      results = results.slice(0, params.limit);
    }

    return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
  }

  // ── meetings.create (@writeTool) ──────────────────────────────
  // Operator/agent create. Validates BEFORE any write, idempotent on
  // client_id, returns the native snapshot shape. The record is
  // written with source "local" semantics (confidence 100). NOTE: the native
  // agent-side "created" link (ToolDefinition.with_link_kind) is not expressible
  // through the @writeTool decorator and is dropped — consistent with the
  // contacts plugin precedent.
  @rpc("create", CREATE_SPEC)
  @writeTool("create", { entity: "meetings.calendar_event", ...CREATE_SPEC })
  async create(params: NewMeetingParams): Promise<Record<string, unknown>> {
    // Validate BEFORE touching the graph (matches native messages).
    if (!params.title || params.title.trim().length === 0) {
      throw new Error("title must be a non-empty string");
    }
    const starts = parseRfc3339(params.starts_at);
    if (starts === null) throw new Error(`invalid starts_at: ${params.starts_at}`);
    const ends = parseRfc3339(params.ends_at);
    if (ends === null) throw new Error(`invalid ends_at: ${params.ends_at}`);
    if (ends < starts) {
      throw new Error("ends_at must be >= starts_at (ends_at < starts_at is rejected)");
    }

    // Idempotency: an existing client_id returns the existing entity,
    // no re-write (native repo create_local find_entity_for_user).
    if (params.client_id) {
      const existing = await this.graph.getEntity(params.client_id);
      if (existing) return this.snapshot(existing.id, params);
    }

    const now = new Date().toISOString();
    const entity = await this.graph.createEntity({
      schemaId: CAL,
      name: params.title,
      ...(params.client_id === undefined ? {} : { clientId: params.client_id }),
      date: now,
    });

    // S5: the dictionary is the record — the attendees are NOT in it, they are
    // the event's `meetings.attendee` edges.
    const data = {
      title: params.title,
      starts_at: params.starts_at,
      ends_at: params.ends_at,
      updated_at: now,
      ...(params.description === undefined ? {} : { description: params.description }),
      ...(params.location === undefined ? {} : { location: params.location }),
    } satisfies MeetingCalendarEventDetails;

    await this.graph.updateProperties({ entityId: entity.id, properties: data });
    await this.writeAttendeeEdges(entity.id, normalizeAttendees(params.attendees));

    return this.snapshot(entity.id, params);
  }

  /// Build the native create snapshot: id + the canonical fields,
  /// description/location only when present.
  private snapshot(id: string, params: NewMeetingParams): Record<string, unknown> {
    const snap: Record<string, unknown> = {
      id,
      schemaId: CAL,
      title: params.title,
      starts_at: params.starts_at,
      ends_at: params.ends_at,
      attendees: normalizeAttendees(params.attendees),
    };
    if (params.description !== undefined) snap.description = params.description;
    if (params.location !== undefined) snap.location = params.location;
    return snap;
  }

  // ── sync ingest (@syncHandler) ────────────────────────────────
  // Invoked by the host PluginModuleController bridge (`meetings.__sync__`) with
  // a WHOLE page of envelopes. Ports the native ingest: each calendar event is
  // upserted via applyBatch (idempotent on the source external_id, confidence
  // 90); a LIVE event additionally resolves its attendees to email.address hub
  // entities (via the email plugin's ensure_address RPC) and returns a
  // trigger.check the bridge fans out to the event_bus. `delete` removes the
  // entity. An empty envelope user_id is a HARD ERROR (no silent attribution).
  @syncHandler("meetings")
  async ingest(params: SyncHandlerParams): Promise<SyncReceipt> {
    const envelopes = params.envelopes;
    // What the page states for the plan, as the Source counted the window:
    // the whole of it on the calendar envelope that opens a pass, and the
    // events a page left out as skipped.
    // @tested-by: tst_module_meetings_plan_001
    const stated = typeof params.generation === "string" && params.generation !== "";
    const fullPass = params.command === "bootstrap";
    const plan = { total: 0, skipped: 0 };

    // Validate ALL user_ids before any write so a bad envelope writes
    // nothing (native bails on empty user_id; no "" attribution).
    for (const env of envelopes) {
      if (!env.userId) {
        throw new Error(
          `meetings ingest: envelope.userId is required (remoteId=${env.remoteId ?? "unknown"})`,
        );
      }
    }

    const dropped: string[] = [];
    const triggers: TriggerCheckEvent[] = [];
    const deltaExternalIds = fullPass ? [] : [...new Set(envelopes.flatMap((env) => env.kind !== "delete" && payloadOf(env).entity_type !== "calendar" && env.remoteId ? [env.remoteId] : []))];
    const known = stated && deltaExternalIds.length > 0 ? await this.graph.findByExternalIds(deltaExternalIds) : [];
    const existing = new Set(deltaExternalIds.filter((_, i) => known[i]));
    const added = new Set<string>();
    for (const env of envelopes) {
      if (env.kind === "delete") {
        try {
          if (await this.ingestDelete(env) && stated && !fullPass) plan.total -= 1;
        } catch {
          if (env.remoteId) dropped.push(env.remoteId);
        }
        continue;
      }
      if (env.kind !== "snapshot" && env.kind !== "live") continue;
      if (!env.remoteId) continue;
      const payload = payloadOf(env);
      if (payload.entity_type === "calendar") {
        const total = payload.events_total;
        if (typeof total === "number" && stated && fullPass) plan.total += total;
        continue;
      }
      const written = await this.ingestUpsert(env, triggers, params.generation);
      if (written && stated && !fullPass && !existing.has(env.remoteId) && !added.has(env.remoteId)) {
        plan.total += 1;
        added.add(env.remoteId);
      }
    }

    return {
      droppedRemoteIds: dropped,
      triggerChecks: triggers,
      plan: stated ? { [CAL]: plan } : null,
      excluded: [],
    };
  }

  /** A full Calendar pass is complete only when the host calls this hook.
   * An interrupted pass never reaches it and cannot erase unseen meetings.
   * @tested-by: tst_module_google_001 */
  @syncComplete()
  async onSyncComplete(params: SyncHookParams): Promise<SyncReconcileAnswer> {
    if (!params.sourceId || !params.accountId || !params.generation) {
      throw new Error("meetings sync complete requires source, account and generation");
    }
    await removeUnseenSourceReplicas(this.graph, CAL, params.sourceId, params.accountId, params.generation);
    return { departed: [], plan: { [CAL]: { total: 0, skipped: 0 } } };
  }

  /// Delete envelope: resolve the meeting by its source external_id and remove
  /// it. An unknown id is a silent no-op (native delete_by_remote_id parity).
  private async ingestDelete(env: SyncEnvelope): Promise<boolean> {
    if (!env.remoteId) return false;
    // S5: the remote id IS the node's external id — resolution goes through
    // the one chokepoint, not the retired record external id.
    const id = await this.graph.findByExternalId(env.remoteId);
    if (!id) return false;
    const entity = await this.graph.getEntity(id);
    if (entity?.schemaId !== CAL) return false;
    const dict = dictOf(entity);
    if (dict.source_id !== env.sourceId || dict.account_id !== env.accountId) return false;
    await this.graph.deleteEntity(id);
    return true;
  }

  /// Upsert one calendar event as a NODE (idempotent on its external id) plus the
  /// `meetings.attendee` edges its invite lists, then, for LIVE events, assemble the
  /// trigger.check with those attendees' address ids.
  private async ingestUpsert(env: SyncEnvelope, triggers: TriggerCheckEvent[], generation: string | undefined): Promise<boolean> {
    const remoteId = env.remoteId;
    if (!remoteId) throw new Error("meetings ingest: envelope missing remoteId");
    const payload = payloadOf(env);
    const name = str(payload, "title") ?? "";

    // The attendees are edges now, so they leave the dictionary — the invite's
    // per-event display name rides the edge, the address rides the node.
    const attendees = parseAttendees(payload, remoteId);
    const dict: Record<string, JsonValue> = { ...payload };
    delete dict.attendees;
    dict.source_id = env.sourceId;
    dict.account_id = env.accountId;
    if (generation) dict.sync_pass = generation;

    const entity: BatchEntityInput = {
      key: remoteId,
      schemaId: CAL,
      name,
      idx: null,
      date: null,
      externalId: remoteId,
      properties: dict,
    };
    // @tested-by: tst_module_meetings_sync_002
    // Address nodes and attendee edges belong to the same sync transaction.
    const named = new Map<string, string | null>();
    for (const a of attendees) {
      const lower = a.email.trim().toLowerCase();
      if (!named.has(lower)) named.set(lower, a.name ?? null);
    }
    const { entities: addresses, refs } = await addressFragment(this.graph, named);
    const links: BatchLink[] = [];
    for (const a of attendees) {
      const key = `addr:${a.email.trim().toLowerCase()}`;
      links.push({
        fromKey: remoteId,
        toKey: key,
        kind: "meetings.attendee",
        confidence: null,
        metadata: a.name === undefined ? null : { display_name: a.name },
        declaredBy: remoteId,
        validFrom: null,
        validUntil: null,
      });
    }
    const result = await this.graph.applyBatch({ entities: [entity, ...addresses], refs, links });
    const entityId = result.ids[remoteId];
    if (!entityId) return false;
    const addressIds = attendees.map((attendee) => {
      const id = result.ids[`addr:${attendee.email.trim().toLowerCase()}`];
      if (!id) throw new Error(`meetings ingest: attendee address ${attendee.email} was not resolved`);
      return id;
    });

    // Reconcile: the invite's CURRENT list is complete for this event, so an
    // attendee the provider no longer reports leaves — the earlier design got this
    // for free by replacing the array wholesale, and edges must not silently
    // accumulate ex-guests.
    const current = new Set(addressIds);
    const existing = await this.graph.listLinksForEntity(entityId);
    for (const edge of existing) {
      if (edge.kind !== "meetings.attendee" || edge.from !== entityId) continue;
      if (!current.has(edge.to)) {
        await this.graph.deleteLink(edge.id);
      }
    }

    if (env.kind !== "live") return true;

    triggers.push({
      type: "trigger.check",
      eventKind: "new_meeting",
      schemaId: MEETING,
      entityId,
      phase: "live",
      // touched = [meeting, every attendee's email.address id].
      touchedEntityIds: [entityId, ...addressIds],
      userId: env.userId,
      // The context is the trigger engine's own JSON and keeps its keys.
      context: {
        title: name.length > 0 ? name : null,
        remote_id: remoteId,
        // @tested-by: tst_module_meetings_trigger_001
        // @invariant: INV-10 — the engine compares the event's own time against
        // the trigger's creation time to refuse history, and fails CLOSED when
        // it is absent. Without this every meeting trigger would stop firing
        // the moment that comparison lands. A meeting's occurrence is its start.
        occurred_at: str(payload, "starts_at") ?? null,
      },
    });
    return true;
  }

  /// `email.address` is the email plugin's schema, so the nodes are minted by
  /// its own RPC — one crossing for the whole invite list — and this module
  /// only points edges at them.
  private async ensureAddresses(attendees: { email: string; name?: string }[]): Promise<string[]> {
    if (attendees.length === 0) return [];
    const r = await this.rpc.execute<{ ids: string[] }>("email.ensure_addresses", {
      items: attendees.map((a) => ({ address: a.email, display_name: a.name ?? null })),
    });
    return r.ids;
  }

  /// The create path's attendees: the same edges the ingest path writes, over
  /// the same shared address nodes.
  private async writeAttendeeEdges(
    eventId: string,
    attendees: { email: string; name: string | null }[],
  ): Promise<void> {
    if (attendees.length === 0) return;
    const ids = await this.ensureAddresses(
      attendees.map((a) => ({ email: a.email, ...(a.name === null ? {} : { name: a.name }) })),
    );
    for (const [i, a] of attendees.entries()) {
      const to = ids[i];
      if (!to) continue;
      await this.graph.addLink({
        from: eventId,
        to,
        kind: "meetings.attendee",
        ...(a.name === null ? {} : { metadata: { display_name: a.name } }),
      });
    }
  }

  // ── sync control (@rpc) ───────────────────────────────────────
  @rpc("sync.status", {
    description: "List the meetings sync state per connected account for the current user.",
    params: { type: "object", properties: {}, additionalProperties: false },
  })
  async syncStatus(): Promise<SyncStateStatusResult> {
    return this.graph.syncState("status");
  }

  @rpc("sync.reset", {
    description:
      "Reset meetings sync: delete the caller's calendar events and reset sync state to bootstrap.",
    params: { type: "object", properties: {}, additionalProperties: false },
  })
  async syncReset(): Promise<SyncStateResetResult> {
    return this.graph.syncState("reset", CAL);
  }
}
