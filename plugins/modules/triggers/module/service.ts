// Triggers plugin — backend module (V8). Owns the trigger DEFINITION CRUD
// (create/get/list/update/delete/link/unlink/list_for_entity/fire_history).
//
// HYBRID split: the trigger PROCESSING ENGINE (evaluator / executor / cache /
// fire_trigger / gate) stays native in `backend/src/modules/triggers`. The graph
// is the contract — this plugin writes the `triggers.trigger` entity +
// `triggers.trigger.config` facet + `watches`/`belongs_to` links that the native
// engine reads and runs.
//
// Two native dependencies are consulted over the host RPC bridge (manifest
// `[permissions] call`):
//   - `triggers.validate_watch` / `triggers.resolve_watchable` — schema
//     `triggerable` reads (plugins cannot read schema metadata).
//   - `triggers.invalidate_cache` — drop the engine's in-memory reverse index
//     after every definition mutation (plugins cannot emit on the event bus).
//
// Ownership: every single-entity read + mutation goes through the user-scoped
// `get_entity_full` precheck (raw `get_entity`/`attach_facet` are NOT user-scoped),
// matching the native guards.

import { tool, writeTool, type GraphService, type PluginDeps, type RpcExecutor } from "@magnis/plugin-sdk";
import type { EntityDetail, LinkSummary } from "@magnis/plugin-sdk";
import type {
  ClarificationResult,
  CreateTriggerParams,
  DeleteTriggerParams,
  FireHistoryParams,
  GetTriggerParams,
  LinkTriggerParams,
  ListForEntityParams,
  ListTriggersParams,
  ResolveWatchableResult,
  TriggerConfigData,
  TriggerCreated,
  TriggerDetailView,
  TriggerExecutionData,
  TriggerFacets,
  TriggerListItem,
  UpdateTriggerParams,
  WatchedEntity,
} from "../types.ts";
import { BELONGS_TO, TRIGGER, TRIGGER_CONFIG, TRIGGER_EXECUTION, WATCHES } from "../schema.ts";

export class TriggersModule {
  private readonly graph: GraphService<TriggerFacets>;
  private readonly rpc: RpcExecutor;

  constructor(deps: PluginDeps<TriggerFacets>) {
    this.graph = deps.graph;
    this.rpc = deps.rpc;
  }

  @writeTool("create", {
    description:
      "Create a new trigger with gate and action prompts. Optionally link to watched entities.",
    params: {
      type: "object",
      properties: {
        name: { type: "string", description: "Trigger name" },
        gate_prompt: {
          type: "string",
          description: "Prompt for gate evaluation (is this event relevant?)",
        },
        action_prompt: {
          type: "string",
          description: "Prompt for action execution (what to do if relevant)",
        },
        event_kinds: {
          type: "array",
          items: { type: "string" },
          description: "Event kinds to listen for",
        },
        watch_entity_ids: {
          type: "array",
          items: { type: "string", format: "uuid" },
          description: "Entity IDs to watch",
        },
        episode_id: {
          type: "string",
          format: "uuid",
          description: "Parent episode ID — creates belongs_to link",
        },
        schema_filter: { type: "string", description: "Only trigger for events with this schema" },
        expires_at: { type: "string", format: "date-time" },
        debounce_seconds: {
          type: "integer",
          description: "0=immediate fire (default), >0=minimum seconds between firings",
        },
        max_firings: { type: "integer", description: "Maximum total firings before auto-expire" },
      },
      required: ["name", "action_prompt"],
      additionalProperties: false,
    },
  })
  async create(params: CreateTriggerParams): Promise<TriggerCreated | Record<string, unknown>> {
    const name = params.name.trim();
    if (!name) throw new Error("missing or empty required param: name");
    const action_prompt = params.action_prompt.trim();
    if (!action_prompt) throw new Error("missing or empty required param: action_prompt");

    const gate_prompt = params.gate_prompt ?? "";
    const event_kinds =
      params.event_kinds && params.event_kinds.length > 0 ? params.event_kinds : ["sync_ingested"];
    const watch_entity_ids = params.watch_entity_ids ?? [];
    const debounce_seconds = params.debounce_seconds ?? 0;

    // Validate watch targets are triggerable. The schema `triggerable` flag is
    // backend-only — delegate to the native resolver, which returns either a
    // `clarification_needed` payload (a watch target is not watchable, here are
    // its linked watchables) or null. Surfaced verbatim to the agent — NEVER a
    // thrown error (native parity: controller.rs validate_watch_entities).
    if (watch_entity_ids.length > 0) {
      const clarification = await this.rpc.execute<ClarificationResult>("triggers.validate_watch", {
        watch_entity_ids,
      });
      if (clarification && typeof clarification === "object") {
        return clarification;
      }
    }

    // Ownership: a foreign / unknown parent episode is rejected BEFORE any row is
    // written (native parity: the pre-split create validated episode_id ownership
    // first). `get_entity_full` is user-scoped → null for a non-owned id. Without
    // this a caller could `belongs_to`-link a foreign episode, leaking its name
    // via `get` and child-linking it in the native `fire_trigger`.
    if (params.episode_id) {
      const episode = await this.graph.get_entity_full(params.episode_id, { links: false });
      if (!episode) throw new Error(`episode not found: ${params.episode_id}`);
    }

    const entity = await this.graph.create_entity({ schema_id: TRIGGER, name });

    const config: TriggerConfigData = {
      name,
      gate_prompt,
      action_prompt,
      status: "active",
      event_kinds,
      debounce_seconds,
      firing_count: 0,
    };
    if (params.schema_filter !== undefined) config.schema_filter = params.schema_filter;
    if (params.expires_at !== undefined) config.expires_at = params.expires_at;
    if (params.max_wait_seconds !== undefined) config.max_wait_seconds = params.max_wait_seconds;
    if (params.max_firings !== undefined) config.max_firings = params.max_firings;
    await this.graph.attach_facet({ entity_id: entity.id, schema_id: TRIGGER_CONFIG, data: config });

    for (const target of watch_entity_ids) {
      await this.graph.add_link({ from_id: entity.id, to_id: target, kind: WATCHES });
    }
    if (params.episode_id) {
      await this.graph.add_link({ from_id: entity.id, to_id: params.episode_id, kind: BELONGS_TO });
    }

    await this.invalidateCache();

    return {
      id: entity.id,
      name,
      status: "active",
      gate_prompt,
      action_prompt,
      firing_count: 0,
      last_fired_at: null,
      schema_id: TRIGGER,
      created_at: entity.created_at ?? new Date().toISOString(),
      episode_id: params.episode_id ?? null,
    };
  }

  @tool("get", {
    description: "Get a trigger detail view by ID.",
    params: {
      type: "object",
      properties: { id: { type: "string", format: "uuid" } },
      required: ["id"],
      additionalProperties: false,
    },
  })
  async get(params: GetTriggerParams): Promise<TriggerDetailView> {
    const detail = await this.requireTrigger(params.id);
    return this.detailView(detail);
  }

  @tool("list", {
    description: "List triggers with optional status filter.",
    params: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description: "Filter by status: active, paused, disabled, expired",
        },
      },
      additionalProperties: false,
    },
  })
  async list(params: ListTriggersParams): Promise<TriggerListItem[]> {
    const page = await this.graph.list_entities({ schema_id: TRIGGER, order: "date", limit: 1000 });
    const items: TriggerListItem[] = [];
    for (const entity of page.items) {
      const detail = await this.graph.get_entity_full(entity.id, { links: true });
      if (detail?.entity.schema_id !== TRIGGER) continue;
      const config = this.configOf(detail);
      if (!config) continue;
      if (params.status && config.status !== params.status) continue;
      items.push(await this.listItem(detail, config));
    }
    return items;
  }

  @writeTool("update", {
    description: "Update trigger fields (partial update).",
    params: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        name: { type: "string" },
        gate_prompt: { type: "string" },
        action_prompt: { type: "string" },
        status: { type: "string" },
        event_kinds: { type: "array", items: { type: "string" } },
        schema_filter: { type: "string" },
        expires_at: { type: "string", format: "date-time" },
        debounce_seconds: { type: "integer" },
        max_firings: { type: "integer" },
      },
      required: ["id"],
      additionalProperties: false,
    },
  })
  async update(params: UpdateTriggerParams): Promise<TriggerDetailView> {
    const detail = await this.requireTrigger(params.id);
    const config = this.configOf(detail);
    if (!config) throw new Error(`trigger config not found: ${params.id}`);

    if (params.name !== undefined) {
      config.name = params.name;
      await this.graph.update_entity_name(params.id, params.name);
    }
    if (params.gate_prompt !== undefined) config.gate_prompt = params.gate_prompt;
    if (params.action_prompt !== undefined) config.action_prompt = params.action_prompt;
    if (params.status !== undefined) config.status = params.status;
    if (params.event_kinds !== undefined) config.event_kinds = params.event_kinds;
    if (params.schema_filter !== undefined) config.schema_filter = params.schema_filter;
    if (params.expires_at !== undefined) config.expires_at = params.expires_at;
    if (params.debounce_seconds !== undefined) config.debounce_seconds = params.debounce_seconds;
    if (params.max_wait_seconds !== undefined) config.max_wait_seconds = params.max_wait_seconds;
    if (params.max_firings !== undefined) config.max_firings = params.max_firings;

    await this.graph.attach_facet({ entity_id: params.id, schema_id: TRIGGER_CONFIG, data: config });
    await this.invalidateCache();

    const fresh = await this.requireTrigger(params.id);
    return this.detailView(fresh);
  }

  @writeTool("delete", {
    description: "Delete a trigger by ID.",
    params: {
      type: "object",
      properties: { id: { type: "string", format: "uuid" } },
      required: ["id"],
      additionalProperties: false,
    },
  })
  async delete(params: DeleteTriggerParams): Promise<{ deleted: boolean }> {
    await this.requireTrigger(params.id);
    await this.graph.delete_entity(params.id);
    await this.invalidateCache();
    return { deleted: true };
  }

  @writeTool("link", {
    description: "Link a trigger to watch an entity.",
    params: {
      type: "object",
      properties: {
        trigger_id: { type: "string", format: "uuid" },
        entity_id: { type: "string", format: "uuid" },
      },
      required: ["trigger_id", "entity_id"],
      additionalProperties: false,
    },
  })
  async link(params: LinkTriggerParams): Promise<{ linked: boolean }> {
    await this.requireTrigger(params.trigger_id);
    const target = await this.graph.get_entity_full(params.entity_id, { links: false });
    if (!target) throw new Error(`entity not found: ${params.entity_id}`);
    await this.graph.add_link({ from_id: params.trigger_id, to_id: params.entity_id, kind: WATCHES });
    await this.invalidateCache();
    return { linked: true };
  }

  @writeTool("unlink", {
    description: "Unlink a trigger from a watched entity.",
    params: {
      type: "object",
      properties: {
        trigger_id: { type: "string", format: "uuid" },
        entity_id: { type: "string", format: "uuid" },
      },
      required: ["trigger_id", "entity_id"],
      additionalProperties: false,
    },
  })
  async unlink(params: LinkTriggerParams): Promise<{ unlinked: boolean }> {
    await this.requireTrigger(params.trigger_id);
    const links = await this.graph.list_links_for_entity(params.trigger_id);
    for (const link of links) {
      if (link.kind === WATCHES && link.from_id === params.trigger_id && link.to_id === params.entity_id) {
        await this.graph.delete_link(link.id);
      }
    }
    await this.invalidateCache();
    return { unlinked: true };
  }

  @tool("list_for_entity", {
    description: "List triggers that watch a given entity.",
    params: {
      type: "object",
      properties: { entity_id: { type: "string", format: "uuid" } },
      required: ["entity_id"],
      additionalProperties: false,
    },
  })
  async list_for_entity(params: ListForEntityParams): Promise<TriggerListItem[]> {
    // Ownership: unknown / non-owned anchor → empty (no link-metadata leak).
    const anchorOwned = await this.graph.get_entity_full(params.entity_id, { links: false });
    if (!anchorOwned) return [];

    // Anchor set: the entity itself + its 1-hop watchable neighbours. Email
    // triggers anchor on `email.address`, not the contact, so a trigger on a
    // contact's address must surface on the contact page. The `triggerable`
    // expansion is a backend/schema read → delegate to the native resolver.
    const anchors: string[] = [params.entity_id];
    const watchable = await this.rpc.execute<ResolveWatchableResult>("triggers.resolve_watchable", {
      entity_id: params.entity_id,
    });
    for (const w of watchable.watchable) {
      if (!anchors.includes(w.id)) anchors.push(w.id);
    }

    const seen = new Set<string>();
    const items: TriggerListItem[] = [];
    for (const anchor of anchors) {
      const links = await this.graph.list_links_for_entity(anchor);
      for (const link of links) {
        if (link.to_id !== anchor) continue;
        if (link.kind !== WATCHES && link.kind !== BELONGS_TO) continue;
        const triggerId = link.from_id;
        if (seen.has(triggerId)) continue;
        seen.add(triggerId);
        const detail = await this.graph.get_entity_full(triggerId, { links: true });
        if (detail?.entity.schema_id !== TRIGGER) continue;
        const config = this.configOf(detail);
        if (!config) continue;
        items.push(await this.listItem(detail, config));
      }
    }
    return items;
  }

  @tool("fire_history", {
    description: "List trigger execution history sorted by fired_at desc.",
    params: {
      type: "object",
      properties: {
        trigger_id: { type: "string", format: "uuid" },
        limit: { type: "integer", minimum: 1 },
      },
      required: ["trigger_id"],
      additionalProperties: false,
    },
  })
  async fire_history(params: FireHistoryParams): Promise<TriggerExecutionData[]> {
    await this.requireTrigger(params.trigger_id);
    const limit = params.limit ?? 50;
    const facets = await this.graph.list_facets_for_entity(params.trigger_id);
    const executions = facets
      .filter((f) => f.schema_id === TRIGGER_EXECUTION)
      .map((f) => f.data as TriggerExecutionData)
      .sort((a, b) => (a.fired_at < b.fired_at ? 1 : a.fired_at > b.fired_at ? -1 : 0));
    return executions.slice(0, limit);
  }

  // ── private helpers ──────────────────────────────────────────────

  private async invalidateCache(): Promise<void> {
    // Drop the native engine's in-memory reverse index so the next
    // `trigger.check` evaluates this definition change. Plugins cannot emit on
    // the broadcast event bus, so this is an explicit native rpc.
    await this.rpc.execute("triggers.invalidate_cache", {});
  }

  /// User-scoped fetch that also rejects an id of a different schema — a
  /// triggers tool must never touch a foreign entity (NotFound parity).
  private async requireTrigger(id: string): Promise<EntityDetail> {
    const detail = await this.graph.get_entity_full(id, { links: true });
    if (detail?.entity.schema_id !== TRIGGER) {
      throw new Error(`trigger not found: ${id}`);
    }
    return detail;
  }

  private configOf(detail: EntityDetail): TriggerConfigData | null {
    const facet = detail.facets.find((f) => f.schema_id === TRIGGER_CONFIG);
    return facet ? (facet.data as TriggerConfigData) : null;
  }

  private watchesLinks(detail: EntityDetail): LinkSummary[] {
    return detail.links.filter((l) => l.kind === WATCHES && l.from_id === detail.entity.id);
  }

  private async listItem(detail: EntityDetail, config: TriggerConfigData): Promise<TriggerListItem> {
    const names: string[] = [];
    for (const link of this.watchesLinks(detail)) {
      // User-scoped resolution (native guard): a poisoned `watches` link to a
      // foreign entity must NOT leak its name. `get_entity_full` returns null for
      // a non-owned target, so foreign names are dropped.
      const target = await this.graph.get_entity_full(link.to_id, { links: false });
      if (target) {
        const e = target.entity;
        names.push(e.name && e.name.length > 0 ? e.name : e.schema_id);
      }
    }
    return {
      schema_id: TRIGGER,
      id: detail.entity.id,
      name: config.name,
      status: config.status,
      gate_prompt: config.gate_prompt,
      action_prompt: config.action_prompt,
      firing_count: config.firing_count,
      last_fired_at: config.last_fired_at ?? null,
      watched_entity_names: names,
    };
  }

  private async detailView(detail: EntityDetail): Promise<TriggerDetailView> {
    const config = this.configOf(detail);
    if (!config) throw new Error(`trigger config not found: ${detail.entity.id}`);

    const watched: WatchedEntity[] = [];
    for (const link of this.watchesLinks(detail)) {
      // User-scoped (native guard): foreign watched-entity names resolve to null.
      const target = await this.graph.get_entity_full(link.to_id, { links: false });
      watched.push({ id: link.to_id, name: target?.entity.name ?? null });
    }

    const belongs = detail.links.find(
      (l) => l.kind === BELONGS_TO && l.from_id === detail.entity.id,
    );
    let parentEpisodeId: string | null = null;
    let parentEpisodeName: string | null = null;
    if (belongs) {
      parentEpisodeId = belongs.to_id;
      // User-scoped (native guard): a foreign parent-episode name resolves to null.
      const parent = await this.graph.get_entity_full(belongs.to_id, { links: false });
      parentEpisodeName = parent?.entity.name ?? null;
    }

    return {
      id: detail.entity.id,
      name: config.name,
      gate_prompt: config.gate_prompt,
      action_prompt: config.action_prompt,
      status: config.status,
      event_kinds: config.event_kinds,
      schema_filter: config.schema_filter ?? null,
      expires_at: config.expires_at ?? null,
      debounce_seconds: config.debounce_seconds,
      max_wait_seconds: config.max_wait_seconds ?? null,
      max_firings: config.max_firings ?? null,
      firing_count: config.firing_count,
      last_fired_at: config.last_fired_at ?? null,
      watched_entities: watched,
      parent_episode_id: parentEpisodeId,
      parent_episode_name: parentEpisodeName,
    };
  }
}
