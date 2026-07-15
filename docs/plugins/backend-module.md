# Writing the Backend Module

The backend half of a plugin is a TypeScript class that runs in the V8 isolate.
It declares its RPC/tool surface with decorators and talks to the host through
the injected `graph` / `rpc` / `util` APIs. SDK source: `packages/plugin-sdk/index.ts`
(imported as `@magnis/plugin-sdk`). Reference: `plugins/modules/contacts/module/`.

## Shape

```ts
// module/index.ts
import { definePlugin } from "@magnis/plugin-sdk";
import { ContactsModule } from "./service.ts";
definePlugin(ContactsModule);          // instantiates the class with deps, wires rpcHandlers
```

```ts
// module/service.ts
import { tool, writeTool, type PluginDeps, type GraphService, type RpcExecutor } from "@magnis/plugin-sdk";

export class ContactsModule {
  private readonly graph: GraphService<ContactFacets, ContactCanonical>;
  private readonly rpc: RpcExecutor;
  constructor(deps: PluginDeps<ContactFacets, ContactCanonical>) {
    this.graph = deps.graph;   // host graph API (DB via host runtime)
    this.rpc   = deps.rpc;     // cross-module RPC hub
    // deps.util  → uuid_v5 etc.;  deps.ctx → { user_id, extension_kind, extension_id }
  }

  @tool("list", { description: "...", params: { /* JSON Schema */ } })
  async list(params: ContactsListParams): Promise<PaginatedResponse<ContactListItem>> { ... }

  @writeTool("create", { description: "...", params: { ... } })
  async create(params: CreateParams): Promise<...> { ... }
}
```

`definePlugin(Class)` (SDK):
- instantiates `new Class({ graph, ctx, util, rpc })` at `init`,
- reads the `@tool`/`@writeTool` metadata off the prototype,
- registers each as `rpcHandlers["<ctx.extension_id>.<suffix>"]` (the prefix is
  glued from the plugin id — your decorator only gives the suffix),
- builds `toolDefinitions` (DEC-14) the host harvests for the agent.

`@tool` = read tool. `@writeTool` = write tool → `requires_approval: true` on the
agent tool definition. `params` is a JSON Schema object for the agent + the
frontend.

## `PluginDeps`

```ts
interface PluginDeps<Facets, Canon> {
  graph: GraphService<Facets, Canon>;  // host storage
  ctx: PluginContext;                  // { user_id, extension_kind, extension_id }
  util: PluginUtil;                    // { uuid_v5(ns, name) }
  rpc: RpcExecutor;                    // { execute(method, params) } — the hub
}
```

`ctx.user_id` is the **per-dispatch** caller (stamped before each handler). Never
accept `user_id` as a tool param — reads/writes are auto-scoped to `ctx.user_id`.

## The `graph` API (what you can do to the store)

All calls go to the host and run on the host runtime; reads are user-scoped.
`Facets`/`Canon` type params make `attach_facet`/`get_canonical` payloads typed
per schema id.

- **Entities:** `create_entity(p)`, `get_entity(id)`, `list_entities(p)` →
  `{items, total}`, `list_entities_by_context(context?)`,
  `search_entities_by_name(p)`, `update_entity_name(id, name)`,
  `update_entity_idx(id, idx)`, `delete_entity(id)`.
- **Facets:** `attach_facet({entity_id, schema_id, data})` (capability:
  `facet_write_prefixes`), `update_facet`, `list_facets_for_entity(id)`,
  `delete_facet(id)`.
- **Canonical:** `get_canonical(id, schemas?)`, `list_canonical_for_entity(id)`,
  `apply_canonical_override({entity_id, key, value})`.
- **Links:** `add_link({from_id, to_id, kind})` (capability:
  `link_kinds_writable`), `delete_link(id)`, `list_links_for_entity(id)`.
- **Merge:** `merge_preview({survivor_id, retired_id})`,
  `merge_execute({survivor_id, retired_id, overrides?, reason?})` (capability:
  `can_merge_schemas`).

To touch a schema your module does **not** own (e.g. create an `email.address`
entity), do **not** widen your `facet_write_prefixes` — call the owning module
over the [hub](cross-module-hub.md) instead.

## Capability enforcement

Capabilities come from the manifest (DEC-10) → `ModuleContext` → checked inside
each op (`backend/src/plugin_runtime/capability.rs`):
`check_facet_write`, `check_link_write`, `check_read`, `check_event_emit`,
`check_rpc_call`. A violation returns a typed error to JS (the handler sees a
thrown error) — there is **no silent skip** (NO FALLBACKS). If a write "does
nothing", you almost certainly forgot a capability entry in the manifest.

## Idempotency + provenance

- Accept a `client_id` (UUID) on create paths and return the existing entity if
  it already exists — agents retry. For batch rows derive per-row ids with
  `util.uuid_v5(batch_client_id, "<method>:<i>")` so a retried batch reuses ids.
- All writes carry provenance automatically (the op stamps `source` /
  `owner_extension_*` from `ctx`). Don't fake provenance.

## Return shapes

Match the native/legacy contract the frontend + tests expect. `contacts.create`,
for example, returns the list-item view **plus** a `fields` object carrying
`email_address_entity_id` (consumed by trigger tests + the agent card). When in
doubt, diff against the module you're mirroring — return-shape drift breaks the
UI silently.
