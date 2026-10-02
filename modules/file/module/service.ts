import { rpc } from "@magnis/plugin-sdk";
// File plugin — backend module (V8). Decorated class owning the read/manage
// surface (formerly the native files-module controller): `file.list`,
// `file.get`, `file.attach`. Bytes/storage/upload stay in core `FileService`;
// this module only touches graph metadata + links.
//
// Ownership: `get`/`attach` precheck via the user-scoped `get_entity_full`
// (raw `add_link` is NOT user-scoped). `list` relies on the host's
// already user-scoped `list_entities_window` / `list_entities_by_facet_field`.

import {
  tool,
  writeTool,
  type GraphService,
  type PluginDeps,
} from "@magnis/plugin-sdk";
import type { Entity, PaginatedResponse } from "@magnis/sdk";
import type {
  FileAttachParams,
  FileAttachResult,
  FileDetails,
  FileGetParams,
  FileItem,
  FileListParams,
  FileListResponse,
} from "../types.ts";
import { hasContent, itemFromDetails } from "./helpers.ts";
import {
  FILE_OBJECT,
} from "../schema.ts";

/** `file.get`'s input, shared by the RPC method and the agent tool. */
const GET_SPEC = {
  description: "Get a file by entity id, with its details + a serving URL.",
  params: {
    type: "object",
    properties: { id: { type: "string", format: "uuid" } },
    required: ["id"],
    additionalProperties: false,
  },
};

/** `file.attach`'s input, shared by the RPC method and the agent tool. */
const ATTACH_SPEC = {
  description: "Attach a file entity to a target entity via a 'file.attachment' link.",
  params: {
    type: "object",
    properties: {
      file_id: { type: "string", format: "uuid" },
      target_id: { type: "string", format: "uuid" },
      kind: { type: "string", enum: ["file.attachment"] },
    },
    required: ["file_id", "target_id"],
    additionalProperties: false,
  },
};

export class FileModule {
  private readonly graph: GraphService;
  constructor(deps: PluginDeps) {
    this.graph = deps.graph;
  }

  @rpc("list", {
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
    const found: PaginatedResponse<Entity> = params.source_module
      // S1: the dictionary is the state — filter by the properties key.
      ? await this.graph.list_entities_by_property_field({
        entitySchema: FILE_OBJECT,
        key: "source_module",
        value: params.source_module,
        limit,
        offset,
      })
      : await this.graph.list_entities_window({
        schema: FILE_OBJECT,
        order: [{ field: { entityField: "date" }, desc: true }],
        limit,
        offset,
      });
    const total = found.total;

    if (found.items.length === 0) return { items: [], total, limit, offset };

    const items: FileItem[] = [];
    for (const e of found.items) {
      // S1: the dictionary rides the entity — the page-wide record batch is gone.
      const id = e.id;
      const details = e.properties as unknown as FileDetails;

      // parent_id: keep only files linked from the given parent (a links
      // query, not a record filter).
      if (params.parent_id) {
        const links = await this.graph.list_links_for_entity(id);
        if (!links.some((l) => l.from === params.parent_id)) continue;
      }
      // mime_prefix: prefix match, refined in-TS (window filter is exact).
      if (params.mime_prefix && !details.mime_type.startsWith(params.mime_prefix)) {
        continue;
      }
      // skip rows with no retrievable content (graph-visible part).
      if (!hasContent(details)) continue;

      items.push(itemFromDetails(id, details));
    }
    return { items, total, limit, offset };
  }

  @rpc("get", GET_SPEC)
  @tool("get", { entity: "file.object", ...GET_SPEC })
  async get(params: FileGetParams): Promise<Record<string, unknown>> {
    // user-scoped → null for a non-owned id; a wrong-schema id must never resolve.
    const detail = await this.graph.get_entity_full(params.id, { links: false });
    if (detail?.entity.schemaId !== FILE_OBJECT) {
      throw new Error(`file not found: ${params.id}`);
    }
    // S1: the dictionary is the state; its typed extras (image, audio, video)
    // are dictionary keys and ride along.
    return itemFromDetails(params.id, detail.entity.properties as unknown as FileDetails) as unknown as Record<string, unknown>;
  }

  @rpc("attach", ATTACH_SPEC)
  @writeTool("create", { entity: "file.object", ...ATTACH_SPEC })
  async attach(params: FileAttachParams): Promise<FileAttachResult> {
    const kind = params.kind ?? "file.attachment";
    // Only the "file.attachment" kind is supported (the sole kind any caller uses).
    if (kind !== "file.attachment") throw new Error(`unsupported attach kind: ${kind}`);

    // Own-check both (raw add_link is not user-scoped) and file_id must be
    // a file.object — cross-user/invalid ids surface as not-found, no link.
    const file = await this.graph.get_entity_full(params.file_id, { links: false });
    if (file?.entity.schemaId !== FILE_OBJECT) {
      throw new Error(`file not found: ${params.file_id}`);
    }
    const target = await this.graph.get_entity_full(params.target_id, { links: false });
    if (!target) {
      throw new Error(`target not found: ${params.target_id}`);
    }

    await this.graph.add_link({ from: params.target_id, to: params.file_id, kind });
    return { status: "ok", file_id: params.file_id, target_id: params.target_id, kind };
  }
}
