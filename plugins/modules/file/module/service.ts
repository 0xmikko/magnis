// File plugin — backend module (V8). Decorated class owning the read/manage
// surface (formerly the native files-module controller): `file.list`,
// `file.get`, `file.attach`. Bytes/storage/upload stay in core `FileService`;
// this module only touches graph metadata + links.
//
// Ownership: `get`/`attach` precheck via the user-scoped `get_entity_full`
// (raw `add_link` is NOT user-scoped — DEC-7). `list` relies on the host's
// already user-scoped `list_entities_window` / `list_entities_by_facet_field`.

import { tool, writeTool, type GraphService, type PluginDeps } from "@magnis/plugin-sdk";
import type { EntityDetail, FacetRecord, LinkSummary, WindowPage } from "@magnis/plugin-sdk";
import type {
  FileAttachParams,
  FileAttachResult,
  FileCanonical,
  FileDetails,
  FileFacets,
  FileGetParams,
  FileItem,
  FileListParams,
  FileListResponse,
} from "../types/index.ts";
import { hasContent, itemFromDetails } from "./helpers.ts";

const ENTITY = "file.object";
const DETAILS = "file.details";

function facetData(detail: EntityDetail, schemaId: string): Record<string, unknown> | undefined {
  const f = detail.facets.find((x) => x.schema_id === schemaId);
  return f?.data as Record<string, unknown> | undefined;
}

export class FileModule {
  private readonly graph: GraphService<FileFacets, FileCanonical>;
  constructor(deps: PluginDeps<FileFacets, FileCanonical>) {
    this.graph = deps.graph;
  }

  @tool("list", {
    description:
      "List files with optional filters by source_module, mime_prefix, or parent_id.",
    params: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1 },
        offset: { type: "integer", minimum: 0 },
        source_module: {
          type: "string",
          description: "Filter by source module (e.g. 'email', 'telegram', 'uploads').",
        },
        mime_prefix: {
          type: "string",
          description: "Filter by MIME type prefix (e.g. 'image/', 'application/pdf').",
        },
        parent_id: { type: "string", description: "Filter to files linked to this entity." },
      },
      additionalProperties: false,
    },
  })
  async list(params: FileListParams): Promise<FileListResponse> {
    const limit = params.limit ?? 50;
    const offset = params.offset ?? 0;

    // Candidate page (host-side user-scoped) + the exact total.
    let entityIds: string[];
    let total: number;
    if (params.source_module) {
      const page = await this.graph.list_entities_by_facet_field({
        entity_schema: ENTITY,
        facet_schema: DETAILS,
        field_path: "$.source_module",
        field_value: params.source_module,
        limit,
        offset,
      });
      entityIds = page.items.map((e) => e.id);
      total = page.total;
    } else {
      const win: WindowPage = await this.graph.list_entities_window({
        schema: ENTITY,
        order: [{ field: { entity_field: "date" }, desc: true }],
        limit,
        offset,
      });
      entityIds = win.items.map((r) => r.entity.id);
      total = win.total;
    }

    if (entityIds.length === 0) return { items: [], total, limit, offset };

    const facets = await this.graph.list_facets_for_entities(entityIds);
    const detailsById = new Map<string, FileDetails>();
    for (const f of facets) {
      // list_facets_for_entities (batch) always stamps entity_id.
      if (f.schema_id === DETAILS && f.entity_id !== undefined) {
        detailsById.set(f.entity_id, f.data as FileDetails);
      }
    }

    const items: FileItem[] = [];
    for (const id of entityIds) {
      const details = detailsById.get(id);
      if (!details) continue;

      // parent_id: keep only files linked from the given parent (DEC-8 — a links
      // query, not a facet filter).
      if (params.parent_id) {
        const links = await this.graph.list_links_for_entity(id);
        if (!(links).some((l) => l.from_id === params.parent_id)) continue;
      }
      // mime_prefix: prefix match, refined in-TS (window filter is exact — DEC-8).
      if (params.mime_prefix && !(details.mime_type ?? "").startsWith(params.mime_prefix)) {
        continue;
      }
      // skip rows with no retrievable content (DEC-8; graph-visible part).
      if (!hasContent(details)) continue;

      items.push(itemFromDetails(id, details));
    }
    return { items, total, limit, offset };
  }

  @tool("get", {
    description: "Get a file by entity id, with its details + a serving URL.",
    params: {
      type: "object",
      properties: { id: { type: "string", format: "uuid" } },
      required: ["id"],
      additionalProperties: false,
    },
  })
  async get(params: FileGetParams): Promise<Record<string, unknown>> {
    // user-scoped → null for a non-owned id; a wrong-schema id must never resolve.
    const detail = await this.graph.get_entity_full(params.id, { links: false });
    if (!detail || detail.entity.schema_id !== ENTITY) {
      throw new Error(`file not found: ${params.id}`);
    }
    const details = facetData(detail, DETAILS) as FileDetails | undefined;
    if (!details) throw new Error(`file not found: ${params.id}`);

    const base = itemFromDetails(params.id, details) as unknown as Record<string, unknown>;
    const image = facetData(detail, "file.image");
    const audio = facetData(detail, "file.audio");
    const video = facetData(detail, "file.video");
    if (image) base.image = image;
    if (audio) base.audio = audio;
    if (video) base.video = video;
    return base;
  }

  @writeTool("attach", {
    description: "Attach a file entity to a target entity via an 'attachment' link.",
    params: {
      type: "object",
      properties: {
        file_id: { type: "string", format: "uuid" },
        target_id: { type: "string", format: "uuid" },
        kind: { type: "string", enum: ["attachment"] },
      },
      required: ["file_id", "target_id"],
      additionalProperties: false,
    },
  })
  async attach(params: FileAttachParams): Promise<FileAttachResult> {
    const kind = params.kind ?? "attachment";
    // DEC-11: only the "attachment" kind is supported (the sole kind any caller uses).
    if (kind !== "attachment") throw new Error(`unsupported attach kind: ${kind}`);

    // DEC-7: own-check both (raw add_link is not user-scoped) and file_id must be
    // a file.object — cross-user/invalid ids surface as not-found, no link.
    const file = await this.graph.get_entity_full(params.file_id, { links: false });
    if (!file || file.entity.schema_id !== ENTITY) {
      throw new Error(`file not found: ${params.file_id}`);
    }
    const target = await this.graph.get_entity_full(params.target_id, { links: false });
    if (!target) {
      throw new Error(`target not found: ${params.target_id}`);
    }

    await this.graph.add_link({ from_id: params.target_id, to_id: params.file_id, kind });
    return { status: "ok", file_id: params.file_id, target_id: params.target_id, kind };
  }
}
