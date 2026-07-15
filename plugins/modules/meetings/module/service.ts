// Meetings plugin — graph-native module. Read path (Stage 1): list (P2 windowed
// over meetings.calendar_event, starts_at DESC, details facet inline), get (P1
// entity + facets + links), search (meetings.EVENT schema — native quirk).
// Output is byte-compatible with the native module (types.rs MeetingListItem /
// MeetingDetailView) and the UI's plugins/meetings/ui copies.
//
// Read-time enrichment ported from the native domain adapter: attendees resolve
// to their contacts.person (email → email.address → has_email), and get's
// linked_entities resolve the entity's link neighbours. Canonical is deferred to
// {} on this hot path (mirrors email/telegram Stage-1; the detail UI is verified
// visually in the frontend stage).

import {
  rpc,
  syncHandler,
  tool,
  writeTool,
  type GraphService,
  type PluginDeps,
} from "@magnis/plugin-sdk";
import type { BatchEntityInput, RawEntity, RpcExecutor } from "@magnis/plugin-sdk";
import type {
  CalendarAttendee,
  FacetSummary,
  GetParams,
  LinkedEntitySummary,
  ListParams,
  MeetingCalendarEventDetails,
  MeetingDetailView,
  MeetingsCanonical,
  MeetingsFacets,
  MeetingListItem,
  MeetingTriggerCheck,
  NewMeetingParams,
  SearchParams,
  SearchResultItem,
  SyncEnvelope,
  ToolResult,
} from "../types/index.ts";
import { buildListItem, enrichAttendees, formatDateTime, parseAttendees } from "./helpers.ts";

const CAL = "meetings.calendar_event";
const CAL_DETAILS = "meetings.calendar_event.details";
const EVENT = "meetings.event";

type Data = Record<string, unknown>;

const str = (d: Data, k: string): string | null => {
  const v = d[k];
  return typeof v === "string" && v.length > 0 ? v : null;
};

/// Strict RFC-3339 parse (mirrors native chrono parse_from_rfc3339): returns the
/// epoch ms, or null if the string isn't a well-formed RFC-3339 timestamp. JS
/// `Date.parse` alone is too lenient, so gate on the canonical shape first.
function parseRfc3339(s: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(s)) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

/// Normalize attendees to the canonical `{name, email}` shape (name → null when
/// absent), matching the native facet/snapshot serialization.
function normalizeAttendees(attendees: CalendarAttendee[] | undefined): {
  name: string | null;
  email: string;
}[] {
  return (attendees ?? []).map((a) => ({ name: a.name ?? null, email: a.email }));
}

export class MeetingsModule {
  private readonly graph: GraphService<MeetingsFacets, MeetingsCanonical>;
  private readonly rpc: RpcExecutor;
  constructor(deps: PluginDeps<MeetingsFacets, MeetingsCanonical>) {
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
      // meetings.calendar_event returns ids only; hydrate ONLY the page's ids in
      // one batch facet read — 2 crossings, no per-row N+1.
      const matched = await this.graph.search_entities_by_name({
        query: search,
        schema_ids: [CAL],
        limit: limit + offset,
      });
      const total = matched.length;
      const page = matched.slice(offset, offset + limit);
      const facets = await this.graph.list_facets_for_entities(page.map((e) => e.id));
      const byId = new Map<string, Data>();
      for (const f of facets) {
        if (f.schema_id === CAL_DETAILS && f.entity_id && !byId.has(f.entity_id)) {
          byId.set(f.entity_id, f.data as Data);
        }
      }
      const items: MeetingListItem[] = [];
      for (const e of page) {
        const d = byId.get(e.id) ?? {};
        const attendees = await enrichAttendees(this.graph, parseAttendees(d, e.id));
        items.push(buildListItem(e, d, attendees));
      }
      return { items, total, limit, offset };
    }

    // P2: ONE window — page of meetings.calendar_event ordered by the details
    // facet's starts_at DESC, each row carrying its latest details facet inline.
    const win = await this.graph.list_entities_window({
      schema: CAL,
      facet_schema: CAL_DETAILS,
      order: [{ field: { facet_schema: CAL_DETAILS, facet_path: "starts_at" }, desc: true }],
      limit,
      offset,
    });
    const items: MeetingListItem[] = [];
    for (const { entity, data } of win.items) {
      const d = (data ?? {}) as Data;
      const attendees = await enrichAttendees(this.graph, parseAttendees(d, entity.id));
      items.push(buildListItem(entity, d, attendees));
    }
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
    if (!detail || detail.entity.schema_id !== CAL) {
      throw new Error(`meeting ${params.id} not found`);
    }
    const { entity, facets, links } = detail;
    const d = (facets.find((f) => f.schema_id === CAL_DETAILS)?.data as Data | undefined) ?? {};

    const attendees = await enrichAttendees(this.graph, parseAttendees(d, entity.id));
    const { date, time } = formatDateTime(
      str(d, "starts_at") ?? undefined,
      str(d, "ends_at") ?? undefined,
    );

    const facetSummaries: FacetSummary[] = facets.map((f) => ({
      id: f.id,
      schema_id: f.schema_id,
      source: f.source,
      observed_at: f.observed_at,
      data: f.data,
    }));

    // Resolve link neighbours (created-by project, attendee contacts, …) for the
    // Context panel. Link edges carry ids + kind only; one batch get_entities
    // (user-scoped → drops non-owned targets) hydrates names/schemas.
    const linked_entities: LinkedEntitySummary[] = [];
    if (links.length > 0) {
      const neighbourId = (l: { from_id: string; to_id: string }) =>
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
      facets: facetSummaries,
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
        context: { type: "string" },
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
      .filter((e) => (query.length === 0 ? true : (e.name ?? "").toLowerCase().includes(query)))
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

    if (params.limit != null && results.length > params.limit) {
      results = results.slice(0, params.limit);
    }

    return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
  }

  // ── meetings.create (@writeTool) ──────────────────────────────
  // Operator/agent create. Validates BEFORE any write (INV-3), idempotent on
  // client_id (INV-4), returns the native snapshot shape (INV-13). The facet is
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
    // Validate BEFORE touching the graph (INV-3 / native messages).
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

    // Idempotency (INV-4): an existing client_id returns the existing entity,
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

    const data: MeetingCalendarEventDetails = {
      title: params.title,
      starts_at: params.starts_at,
      ends_at: params.ends_at,
      attendees: normalizeAttendees(params.attendees),
      updated_at: now,
    };
    if (params.description != null) data.description = params.description;
    if (params.location != null) data.location = params.location;

    await this.graph.attach_facet({
      entity_id: entity.id,
      schema_id: CAL_DETAILS,
      data,
      confidence: 100,
    });

    return this.snapshot(entity.id, params);
  }

  /// Build the native create snapshot (INV-13): id + the canonical fields,
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
    if (params.description != null) snap.description = params.description;
    if (params.location != null) snap.location = params.location;
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
    const envelopes = Array.isArray(params?.envelopes) ? params.envelopes : [];

    // INV-8: validate ALL user_ids before any write so a bad envelope writes
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
    const id = await this.graph.find_by_external_id(env.remote_id);
    if (id) await this.graph.delete_entity(id);
  }

  /// Upsert one calendar event + its details facet (idempotent on external_id),
  /// then, for LIVE events, assemble the trigger.check with attendee address ids.
  private async ingestUpsert(env: SyncEnvelope, triggers: MeetingTriggerCheck[]): Promise<void> {
    const remoteId = env.remote_id!;
    const payload = env.payload as Data;
    const name = str(payload, "title") ?? "";

    const entity: BatchEntityInput = {
      key: remoteId,
      schema_id: CAL,
      name,
      facets: [{ schema_id: CAL_DETAILS, data: payload, external_id: remoteId, confidence: 90 }],
    };
    const result = await this.graph.apply_batch({ entities: [entity] });
    const entityId = result.ids[remoteId];
    if (!entityId) return;

    if (env.kind !== "live") return;

    // touched = [meeting, every attendee's email.address id]. email.address is
    // owned by the email plugin → resolve via its ensure_address RPC (DEC-6),
    // which converges on the shared hub id email:address:{lowercased}.
    const touched: string[] = [entityId];
    const attendees = Array.isArray(payload.attendees) ? (payload.attendees as Data[]) : [];
    for (const att of attendees) {
      const email = str(att, "email");
      if (!email) continue;
      const display = str(att, "name");
      const r = await this.rpc.execute<{ id: string }>("email.ensure_address", {
        address: email,
        display_name: display,
      });
      if (r?.id) touched.push(r.id);
    }

    triggers.push({
      type: "trigger.check",
      event_kind: "new_meeting",
      schema_id: "meetings.meeting",
      entity_id: entityId,
      phase: "live",
      touched_entity_ids: touched,
      user_id: env.user_id,
      context: { title: name.length > 0 ? name : null, remote_id: remoteId },
    });
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
