// Meetings plugin — graph-native module. Read path: list (windowed
// over meetings.calendar_event, starts_at DESC, the node dictionary inline),
// get (entity + links), search (meetings.EVENT schema — native quirk).
// Output is byte-compatible with the native module (types.rs MeetingListItem /
// MeetingDetailView) and the UI's plugins/meetings/ui copies.
//
// Read-time enrichment ported from the native domain adapter: attendees are the
// event's `attendee` edges, each resolving through its address node to a
// contacts.person over `identity` (plan §3/§6), and get's
// linked_entities resolve the entity's link neighbours. Canonical is deferred to
// {} on this hot path (mirrors the email/telegram modules; the detail UI is verified
// visually in the frontend stage).

import {
  rpc,
  syncHandler,
  tool,
  writeTool,
  type GraphService,
  type PluginDeps,
} from "@magnis/plugin-sdk";
import type {
  BatchEntityInput,
  BatchLinkInput,
  BatchRefInput,
  RawEntity,
  RpcExecutor,
} from "@magnis/plugin-sdk";
import type {
  GetParams,
  LinkedEntitySummary,
  ListParams,
  MeetingCalendarEventDetails,
  MeetingDetailView,
  MeetingListItem,
  MeetingTriggerCheck,
  NewMeetingParams,
  SearchParams,
  SearchResultItem,
  SyncEnvelope,
  ToolResult,
} from "../types.ts";
import {
  attendeesForPage,
  buildListItem,
  enrichAttendees,
  formatDateTime,
  normalizeAttendees,
  parseAttendees,
  parseRfc3339,
  str,
  type Data,
} from "./helpers.ts";
import { CAL, EVENT, MEETING } from "../schema.ts";

/// The node dictionary (S5): the record every read path renders from.
const dictOf = (e: RawEntity): Data => e.properties ?? {};

export class MeetingsModule {
  private readonly graph: GraphService;
  private readonly rpc: RpcExecutor;
  constructor(deps: PluginDeps) {
    this.graph = deps.graph;
    this.rpc = deps.rpc;
  }

  // ── meetings.list ─────────────────────────────────────────────
  @tool("list", {
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
      const matched = await this.graph.search_entities_by_name({
        query: search,
        schema_ids: [CAL],
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
    const win = await this.graph.list_entities_window({
      schema: CAL,
      order: [{ field: { property_path: "starts_at" }, desc: true }],
      limit,
      offset,
    });
    // S6: the whole page's attendees in four fixed crossings.
    const pageAttendees = await attendeesForPage(
      this.graph,
      win.items.map((r) => r.entity.id),
    );
    const items = win.items.map(({ entity }) =>
      buildListItem(entity, dictOf(entity), pageAttendees.get(entity.id) ?? []),
    );
    return { items, total: win.total, limit, offset };
  }

  // ── meetings.get ──────────────────────────────────────────────
  @tool("get", {
    description: "Get a full meeting detail view by entity id.",
    params: {
      type: "object",
      properties: { id: { type: "string", format: "uuid" } },
      required: ["id"],
      additionalProperties: false,
    },
  })
  async get(params: GetParams): Promise<MeetingDetailView> {
    const detail = await this.graph.get_entity_full(params.id, { links: true });
    if (detail?.entity.schema_id !== CAL) {
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
    // Context panel. Link edges carry ids + kind only; one batch get_entities
    // (user-scoped → drops non-owned targets) hydrates names/schemas.
    const linked_entities: LinkedEntitySummary[] = [];
    if (links.length > 0) {
      const neighbourId = (l: { from_id: string; to_id: string }): string =>
        l.from_id === entity.id ? l.to_id : l.from_id;
      const targets = await this.graph.get_entities([...new Set(links.map(neighbourId))]);
      const byId = new Map<string, RawEntity>(targets.map((t) => [t.id, t]));
      for (const l of links) {
        const t = byId.get(neighbourId(l));
        if (!t) continue;
        linked_entities.push({
          id: t.id,
          name: t.name && t.name.length > 0 ? t.name : null,
          schema_id: t.schema_id,
          link_kind: l.kind,
          created_at: t.created_at ?? "",
          data: null,
        });
      }
    }

    return {
      id: entity.id,
      schema_id: entity.schema_id,
      title: entity.name && entity.name.length > 0 ? entity.name : "Untitled Meeting",
      date,
      time,
      starts_at: str(d, "starts_at"),
      ends_at: str(d, "ends_at"),
      location: str(d, "location"),
      description: str(d, "description"),
      conference_link: str(d, "conference_link"),
      attendees,
      canonical: {},
      linked_entities,
      created_at: entity.created_at ?? "",
    };
  }

  // ── meetings.search (agent search — native quirk: meetings.EVENT) ─
  // Native controller routes meetings.search to shared::search_entities over the
  // "meetings.event" schema (NOT calendar_event). Preserved verbatim.
  @tool("search", {
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
    const entities = await this.graph.list_entities_by_context(params.context);

    let results: SearchResultItem[] = entities
      .filter((e) => e.schema_id === EVENT)
      .filter((e) => (query.length === 0 ? true : e.name.toLowerCase().includes(query)))
      .map((e) => ({
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
  @writeTool("create", {
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
  })
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
      const existing = await this.graph.get_entity(params.client_id);
      if (existing) return this.snapshot(existing.id, params);
    }

    const now = new Date().toISOString();
    const entity = await this.graph.create_entity({
      schema_id: CAL,
      name: params.title,
      client_id: params.client_id,
      date: now,
    });

    // S5: the dictionary is the record — the attendees are NOT in it, they are
    // the event's `attendee` edges.
    const data: MeetingCalendarEventDetails = {
      title: params.title,
      starts_at: params.starts_at,
      ends_at: params.ends_at,
      updated_at: now,
    };
    if (params.description !== undefined) data.description = params.description;
    if (params.location !== undefined) data.location = params.location;

    await this.graph.update_properties({ entity_id: entity.id, properties: { ...data } });
    await this.writeAttendeeEdges(entity.id, normalizeAttendees(params.attendees));

    return this.snapshot(entity.id, params);
  }

  /// Build the native create snapshot: id + the canonical fields,
  /// description/location only when present.
  private snapshot(id: string, params: NewMeetingParams): Record<string, unknown> {
    const snap: Record<string, unknown> = {
      id,
      schema_id: CAL,
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
  // upserted via apply_batch (idempotent on the source external_id, confidence
  // 90); a LIVE event additionally resolves its attendees to email.address hub
  // entities (via the email plugin's ensure_address RPC) and returns a
  // trigger.check the bridge fans out to the event_bus. `delete` removes the
  // entity. An empty envelope user_id is a HARD ERROR (no silent attribution).
  @syncHandler("meetings")
  async ingest(params: {
    envelopes?: SyncEnvelope[];
  }): Promise<{ ok: boolean; dropped_remote_ids: string[]; trigger_checks: MeetingTriggerCheck[] }> {
    const envelopes = Array.isArray(params.envelopes) ? params.envelopes : [];

    // Validate ALL user_ids before any write so a bad envelope writes
    // nothing (native bails on empty user_id; no "" attribution).
    for (const env of envelopes) {
      if (!env.user_id) {
        throw new Error(
          `meetings ingest: envelope.user_id is required (remote_id=${env.remote_id ?? "unknown"})`,
        );
      }
    }

    const dropped: string[] = [];
    const triggers: MeetingTriggerCheck[] = [];
    for (const env of envelopes) {
      if (env.kind === "delete") {
        try {
          await this.ingestDelete(env);
        } catch {
          if (env.remote_id) dropped.push(env.remote_id);
        }
        continue;
      }
      if (env.kind !== "snapshot" && env.kind !== "live") continue;
      if (!env.remote_id) continue;
      await this.ingestUpsert(env, triggers);
    }

    return { ok: dropped.length === 0, dropped_remote_ids: dropped, trigger_checks: triggers };
  }

  /// Delete envelope: resolve the meeting by its source external_id and remove
  /// it. An unknown id is a silent no-op (native delete_by_remote_id parity).
  private async ingestDelete(env: SyncEnvelope): Promise<void> {
    if (!env.remote_id) return;
    // S5: the remote id IS the node's anchor — resolution goes through the
    // one chokepoint, not the retired record external id.
    const id = await this.graph.find_by_anchor(env.remote_id);
    if (id) await this.graph.delete_entity(id);
  }

  /// Upsert one calendar event as a NODE (idempotent on its anchor) plus the
  /// `attendee` edges its invite lists, then, for LIVE events, assemble the
  /// trigger.check with those attendees' address ids.
  private async ingestUpsert(env: SyncEnvelope, triggers: MeetingTriggerCheck[]): Promise<void> {
    const remoteId = env.remote_id;
    if (!remoteId) throw new Error("meetings ingest: envelope missing remote_id");
    const payload = env.payload as Data;
    const name = str(payload, "title") ?? "";

    // The attendees are edges now, so they leave the dictionary — the invite's
    // per-event display name rides the edge, the address rides the node.
    const attendees = parseAttendees(payload, remoteId);
    const dict: Data = { ...payload };
    delete dict.attendees;

    const entity: BatchEntityInput = {
      key: remoteId,
      schema_id: CAL,
      name,
      anchor: remoteId,
      properties: dict,
      confidence: 90,
    };
    const addressIds = await this.ensureAddresses(attendees);
    const refs: BatchRefInput[] = [];
    const links: BatchLinkInput[] = [];
    for (const a of attendees) {
      const lower = a.email.trim().toLowerCase();
      const key = `addr:${lower}`;
      if (!refs.some((r) => r.key === key)) {
        refs.push({ key, anchor: `email:address:${lower}` });
      }
      links.push({
        from_key: remoteId,
        to_key: key,
        kind: "attendee",
        declared_by: remoteId,
        ...(a.name === undefined ? {} : { metadata: { display_name: a.name } }),
      });
    }
    const result = await this.graph.apply_batch({ entities: [entity], refs, links });
    const entityId = result.ids[remoteId];
    if (!entityId) return;

    // Reconcile: the invite's CURRENT list is complete for this event, so an
    // attendee the provider no longer reports leaves — the earlier design got this
    // for free by replacing the array wholesale, and edges must not silently
    // accumulate ex-guests.
    const current = new Set(addressIds);
    const existing = await this.graph.list_links_for_entity(entityId);
    for (const edge of existing) {
      if (edge.kind !== "attendee" || edge.from_id !== entityId) continue;
      if (!current.has(edge.to_id)) {
        await this.graph.delete_link(edge.id);
      }
    }

    if (env.kind !== "live") return;

    triggers.push({
      type: "trigger.check",
      event_kind: "new_meeting",
      schema_id: MEETING,
      entity_id: entityId,
      phase: "live",
      // touched = [meeting, every attendee's email.address id].
      touched_entity_ids: [entityId, ...addressIds],
      user_id: env.user_id,
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
      const to_id = ids[i];
      if (!to_id) continue;
      await this.graph.add_link({
        from_id: eventId,
        to_id,
        kind: "attendee",
        ...(a.name === null ? {} : { metadata: { display_name: a.name } }),
      });
    }
  }

  // ── sync control (@rpc) ───────────────────────────────────────
  @rpc("sync.status", {
    description: "List the meetings sync state per connected account for the current user.",
    params: { type: "object", properties: {}, additionalProperties: false },
  })
  async syncStatus(): Promise<Record<string, unknown>> {
    return this.graph.sync_state("status");
  }

  @rpc("sync.reset", {
    description:
      "Reset meetings sync: delete the caller's calendar events and reset sync state to bootstrap.",
    params: { type: "object", properties: {}, additionalProperties: false },
  })
  async syncReset(): Promise<Record<string, unknown>> {
    return this.graph.sync_state("reset", CAL);
  }
}
