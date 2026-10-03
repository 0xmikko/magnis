// Notes plugin — backend module (V8). Decorated class; graph-only port of the
// native `backend/src/modules/notes` service (no on-disk `.md` mirror, no sync
// ingest). Ownership: single-entity reads + every mutation enforce it via the
// user-scoped `getEntityFull` precheck (raw `getEntity`/`attach_facet` are
// NOT user-scoped); `list`/`search` rely instead on the host's already
// user-scoped `listEntitiesWindow` / `searchEntitiesByName` ops.

import { errText, linkedEntitySummary, rpc, tool, writeTool, type GraphService,
  type PluginDeps, type PluginLogger } from "@magnis/plugin-sdk";
import type { Entity, EntityWithLinks, LinkedEntitySummary, PaginatedResponse } from "@magnis/sdk";
import type {
  ContentData,
  CreateParams,
  DeleteParams,
  GetParams,
  NoteCanonical,
  NoteDetailView,
  NoteListItem,
  NoteSnapshot,
  NotesListParams,
  TemplateApplyParams,
  UpdateParams,
} from "../types.ts";
import { NOTE } from "../schema.ts";
import { isValidUuid, previewFromBody, renderTemplate } from "./helpers.ts";
import { BODY_ONE_OF, resolveBody, resolveUpdateBody } from "../ui/toolArgs.ts";

// One spec per method: an rpc() stacked on a tool publishes the same input.
const GET_SPEC = {
  description: "Get a full note detail view by entity id.",
  params: {
    type: "object",
    properties: { id: { type: "string", format: "uuid" } },
    required: ["id"],
    additionalProperties: false,
  },
};

const TEMPLATE_APPLY_PARAMS = {
  type: "object",
  properties: {
    template: { type: "string", description: "Template name" },
    title: { type: "string", description: "Note title" },
    variables: { type: "object", description: "Optional variables for template interpolation" },
  },
  required: ["template", "title"],
  additionalProperties: false,
};

const CREATE_SPEC = {
  description: "Create a note from markdown or a named template.",
  // @tested-by: tst_module_notes_forms_001
  params: { oneOf: [...BODY_ONE_OF.map(({ required }) => ({
    type: "object",
    properties: {
      title: { type: "string", description: "Note title" },
      body: { type: "string", description: "Markdown content" },
      content: {
        type: "string",
        description: "Markdown content — MCP-compatible alias for `body`. Supply one, not both.",
      },
      client_id: {
        type: "string",
        format: "uuid",
        description: "Client-generated UUID for optimistic / idempotent create",
      },
    },
    required: ["title", ...required],
    additionalProperties: false,
  })), TEMPLATE_APPLY_PARAMS] },
};

const UPDATE_SPEC = {
  description:
    "Update an existing note's title and/or body. Both are optional — only provided fields are updated.",
  params: {
    type: "object",
    properties: {
      id: { type: "string", format: "uuid", description: "Entity ID of the note" },
      title: { type: "string", description: "New title (optional)" },
      body: { type: "string", description: "New markdown body (optional)" },
      content: {
        type: "string",
        description: "New markdown body — MCP alias for `body`. Supply one, not both.",
      },
    },
    required: ["id"],
    additionalProperties: false,
  },
};

const DELETE_SPEC = {
  description: "Delete a note by entity id.",
  params: {
    type: "object",
    properties: { id: { type: "string", format: "uuid" } },
    required: ["id"],
    additionalProperties: false,
  },
};

export class NotesModule {
  private readonly graph: GraphService;
  private readonly log: PluginLogger;
  constructor(deps: PluginDeps) {
    this.graph = deps.graph;
    this.log = deps.log;
  }

  /// DEC-7/INV-22: a compensated write is an operational branch, so it reports
  /// itself. Kept per-module rather than shared — see the note in the triggers
  /// module; the earlier "crosses a repo boundary" justification was wrong.
  private async logFailure(
    decision: string,
    entityId: string,
    reason: unknown,
    rollbackReason?: unknown,
  ): Promise<void> {
    await this.log.log("warn", decision, {
      entity_id: entityId,
      reason: errText(reason),
      ...(rollbackReason === undefined ? {} : { rollback_reason: errText(rollbackReason) }),
    });
  }

  @rpc("list", {
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
      // batch reads — records (preview/body) AND canonical (pinned/updated_at/
      // title), so the item stays byte-identical to the old per-row build while
      // dropping the 2N+1 N+1.
      const all = await this.graph.searchEntitiesByName({
        query: search,
        schemaIds: [NOTE],
        limit: limit + offset,
      });
      const total = all.length;
      const page = all.slice(offset, offset + limit);
      // S1: the dictionary rides the entity — the record and canonical batch
      // reads (two round-trips per page) are gone.
      const items = page.map((e) => this.listItemFromParts(e, contentOf(e), {}));
      return { items, total, limit, offset };
    }

    // No search: windowed list ordered by the dictionary's `updated_at`
    // (most-recently-edited first) — S1 moved note state into
    // `entity.properties`, and an order key on the frozen record would never
    // see an edit again. Preview renders from the same dictionary; no record
    // is read.
    const win = await this.graph.listEntitiesWindow({
      schema: NOTE,
      order: [{ field: { propertyPath: "updated_at" }, desc: true }],
      limit,
      offset,
    });
    // S1: the dictionary rides the window's entity; the inlined render record
    // is the frozen archive and is not read.
    const items = win.items.map((e) => this.listItemFromParts(e, contentOf(e), {}));
    return { items, total: win.total, limit, offset };
  }

  @rpc("get", GET_SPEC)
  @tool("get", { entity: "notes.note", ...GET_SPEC })
  async get(params: GetParams): Promise<NoteDetailView> {
    const detail = await this.graph.getEntityFull(params.id, { links: true });
    // NotFound for a non-owned id (getEntityFull is user-scoped → null) AND for
    // an id that belongs to a different schema — a notes tool must never touch a
    // contact/project/etc. entity.
    if (detail?.entity.schemaId !== NOTE) {
      throw new Error(`note not found: ${params.id}`);
    }
    const e = detail.entity;
    const data = contentOf(e);
    // S6: the note's dictionary is the record — nothing resolves into
    // canonical any more, and the DTO keeps the field only until the wire
    // shape drops it.
    const canonical = {};
    const pinned = data.pinned ?? false;

    // Resolve link neighbours via ONE getEntities batch (user-scoped →
    // drops non-owned targets, same visibility rule as the old per-link
    // getEntityFull) — no per-link N+1.
    const linked: LinkedEntitySummary[] = [];
    if (detail.links.length > 0) {
      const neighbourId = (l: { from: string; to: string }): string =>
        l.from === e.id ? l.to : l.from;
      const targets = await this.graph.getEntities([
        ...new Set(detail.links.map(neighbourId)),
      ]);
      const byId = new Map(targets.map((t) => [t.id, t]));
      for (const link of detail.links) {
        const t = byId.get(neighbourId(link));
        if (!t) continue;
        linked.push(linkedEntitySummary(t, link, link.kind));
      }
    }

    return {
      id: e.id,
      schemaId: e.schemaId,
      title: this.titleOf(e, data),
      body: data.body ?? null,
      pinned,
      canonical,
      linkedEntities: linked,
      createdAt: e.createdAt,
      updatedAt: data.updated_at ?? null,
    };
  }

  @rpc("create", CREATE_SPEC)
  @writeTool("create", { entity: "notes.note", ...CREATE_SPEC })
  async create(params: CreateParams | TemplateApplyParams): Promise<NoteSnapshot> {
    if ("template" in params) {
      if ("body" in params || "content" in params) throw new Error("Supply content or a template, not both");
      return this.template_apply(params);
    }
    if (params.client_id !== undefined && !isValidUuid(params.client_id)) {
      throw new Error("client_id must be a valid UUID");
    }
    // Idempotency: a repeated client_id returns the existing note (as the full
    // snapshot), no second entity (native service.rs:376-380).
    if (params.client_id) {
      // Idempotent only against an existing NOTE. A client_id colliding with a
      // non-note entity is not a note hit — fall through; createEntity will
      // Conflict on the id rather than return a fake note snapshot.
      // @tested-by: tst_module_notes_identity_001
      const existingEntity = await this.graph.getEntity(params.client_id);
      if (existingEntity?.schemaId === NOTE) {
        const existing = await this.graph.getEntityFull(params.client_id, { links: false });
        if (!existing) {
          throw new Error(`existing note ${params.client_id} has no detail snapshot`);
        }
        return this.snapshotFromDetail(existing);
      }
    }

    // @tested-by: tst_module_notes_write_001
    // @invariant: INV-1 — exactly one of `body`/`content`, non-blank. Resolved
    // AFTER the client_id short-circuit above: an idempotent retry returns the
    // EXISTING note and must not be forced to resend the body it already stored.
    const body = resolveBody(params);
    const now = new Date().toISOString();
    // Store the body verbatim. We deliberately do NOT inject a `# ${title}`
    // heading for empty notes (the native file-era default): the title lives in
    // its own field, so a body heading only duplicates it and goes stale on
    // rename (old title left visible in the body).
    const entity = await this.graph.createEntity({
      schemaId: NOTE,
      name: params.title,
      ...(params.client_id === undefined ? {} : { clientId: params.client_id }),
    });
    // @tested-by: tst_module_notes_write_001
    // @invariant: INV-2 — create is externally atomic. A failed content write
    // must not leave a title-only note in the user's graph; that orphan is what
    // rendered as "an empty note appeared and everything broke".
    try {
      await this.writeContent(entity.id, params.title, body, now);
    } catch (writeError) {
      try {
        await this.graph.deleteEntity(entity.id);
      } catch (rollbackError) {
        await this.logFailure("note create rollback failed", entity.id, writeError, rollbackError);
        throw new Error(
          `note content write and rollback both failed for ${entity.id}: ` +
            `write=${errText(writeError)}; rollback=${errText(rollbackError)}`,
          { cause: rollbackError },
        );
      }
      await this.logFailure("note create rolled back", entity.id, writeError);
      throw writeError;
    }

    return { id: entity.id, schemaId: NOTE, title: params.title, body, updatedAt: now };
  }

  @rpc("update", UPDATE_SPEC)
  @writeTool("update", { entity: "notes.note", ...UPDATE_SPEC })
  async update(params: UpdateParams): Promise<NoteSnapshot> {
    const detail = await this.graph.getEntityFull(params.id, { links: false });
    if (detail?.entity.schemaId !== NOTE) {
      throw new Error(`note not found: ${params.id}`);
    }
    const e = detail.entity;
    const data = contentOf(e);
    const currentTitle = this.titleOf(e, data);
    const newTitle = params.title ?? currentTitle;
    const newBody = resolveUpdateBody(params) ?? data.body ?? "";
    const now = new Date().toISOString();
    // @tested-by: tst_module_notes_write_004
    // @invariant: INV-25 — the compensation must restore the note as it WAS,
    // including its timestamp. Rewriting it with `now` changed `updated_at`,
    // which reorders the note in the list (ordered by that very field), so a
    // failed update still moved it.
    const previousUpdatedAt = data.updated_at ?? now;

    // @tested-by: tst_module_notes_write_002
    // @invariant: INV-25 — content first, then the rename. The old order left a
    // note renamed for content it never received when the record write failed.
    // If the rename then fails, the prior content is restored so neither half
    // is applied alone.
    await this.writeContent(params.id, newTitle, newBody, now);
    if (params.title !== undefined && newTitle !== currentTitle) {
      try {
        await this.graph.updateEntityName(params.id, newTitle);
      } catch (renameError) {
        try {
          await this.writeContent(params.id, currentTitle, data.body ?? "", previousUpdatedAt);
        } catch (rollbackError) {
          // The host serialises a thrown error as `String(e.stack)`
          // (magnis-app backend/src/plugin_runtime/lifecycle.rs) and a stack
          // carries neither `.errors` nor `.cause`, so an AggregateError here
          // reached the operator naming NEITHER failure.
          await this.logFailure("note rename rollback failed", params.id, renameError, rollbackError);
          throw new Error(
            `note rename and content rollback both failed for ${params.id}: ` +
              `rename=${errText(renameError)}; rollback=${errText(rollbackError)}`,
            { cause: rollbackError },
          );
        }
        await this.logFailure("note rename rolled back", params.id, renameError);
        throw renameError;
      }
    }

    // Full snapshot so the chat surface renders without a lazy fetch.
    return { id: params.id, schemaId: NOTE, title: newTitle, body: newBody, updatedAt: now };
  }

  @rpc("delete", DELETE_SPEC)
  @writeTool("delete", { entity: "notes.note", ...DELETE_SPEC })
  async delete(params: DeleteParams): Promise<{ deleted: boolean }> {
    const detail = await this.graph.getEntityFull(params.id, { links: false });
    if (detail?.entity.schemaId !== NOTE) {
      throw new Error(`note not found: ${params.id}`);
    }
    await this.graph.deleteEntity(params.id);
    return { deleted: true };
  }

  @rpc("template.apply", {
    description: "Create a note from a named template.",
    params: TEMPLATE_APPLY_PARAMS,
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

  /// Attach a fresh `notes.note.content` record and re-derive canonicals.
  /// `pinned` is always written false (native parity — pinning is a separate
  /// `graph.entity.pin` op, not part of the note body write).
  private async writeContent(
    entityId: string,
    title: string,
    body: string,
    updatedAt: string,
  ): Promise<void> {
    // S1 (canonical-graph-structure): the note's state is the node's
    // dictionary. One write, no canonical resolution pass, and an edit stops
    // being an accidental collection (the record path appended a row per save).
    await this.graph.updateProperties({
      entityId,
      properties: { title, body, pinned: false, updated_at: updatedAt },
    });
  }

  private titleOf(e: Entity, data: ContentData): string {
    if (e.name && e.name.length > 0) return e.name;
    if (data.title && data.title.length > 0) return data.title;
    return "Untitled";
  }

  // Pure list-item shaping from an entity + its content record data + its
  // canonical map. The search path passes batch-fetched records + canonical so it
  // stays byte-identical to the old per-row build; the window path passes `{}`
  // canonical. No graph access.
  private listItemFromParts(
    e: Entity,
    data: ContentData,
    canonical: Partial<NoteCanonical>,
  ): NoteListItem {
    return {
      id: e.id,
      schemaId: e.schemaId,
      title: this.titleOf(e, data),
      preview: previewFromBody(data.body ?? ""),
      pinned: (canonical["note.pinned"] as boolean | null) ?? data.pinned ?? false,
      createdAt: e.createdAt,
      updatedAt: data.updated_at ?? null,
      isPinned: e.isPinned,
    };
  }

  private snapshotFromDetail(detail: EntityWithLinks): NoteSnapshot {
    const e = detail.entity;
    const data = contentOf(e);
    return {
      id: e.id,
      schemaId: NOTE,
      title: this.titleOf(e, data),
      body: data.body ?? "",
      updatedAt: data.updated_at ?? e.createdAt,
    };
  }
}

/// S1: the note's dictionary IS its state; the frozen retired archive is not
/// read. A note's dictionary is the `ContentData` this module writes.
function contentOf(e: Entity): ContentData {
  return e.properties as ContentData;
}
