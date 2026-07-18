// Notes plugin — backend module (V8). Decorated class; graph-only port of the
// native `backend/src/modules/notes` service (no on-disk `.md` mirror, no sync
// ingest). Ownership: single-entity reads + every mutation enforce it via the
// user-scoped `get_entity_full` precheck (raw `get_entity`/`attach_facet` are
// NOT user-scoped); `list`/`search` rely instead on the host's already
// user-scoped `list_entities_window` / `search_entities_by_name` ops.

import { tool, writeTool, type GraphService, type PluginDeps } from "@magnis/plugin-sdk";
import type { EntityDetail, PaginatedResponse, RawEntity, WindowRow } from "@magnis/plugin-sdk";
import type {
  CreateParams,
  DeleteParams,
  GetParams,
  LinkedEntitySummary,
  NoteCanonical,
  NoteDetailView,
  NoteFacets,
  NoteListItem,
  NoteSnapshot,
  NotesListParams,
  TemplateApplyParams,
  UpdateParams,
} from "../types/index.ts";
import { previewFromBody, renderTemplate } from "./helpers.ts";

const ENTITY = "notes.note";
const CONTENT = "notes.note.content";

/// Hyphenated 8-4-4-4-12 hex (matches crypto.randomUUID + the Rust uuid parser's
/// hyphenated form). Native `notes.create` rejected a non-UUID client_id with a
/// 400 before touching the graph (controller.rs:154-158).
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

interface ContentData {
  title?: string;
  body?: string;
  pinned?: boolean;
  updated_at?: string;
}

export class NotesModule {
  private readonly graph: GraphService<NoteFacets, NoteCanonical>;
  constructor(deps: PluginDeps<NoteFacets, NoteCanonical>) {
    this.graph = deps.graph;
  }

  @tool("list", {
    description: "List notes with pagination and optional search by title.",
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
  async list(params: NotesListParams): Promise<PaginatedResponse<NoteListItem>> {
    const limit = params.limit ?? 100;
    const offset = params.offset ?? 0;
    const search = (params.search ?? "").trim();

    if (search) {
      // Search path: name match returns ids only; hydrate ONLY the page in TWO
      // batch reads — facets (preview/body) AND canonical (pinned/updated_at/
      // title), so the item stays byte-identical to the old per-row build while
      // dropping the 2N+1 N+1.
      const all = await this.graph.search_entities_by_name({
        query: search,
        schema_ids: [ENTITY],
        limit: limit + offset,
      });
      const total = all.length;
      const page = all.slice(offset, offset + limit);
      const ids = page.map((e) => e.id);
      const facets = await this.graph.list_facets_for_entities(ids);
      const canon = await this.graph.list_canonical_for_entities(ids);
      const dataById = new Map<string, ContentData>();
      for (const f of facets) {
        if (f.schema_id === CONTENT && f.entity_id && !dataById.has(f.entity_id)) {
          dataById.set(f.entity_id, (f.data ?? {}));
        }
      }
      const canonById = new Map<string, Partial<NoteCanonical>>();
      for (const c of canon) {
        if (!c.entity_id) continue;
        const m = (canonById.get(c.entity_id) ?? {}) as Record<string, unknown>;
        m[c.key] = c.value;
        canonById.set(c.entity_id, m);
      }
      const items = page.map((e) =>
        this.listItemFromParts(e, dataById.get(e.id) ?? {}, canonById.get(e.id) ?? {}),
      );
      return { items, total, limit, offset };
    }

    // No search: P2 windowed list ordered by the content facet's `updated_at`
    // (most-recently-edited first), with the body facet inline for the preview
    // and the exact total — one statement. This also stands in for the dropped
    // native `update_entity_date` recency (no such SDK op).
    const win = await this.graph.list_entities_window({
      schema: ENTITY,
      facet_schema: CONTENT,
      order: [{ field: { facet_schema: CONTENT, facet_path: "updated_at" }, desc: true }],
      limit,
      offset,
    });
    const items = win.items.map((row) => this.listItemFromWindow(row));
    return { items, total: win.total, limit, offset };
  }

  @tool("get", {
    description: "Get a full note detail view by entity id.",
    params: {
      type: "object",
      properties: { id: { type: "string", format: "uuid" } },
      required: ["id"],
      additionalProperties: false,
    },
  })
  async get(params: GetParams): Promise<NoteDetailView> {
    const detail = await this.graph.get_entity_full(params.id, { links: true });
    // NotFound for a non-owned id (get_entity_full is user-scoped → null) AND for
    // an id that belongs to a different schema — a notes tool must never touch a
    // contact/project/etc. entity.
    if (!detail || detail.entity.schema_id !== ENTITY) {
      throw new Error(`note not found: ${params.id}`);
    }
    const e = detail.entity;
    const data = this.contentOf(detail);
    const canonical = await this.graph.get_canonical(e.id, [ENTITY]);
    const pinned = (canonical["note.pinned"] as boolean | null) ?? data.pinned ?? false;

    // Resolve link neighbours via ONE get_entities batch (P5, user-scoped →
    // drops non-owned targets, same Codex-3 visibility rule as the old per-link
    // get_entity_full) — no per-link N+1.
    const linked: LinkedEntitySummary[] = [];
    if (detail.links.length > 0) {
      const neighbourId = (l: { from_id: string; to_id: string }) =>
        l.from_id === e.id ? l.to_id : l.from_id;
      const targets = await this.graph.get_entities([
        ...new Set(detail.links.map(neighbourId)),
      ]);
      const byId = new Map(targets.map((t) => [t.id, t]));
      for (const link of detail.links) {
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
      title: this.titleOf(e, data, canonical),
      body: data.body ?? null,
      pinned,
      canonical,
      facets: detail.facets,
      linked_entities: linked,
      created_at: e.created_at ?? new Date(0).toISOString(),
      updated_at: data.updated_at ?? (canonical["note.updated_at"] as string | null) ?? null,
    };
  }

  @writeTool("create", {
    description: "Create a new note with title and markdown body.",
    params: {
      type: "object",
      properties: {
        title: { type: "string", description: "Note title" },
        body: { type: "string", description: "Markdown content" },
        client_id: {
          type: "string",
          format: "uuid",
          description: "Client-generated UUID for optimistic / idempotent create",
        },
      },
      required: ["title", "body"],
      additionalProperties: false,
    },
  })
  async create(params: CreateParams): Promise<NoteSnapshot> {
    if (params.client_id !== undefined && !UUID_RE.test(params.client_id)) {
      throw new Error("client_id must be a valid UUID");
    }
    // Idempotency: a repeated client_id returns the existing note (as the full
    // snapshot), no second entity (native service.rs:376-380).
    if (params.client_id) {
      // Idempotent only against an existing NOTE. A client_id colliding with a
      // non-note entity is not a note hit — fall through; create_entity will
      // Conflict on the id rather than return a fake note snapshot.
      const existing = await this.graph.get_entity_full(params.client_id, { links: false });
      if (existing && existing.entity.schema_id === ENTITY) {
        return this.snapshotFromDetail(existing);
      }
    }

    const now = new Date().toISOString();
    // Store the body verbatim. We deliberately do NOT inject a `# ${title}`
    // heading for empty notes (the native file-era default): the title lives in
    // its own field, so a body heading only duplicates it and goes stale on
    // rename (old title left visible in the body).
    const body = params.body;
    const entity = await this.graph.create_entity({
      schema_id: ENTITY,
      name: params.title,
      client_id: params.client_id,
    });
    await this.writeContent(entity.id, params.title, body, now);

    return { id: entity.id, schema_id: ENTITY, title: params.title, body, updated_at: now };
  }

  @writeTool("update", {
    description:
      "Update an existing note's title and/or body. Both are optional — only provided fields are updated.",
    params: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid", description: "Entity ID of the note" },
        title: { type: "string", description: "New title (optional)" },
        body: { type: "string", description: "New markdown body (optional)" },
      },
      required: ["id"],
      additionalProperties: false,
    },
  })
  async update(params: UpdateParams): Promise<NoteSnapshot> {
    const detail = await this.graph.get_entity_full(params.id, { links: false });
    if (!detail || detail.entity.schema_id !== ENTITY) {
      throw new Error(`note not found: ${params.id}`);
    }
    const e = detail.entity;
    const data = this.contentOf(detail);
    const currentTitle = this.titleOf(e, data, {});
    const newTitle = params.title ?? currentTitle;
    const newBody = params.body ?? data.body ?? "";
    const now = new Date().toISOString();

    if (params.title !== undefined && newTitle !== currentTitle) {
      await this.graph.update_entity_name(params.id, newTitle);
    }
    await this.writeContent(params.id, newTitle, newBody, now);

    // Full snapshot so the chat surface renders without a lazy fetch.
    return { id: params.id, schema_id: ENTITY, title: newTitle, body: newBody, updated_at: now };
  }

  @writeTool("delete", {
    description: "Delete a note by entity id.",
    params: {
      type: "object",
      properties: { id: { type: "string", format: "uuid" } },
      required: ["id"],
      additionalProperties: false,
    },
  })
  async delete(params: DeleteParams): Promise<{ deleted: boolean }> {
    const detail = await this.graph.get_entity_full(params.id, { links: false });
    if (!detail || detail.entity.schema_id !== ENTITY) {
      throw new Error(`note not found: ${params.id}`);
    }
    await this.graph.delete_entity(params.id);
    return { deleted: true };
  }

  @writeTool("template.apply", {
    description:
      "Create a new note from a template. Templates: outreach_tracker, comparison_table, meeting_prep, follow_up_plan.",
    params: {
      type: "object",
      properties: {
        template: { type: "string", description: "Template name" },
        title: { type: "string", description: "Note title" },
        variables: { type: "object", description: "Optional variables for template interpolation" },
      },
      required: ["template", "title"],
      additionalProperties: false,
    },
  })
  async template_apply(params: TemplateApplyParams): Promise<NoteSnapshot> {
    // Native parity (controller.rs:188-191): required params are validated with
    // explicit messages before rendering.
    if (!params.template) throw new Error("missing required param: template");
    if (!params.title) throw new Error("missing required param: title");
    const body = renderTemplate(params.template, params.title, params.variables);
    return this.create({ title: params.title, body });
  }

  // ── private helpers ──────────────────────────────────────────────

  /// Attach a fresh `notes.note.content` facet and re-derive canonicals.
  /// `pinned` is always written false (native parity — pinning is a separate
  /// `graph.entity.pin` op, not part of the note body write).
  private async writeContent(
    entityId: string,
    title: string,
    body: string,
    updatedAt: string,
  ): Promise<void> {
    await this.graph.attach_facet({
      entity_id: entityId,
      schema_id: CONTENT,
      data: { title, body, pinned: false, updated_at: updatedAt },
    });
    await this.graph.resolve_canonical(entityId);
  }

  private contentOf(detail: EntityDetail): ContentData {
    const content = detail.facets.find((f) => f.schema_id === CONTENT);
    return (content?.data ?? {});
  }

  private titleOf(e: RawEntity, data: ContentData, canonical: Partial<NoteCanonical>): string {
    if (e.name && e.name.length > 0) return e.name;
    if (data.title && data.title.length > 0) return data.title;
    const ct = canonical["note.title"];
    if (typeof ct === "string" && ct.length > 0) return ct;
    return "Untitled";
  }

  private listItemFromWindow(row: WindowRow): NoteListItem {
    // No-search path: the window inlines the latest content facet only; canonical
    // is not consulted (its keys are latest-wins from this same facet).
    return this.listItemFromParts(row.entity, (row.data ?? {}), {});
  }

  // Pure list-item shaping from an entity + its content facet data + its
  // canonical map. The search path passes batch-fetched facets + canonical so it
  // stays byte-identical to the old per-row build; the window path passes `{}`
  // canonical. No graph access.
  private listItemFromParts(
    e: RawEntity & { created_at?: string; is_pinned?: boolean | null },
    data: ContentData,
    canonical: Partial<NoteCanonical>,
  ): NoteListItem {
    return {
      id: e.id,
      schema_id: e.schema_id,
      title: this.titleOf(e, data, canonical),
      preview: previewFromBody(data.body ?? ""),
      pinned: (canonical["note.pinned"] as boolean | null) ?? data.pinned ?? false,
      created_at: e.created_at ?? new Date(0).toISOString(),
      updated_at: data.updated_at ?? (canonical["note.updated_at"] as string | null) ?? null,
      is_pinned: e.is_pinned ?? null,
    };
  }

  private snapshotFromDetail(detail: EntityDetail): NoteSnapshot {
    const e = detail.entity;
    const data = this.contentOf(detail);
    return {
      id: e.id,
      schema_id: ENTITY,
      title: this.titleOf(e, data, {}),
      body: data.body ?? "",
      updated_at: data.updated_at ?? e.created_at ?? new Date(0).toISOString(),
    };
  }
}
