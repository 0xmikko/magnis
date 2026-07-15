// Projects plugin — backend module (V8). Mirrors the legacy Rust
// ProjectsModuleController/Service 1:1 (controller.rs + service.rs).
//
// Reads use the efficient graph read-API: list → list_entities (order:"date",
// preserves pinned-first) / search_entities_by_name, then ONE
// list_canonical_for_entities batch (canonical fields, no per-row get_canonical
// N+1); get → get_entity_full (P1) + get_entities (P5); list_for_entity →
// list_linked (P3) + canonical batch. Fixed, N-independent crossing counts.

import {
  tool,
  writeTool,
  rpc,
  type GraphService,
  type PluginDeps,
  type GetParams,
  type PaginatedResponse,
  type LinkSummary,
  type RawEntity,
} from "@magnis/plugin-sdk";
import type {
  ChecklistGetParams,
  ChecklistItem,
  ChecklistUpdateParams,
  CreateParams,
  ListForEntityParams,
  MemberParams,
  ProjectCanonical,
  ProjectDetailView,
  ProjectFacets,
  ProjectListItem,
  ProjectsListParams,
  UpdateParams,
  LinkedEntitySummary,
} from "../types/index.ts";
import { buildProjectListItem, canonicalString } from "./helpers.ts";

const SCHEMA = "projects.project";
const CHECKLIST_SCHEMA = "projects.project.checklist";
const MEMBER_LINK = "belongs_to";

export class ProjectsModule {
  private readonly graph: GraphService<ProjectFacets, ProjectCanonical>;
  constructor(deps: PluginDeps<ProjectFacets, ProjectCanonical>) {
    this.graph = deps.graph;
  }

  @tool("list", {
    description: "List projects with pagination and optional search.",
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
  async list(params: ProjectsListParams): Promise<PaginatedResponse<ProjectListItem>> {
    const limit = params.limit ?? 100;
    const offset = params.offset ?? 0;
    const search = params.search?.trim();

    let rows: Array<{ id: string; schema_id: string; name: string; created_at?: string; is_pinned?: boolean | null }>;
    let total: number;
    if (search) {
      // search returns up to limit+offset, then we page in memory (native parity).
      const matched = await this.graph.search_entities_by_name({
        query: search,
        schema_ids: [SCHEMA],
        limit: limit + offset,
      });
      total = matched.length;
      rows = matched.slice(offset, offset + limit);
    } else {
      // Keep list_entities(order:"date") — its SQL applies pinned-first /
      // pin_order ASC then date DESC, which list_entities_window does NOT
      // reproduce. (The window would silently drop the pinned-first ordering.)
      const page = await this.graph.list_entities({ schema_id: SCHEMA, order: "date", limit, offset });
      rows = page.items;
      total = page.total;
    }

    // Hydrate the page's canonical (project.name/status) in ONE batch read —
    // canonical, not the latest facet (project.* are single_aligned, confidence→
    // recency), so it reproduces staging's get_canonical values without N+1.
    const canonById = await this.canonicalByEntity(rows.map((e) => e.id));
    const items = rows.map((e) => buildProjectListItem(e, canonById.get(e.id) ?? {}));
    return { items, total, limit, offset };
  }

  @tool("get", {
    description: "Get a project detail view by entity id.",
    params: {
      type: "object",
      properties: { id: { type: "string", format: "uuid" } },
      required: ["id"],
      additionalProperties: false,
    },
  })
  async get(params: GetParams): Promise<ProjectDetailView> {
    // P1 (graph-read-api §4): entity + facets + link edges in ONE fetch.
    const detail = await this.graph.get_entity_full(params.id, { links: true });
    if (!detail) throw new Error(`project ${params.id} not found`);
    const { entity, facets, links } = detail;
    const canonical = await this.graph.get_canonical(entity.id, [SCHEMA]);

    const name =
      entity.name && entity.name.length > 0
        ? entity.name
        : (canonicalString(canonical, "project.name") ?? "Untitled Project");
    const status = canonicalString(canonical, "project.status");

    // P5 (batch): resolve ALL link neighbors in ONE statement (was a per-link
    // get_entity N+1). Outgoing → kind; incoming → "~kind" (native parity).
    const neighborIds = links.map((l) => (l.from_id === entity.id ? l.to_id : l.from_id));
    const byId = new Map((await this.graph.get_entities(neighborIds)).map((n) => [n.id, n]));
    const linked: LinkedEntitySummary[] = [];
    for (const l of links) {
      if (l.from_id === entity.id) {
        const t = byId.get(l.to_id);
        if (t) linked.push(linkSummary(t, l.kind));
      } else if (l.to_id === entity.id) {
        const s = byId.get(l.from_id);
        if (s) linked.push(linkSummary(s, `~${l.kind}`));
      }
    }

    return {
      id: entity.id,
      schema_id: entity.schema_id,
      name,
      status,
      canonical,
      facets,
      linked_entities: linked,
      created_at: entityCreatedAt(entity),
    };
  }

  @writeTool("create", {
    description: "Create a new project.",
    params: {
      type: "object",
      properties: {
        name: { type: "string", description: "Project name" },
        status: { type: "string", description: "Project status (default: active)" },
        client_id: { type: "string", format: "uuid", description: "Client-generated UUID for optimistic creation" },
      },
      required: ["name"],
      additionalProperties: false,
    },
  })
  async create(params: CreateParams): Promise<Record<string, unknown>> {
    if (!params.name || params.name.length === 0) {
      throw new Error("missing required param: name");
    }
    if (params.client_id !== undefined && !isUuid(params.client_id)) {
      throw new Error("client_id must be a valid UUID");
    }
    const statusVal = params.status ?? "active";
    // Idempotency on client_id (native service.rs:252).
    if (params.client_id) {
      const existing = await this.graph.get_entity(params.client_id);
      if (existing) {
        const facets = await this.graph.list_facets_for_entity(existing.id);
        const f = facets.find((x) => x.schema_id === SCHEMA);
        const existingStatus =
          (f?.data as { status?: string } | undefined)?.status ?? "active";
        return {
          id: existing.id,
          name: existing.name && existing.name.length > 0 ? existing.name : params.name,
          status: existingStatus,
          schema_id: SCHEMA,
          created_at: entityCreatedAt(existing),
        };
      }
    }

    const entity = await this.graph.create_entity({
      schema_id: SCHEMA,
      name: params.name,
      client_id: params.client_id,
    });
    await this.graph.attach_facet({
      entity_id: entity.id,
      schema_id: SCHEMA,
      data: { name: params.name, status: statusVal, created_at: new Date().toISOString() },
    });
    // Resolve canonical (project.name / project.status) from the facet —
    // native service.rs:309 calls resolve_canonical_for_entity.
    await this.graph.resolve_canonical(entity.id);
    return { id: entity.id, name: params.name, status: statusVal, schema_id: SCHEMA, created_at: entityCreatedAt(entity) };
  }

  @writeTool("update", {
    description:
      "Update a project's name, status, and/or description. The `description` " +
      "field is a markdown body stored in the `projects.description` facet — it " +
      "replaces the existing description outright, so callers maintaining a " +
      "running summary should fetch + append + write back.",
    params: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        name: { type: "string" },
        status: { type: "string" },
        description: {
          type: "string",
          description: "Markdown body for the project description (overwrites the existing one).",
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
  })
  async update(params: UpdateParams): Promise<ProjectDetailView> {
    const entity = await this.graph.get_entity(params.id);
    if (!entity) throw new Error(`project ${params.id} not found`);

    const facets = await this.graph.list_facets_for_entity(params.id);
    const existing = (facets.find((f) => f.schema_id === SCHEMA)?.data ?? {}) as Record<string, unknown>;
    const data: Record<string, unknown> = { ...existing };
    if (params.name !== undefined) {
      data.name = params.name;
      await this.graph.update_entity_name(params.id, params.name);
    }
    if (params.status !== undefined) data.status = params.status;
    data.updated_at = new Date().toISOString();

    await this.graph.attach_facet({ entity_id: params.id, schema_id: SCHEMA, data });
    // Description is a separate markdown facet (parity with native
    // projects.update / staging 7182e4af). Overwrites the existing body.
    if (params.description !== undefined) {
      await this.graph.attach_facet({
        entity_id: params.id,
        schema_id: "projects.description",
        data: { body: params.description },
      });
    }
    await this.graph.resolve_canonical(params.id);
    return this.get({ id: params.id });
  }

  @writeTool("delete", {
    description: "Delete a project by entity id.",
    params: {
      type: "object",
      properties: { id: { type: "string", format: "uuid" } },
      required: ["id"],
      additionalProperties: false,
    },
  })
  async delete(params: GetParams): Promise<{ deleted: boolean }> {
    const entity = await this.graph.get_entity(params.id);
    if (!entity) throw new Error(`project ${params.id} not found`);
    await this.graph.delete_entity(params.id);
    return { deleted: true };
  }

  @tool("checklist.get", {
    description: "Read the operational checklist for a project. Returns items array (empty if no checklist yet).",
    params: {
      type: "object",
      properties: { project_id: { type: "string", format: "uuid" } },
      required: ["project_id"],
      additionalProperties: false,
    },
  })
  async checklistGet(params: ChecklistGetParams): Promise<{ items: ChecklistItem[] }> {
    if (!params.project_id) throw new Error("missing required param: project_id");
    const entity = await this.requireProject(params.project_id);
    const facets = await this.graph.list_facets_for_entity(entity.id);
    const f = facets.find((x) => x.schema_id === CHECKLIST_SCHEMA);
    return (f?.data as { items: ChecklistItem[] } | undefined) ?? { items: [] };
  }

  @writeTool("checklist.update", {
    description: "Create or replace the operational checklist for a project.",
    params: {
      type: "object",
      properties: {
        project_id: { type: "string", format: "uuid" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              text: { type: "string" },
              status: { type: "string", enum: ["pending", "in_progress", "done", "blocked"] },
              notes: { type: "string" },
              updated_at: { type: "string", format: "date-time" },
            },
            required: ["id", "text", "status"],
          },
        },
      },
      required: ["project_id", "items"],
      additionalProperties: false,
    },
  })
  async checklistUpdate(params: ChecklistUpdateParams): Promise<{ status: string; project_id: string }> {
    if (!params.project_id) throw new Error("missing required param: project_id");
    await this.requireProject(params.project_id);
    await this.graph.attach_facet({
      entity_id: params.project_id,
      schema_id: CHECKLIST_SCHEMA,
      data: { items: params.items },
    });
    return { status: "ok", project_id: params.project_id };
  }

  // ── RPC-only (not agent tools): membership + reverse lookup ──────────
  @rpc("add_member")
  async addMember(params: MemberParams): Promise<{ status: string }> {
    await this.requireOwned(params.project_id);
    await this.requireOwned(params.entity_id);
    await this.graph.add_link({ from_id: params.entity_id, to_id: params.project_id, kind: MEMBER_LINK });
    return { status: "ok" };
  }

  @rpc("remove_member")
  async removeMember(params: MemberParams): Promise<{ status: string }> {
    await this.requireOwned(params.project_id);
    await this.requireOwned(params.entity_id);
    const links = await this.graph.list_links_for_entity(params.entity_id);
    const link = links.find(
      (l: LinkSummary) => l.from_id === params.entity_id && l.to_id === params.project_id && l.kind === MEMBER_LINK,
    );
    if (!link) throw new Error("Link not found");
    await this.graph.delete_link(link.id);
    return { status: "ok" };
  }

  @rpc("list_for_entity")
  async listForEntity(params: ListForEntityParams): Promise<ProjectListItem[]> {
    await this.requireOwned(params.entity_id);
    // P3: a parent's member projects over the belongs_to link, each row carrying
    // the projects.project render facet inline — ONE statement, replacing the
    // list_links + per-link get_entity N+1. `child_schema` enforces what the old
    // loop did with a per-target schema check. (limit 1000: a member entity
    // belongs to far fewer projects; logged cap vs the old unbounded loop.)
    const linked = await this.graph.list_linked({
      parent_id: params.entity_id,
      link_kind: MEMBER_LINK,
      direction: "out",
      child_schema: SCHEMA,
      limit: 1000,
      offset: 0,
    });
    // Hydrate the member projects' canonical (name/status) in ONE batch — the
    // list_linked render facet would not reproduce single_aligned canonical.
    const canonById = await this.canonicalByEntity(linked.items.map((r) => r.entity.id));
    return linked.items.map(({ entity }) =>
      buildProjectListItem(entity, canonById.get(entity.id) ?? {}),
    );
  }

  // Batch the given entities' canonical into a per-entity map in ONE crossing.
  private async canonicalByEntity(ids: string[]): Promise<Map<string, Partial<ProjectCanonical>>> {
    const out = new Map<string, Partial<ProjectCanonical>>();
    for (const c of await this.graph.list_canonical_for_entities(ids)) {
      if (!c.entity_id) continue;
      const m = (out.get(c.entity_id) ?? {}) as Record<string, unknown>;
      m[c.key] = c.value;
      out.set(c.entity_id, m as Partial<ProjectCanonical>);
    }
    return out;
  }

  // ── helpers ──────────────────────────────────────────────────────
  private async requireOwned(id: string): Promise<void> {
    if (!(await this.graph.get_entity(id))) throw new Error(`entity ${id} not found`);
  }
  private async requireProject(id: string): Promise<{ id: string; schema_id: string; name: string }> {
    const entity = await this.graph.get_entity(id);
    if (!entity) throw new Error(`project not found: ${id}`);
    if (entity.schema_id !== SCHEMA) throw new Error(`entity ${id} is not a project (schema: ${entity.schema_id})`);
    return entity;
  }
}

function linkSummary(
  e: { id: string; schema_id: string; name: string },
  kind: string,
): LinkedEntitySummary {
  return {
    id: e.id,
    name: e.name && e.name.length > 0 ? e.name : null,
    schema_id: e.schema_id,
    link_kind: kind,
    created_at: entityCreatedAt(e),
    data: null,
  };
}

function entityCreatedAt(e: RawEntity & { created_at?: string }): string {
  return e.created_at ?? new Date(0).toISOString();
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}
