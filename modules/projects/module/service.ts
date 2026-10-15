// Projects plugin — backend module (V8). Mirrors the legacy Rust
// ProjectsModuleController/Service 1:1 (controller.rs + service.rs).
//
// Reads use the efficient graph read-API: list → listEntities (order:"date",
// preserves pinned-first) / searchEntitiesByName, then ONE
// list_canonical_for_entities batch (canonical fields, no per-row get_canonical
// N+1); get → getEntityFull + getEntities; list_for_entity →
// listLinked + canonical batch. Fixed, N-independent crossing counts.

import {
  tool,
  writeTool,
  rpc,
  type GraphService,
  type PluginDeps,
  type GetParams,
} from "@magnis/plugin-sdk";
import type { EntityRead, Entity, JsonObject, JsonValue, LinkedEntitySummary, PaginatedResponse } from "@magnis/sdk";
import type {
  ChecklistGetParams,
  ChecklistItem,
  ChecklistUpdateParams,
  CreateParams,
  ListForEntityParams,
  MemberParams,
  ProjectDetailView,
  ProjectListItem,
  ProjectsListParams,
  UpdateParams,
} from "../types.ts";
import { MEMBER_LINK, PROJECT } from "../schema.ts";
import {
  buildProjectListItem,
  canonicalString,
  isUuid,
  linkSummary,
  projectCanonFromProperties,
} from "./helpers.ts";

// One spec per method: an rpc() stacked on a tool publishes the same input.
const ID_PARAMS = {
  type: "object",
  properties: { id: { type: "string", format: "uuid" } },
  required: ["id"],
  additionalProperties: false,
};

const GET_SPEC = { description: "Get a project detail view by entity id.", params: ID_PARAMS };

const CREATE_SPEC = {
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
};

const UPDATE_SPEC = {
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
};

const DELETE_SPEC = { description: "Delete a project by entity id.", params: ID_PARAMS };

const CHECKLIST_GET_SPEC = {
  description: "Read the operational checklist for a project. Returns items array (empty if no checklist yet).",
  params: {
    type: "object",
    properties: { project_id: { type: "string", format: "uuid" } },
    required: ["project_id"],
    additionalProperties: false,
  },
};

const CHECKLIST_UPDATE_SPEC = {
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
};

const MEMBER_PARAMS = {
  type: "object",
  properties: {
    project_id: { type: "string", format: "uuid" },
    entity_id: { type: "string", format: "uuid" },
  },
  required: ["project_id", "entity_id"],
  additionalProperties: false,
};

export class ProjectsModule {
  private readonly graph: GraphService;
  constructor(deps: PluginDeps) {
    this.graph = deps.graph;
  }

  @rpc("list", {
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

    let rows: EntityRead[];
    let total: number;
    if (search) {
      // search returns up to limit+offset, then we page in memory (native parity).
      const matched = await this.graph.searchEntitiesByName({
        query: search,
        schemaIds: [PROJECT],
        extras: true,
        limit: limit + offset,
      });
      total = matched.length;
      rows = matched.slice(offset, offset + limit);
    } else {
      // Keep listEntities(order:"date") — its SQL applies pinned-first /
      // pin_order ASC then date DESC, which listEntitiesWindow does NOT
      // reproduce. (The window would silently drop the pinned-first ordering.)
      const page = await this.graph.listEntities({ extras: true, schemaId: PROJECT, order: "date", limit, offset });
      rows = page.items;
      total = page.total;
    }

    // S1: the dictionary rides the entity — the page-wide canonical batch is gone.
    const items = rows.map((e) => buildProjectListItem(e, projectCanonFromProperties(e.entity)));
    return { items, total, limit, offset };
  }

  @rpc("get", GET_SPEC)
  @tool("get", { entity: "projects.project", ...GET_SPEC })
  async get(params: GetParams): Promise<ProjectDetailView> {
    // Entity + link edges in ONE fetch.
    const detail = await this.graph.getEntityFull(params.id, { links: true, extras: true });
    if (!detail) throw new Error(`project ${params.id} not found`);
    const { entity, links } = detail;
    const canonical = projectCanonFromProperties(entity);

    const name =
      entity.name && entity.name.length > 0
        ? entity.name
        : (canonicalString(canonical, "project.name") ?? "Untitled Project");
    const status = canonicalString(canonical, "project.status");

    // Batch: resolve ALL link neighbors in ONE statement (was a per-link
    // getEntity N+1). Outgoing → kind; incoming → "~kind" (native parity).
    const neighborIds = links.map((l) => (l.from === entity.id ? l.to : l.from));
    const byId = new Map((await this.graph.getEntities(neighborIds)).map((n) => [n.id, n]));
    const linked: LinkedEntitySummary[] = [];
    for (const l of links) {
      if (l.from === entity.id) {
        const t = byId.get(l.to);
        if (t) linked.push(linkSummary(t, l, l.kind));
      } else if (l.to === entity.id) {
        const s = byId.get(l.from);
        if (s) linked.push(linkSummary(s, l, `~${l.kind}`));
      }
    }

    return {
      id: entity.id,
      schemaId: entity.schemaId,
      name,
      status,
      canonical,
      linkedEntities: linked,
      extras: detail.extras,
      createdAt: entity.createdAt,
    };
  }

  @rpc("create", CREATE_SPEC)
  @writeTool("create", { entity: "projects.project", ...CREATE_SPEC })
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
      const existing = await this.graph.getEntity(params.client_id);
      if (existing) {
        // S1: the dictionary rides the entity.
        const existingStatus = (existing.properties as { status?: string }).status ?? "active";
        return {
          id: existing.id,
          name: existing.name && existing.name.length > 0 ? existing.name : params.name,
          status: existingStatus,
          schemaId: PROJECT,
          createdAt: existing.createdAt,
        };
      }
    }

    const entity = await this.graph.createEntity({
      schemaId: PROJECT,
      name: params.name,
      ...(params.client_id === undefined ? {} : { clientId: params.client_id }),
    });
    // S1: the project's state is the node's dictionary — one write, no
    // canonical resolution pass.
    await this.graph.updateProperties({
      entityId: entity.id,
      properties: { name: params.name, status: statusVal, created_at: new Date().toISOString() },
    });
    return { id: entity.id, name: params.name, status: statusVal, schemaId: PROJECT, createdAt: entity.createdAt };
  }

  @rpc("update", UPDATE_SPEC)
  @writeTool("update", { entity: "projects.project", ...UPDATE_SPEC })
  async update(params: UpdateParams): Promise<ProjectDetailView> {
    const entity = await this.graph.getEntity(params.id);
    if (!entity) throw new Error(`project ${params.id} not found`);

    const data: Record<string, JsonValue> = { ...(entity.properties as JsonObject) };
    // @tested-by: tst_mod_projects_update_001
    // @invariant: runtime JSON null for an optional field means "omitted"; it
    // must never erase the entity name or the existing project record value.
    if (typeof params.name === "string") {
      data.name = params.name;
      await this.graph.updateEntityName(params.id, params.name);
    }
    if (typeof params.status === "string") data.status = params.status;
    data.updated_at = new Date().toISOString();

    // Description overwrites its key in the same dictionary write.
    if (params.description !== undefined) data.description = params.description;
    await this.graph.updateProperties({ entityId: params.id, properties: data });
    return this.get({ id: params.id });
  }

  @rpc("delete", DELETE_SPEC)
  @writeTool("delete", { entity: "projects.project", ...DELETE_SPEC })
  async delete(params: GetParams): Promise<{ deleted: boolean }> {
    const entity = await this.graph.getEntity(params.id);
    if (!entity) throw new Error(`project ${params.id} not found`);
    await this.graph.deleteEntity(params.id);
    return { deleted: true };
  }

  @rpc("checklist.get", CHECKLIST_GET_SPEC)
  @tool("get", { entity: "projects.project.checklist", ...CHECKLIST_GET_SPEC })
  async checklistGet(params: ChecklistGetParams): Promise<{ items: ChecklistItem[] }> {
    if (!params.project_id) throw new Error("missing required param: project_id");
    const entity = await this.requireProject(params.project_id);
    const items = (entity.properties as { checklist?: ChecklistItem[] }).checklist;
    return { items: items ?? [] };
  }

  @rpc("checklist.update", CHECKLIST_UPDATE_SPEC)
  @writeTool("update", { entity: "projects.project.checklist", ...CHECKLIST_UPDATE_SPEC })
  async checklistUpdate(params: ChecklistUpdateParams): Promise<{ status: string; project_id: string }> {
    if (!params.project_id) throw new Error("missing required param: project_id");
    const entity = await this.requireProject(params.project_id);
    await this.graph.updateProperties({
      entityId: params.project_id,
      properties: {
        ...(entity.properties as JsonObject),
        checklist: params.items as unknown as JsonValue,
      },
    });
    return { status: "ok", project_id: params.project_id };
  }

  // ── RPC-only (not agent tools): membership + reverse lookup ──────────
  @rpc("add_member", {
    description: "Make an entity a member of a project.",
    params: MEMBER_PARAMS,
  })
  async addMember(params: MemberParams): Promise<{ status: string }> {
    await this.requireOwned(params.project_id);
    await this.requireOwned(params.entity_id);
    await this.graph.addLink({ from: params.entity_id, to: params.project_id, kind: MEMBER_LINK });
    return { status: "ok" };
  }

  @rpc("remove_member", {
    description: "Remove an entity's membership of a project.",
    params: MEMBER_PARAMS,
  })
  async removeMember(params: MemberParams): Promise<{ status: string }> {
    await this.requireOwned(params.project_id);
    await this.requireOwned(params.entity_id);
    const links = await this.graph.listLinksForEntity(params.entity_id);
    const link = links.find(
      (l) => l.from === params.entity_id && l.to === params.project_id && l.kind === MEMBER_LINK,
    );
    if (!link) throw new Error("Link not found");
    await this.graph.deleteLink(link.id);
    return { status: "ok" };
  }

  @rpc("list_for_entity", {
    description: "List the projects an entity is a member of.",
    params: {
      type: "object",
      properties: { entity_id: { type: "string", format: "uuid" } },
      required: ["entity_id"],
      additionalProperties: false,
    },
  })
  async listForEntity(params: ListForEntityParams): Promise<ProjectListItem[]> {
    await this.requireOwned(params.entity_id);
    // A parent's member projects over the belongs_to link, each row carrying
    // the projects.project render record inline — ONE statement, replacing the
    // list_links + per-link getEntity N+1. `child_schema` enforces what the old
    // loop did with a per-target schema check. (limit 1000: a member entity
    // belongs to far fewer projects; logged cap vs the old unbounded loop.)
    const linked = await this.graph.listLinked({
      extras: true,
      parentId: params.entity_id,
      linkKind: MEMBER_LINK,
      direction: "out",
      childSchema: PROJECT,
      limit: 1000,
      offset: 0,
    });
    // S1: the dictionary rides each linked entity.
    return linked.items.map((read) =>
      buildProjectListItem(read, projectCanonFromProperties(read.entity)),
    );
  }

  // ── helpers ──────────────────────────────────────────────────────
  private async requireOwned(id: string): Promise<void> {
    if (!(await this.graph.getEntity(id))) throw new Error(`entity ${id} not found`);
  }
  private async requireProject(id: string): Promise<Entity> {
    const entity = await this.graph.getEntity(id);
    if (!entity) throw new Error(`project not found: ${id}`);
    if (entity.schemaId !== PROJECT) throw new Error(`entity ${id} is not a project (schema: ${entity.schemaId})`);
    return entity;
  }
}
