# Building a module, end to end

A **module** owns a slice of the graph — it registers schemas, reads and writes
entities/facets, exposes tools to the agent, and draws UI. Companies, contacts,
email, meetings are modules. This guide takes you from an empty folder to a
conforming, tested module: what a module is, how it is laid out, how it runs,
what it can call, how schemas register, and the one read-path gotcha that bites
everyone.

If you are building a **source** (an external connector that streams data in),
read [source.md](./source.md) instead. For the big-picture model start at
[architecture.md](./architecture.md); the full `manifest.toml` fields are in
[manifest.md](./manifest.md), the file-structure standard and code rules in
[structure.md](./structure.md), and the cross-cutting commands in
[README.md](./README.md).

---

## 1. What a module is

A module runs as a **restricted V8 isolate inside the backend**. The host loads
its bundled code into the isolate and calls into it. The isolate has **no
ambient I/O** — no sockets, no filesystem, no stdio. Every graph operation goes
through the host by RPC. That restriction is the point: a module cannot touch
the outside world, so it cannot leak or misbehave against it. (Reaching an
external service is a *source*'s job, across the process boundary — see
[source.md](./source.md).)

A module is, concretely, a **decorated class handed to `definePlugin`**. You
write a class, decorate its methods to declare what they are (an agent tool, a
write tool, an internal RPC, the sync ingest), and export
`definePlugin(TheClass)`. The host instantiates it, harvests the decorated
methods into a handler table, and routes calls to them.

---

## 2. Layout

```
<module>/
  manifest.toml          # the package card: identity + [surfaces] + [permissions]
  README.md              # catalog description (markdown detail page)
  icon.svg               # catalog icon at the package ROOT (svg or png)
  schemas/               # graph model, one JSON file per entity/facet (see §7)
  types.ts               # wire DTOs + the two schema-map interfaces (Facets, Canonical)
  schema.ts              # schema-id string constants for read/write call sites
  module/                # the backend part (V8 isolate)
    index.ts             # definePlugin(TheClass) — nothing else (the entry, by convention)
    service.ts           # the class ONLY — no constants, no free functions
    helpers.ts           # free functions the service uses
    __tests__/           # whole-module tests on @magnis/testkit/module
  ui/                    # the frontend part (React) — optional; ui/index.tsx = the entry
  migrations/            # ONLY if the module ships a real data migration (see §7)
  package.json
  tsconfig.json          # MUST set experimentalDecorators: true
```

`service.ts` is **the class and nothing else** — constants live in `schema.ts`,
free functions in `helpers.ts`. `types.ts` and `schema.ts` are loose root files
(one shared shape-vocabulary, one shared id-vocabulary). No single-file folders
(`types/index.ts` is wrong; `types.ts` is right). The folder name MUST equal the
manifest `id`.

> **tsconfig gotcha:** `experimentalDecorators: true` is mandatory. The module
> registry is keyed by the class prototype, which only works with legacy
> (TypeScript) decorators; without the flag the build lowers to TC39 decorators
> and the module silently registers nothing.

---

## 3. How it runs — definePlugin and the decorated class

The class takes one constructor arg, `PluginDeps`, and stores what it needs:

```ts
export class CompaniesModule {
  private readonly graph: GraphService<CompanyFacets, CompanyCanonical>;
  constructor(deps: PluginDeps<CompanyFacets, CompanyCanonical>) {
    this.graph = deps.graph;
  }

  @tool("list", { description: "List companies", params: { type: "object", /* … */ } })
  async list(params: ListParams): Promise<PaginatedResponse<CompanyListItem>> { /* … */ }
}
```

`module/index.ts` is one line:

```ts
definePlugin(CompaniesModule);
```

`definePlugin` takes the **class constructor**, not an instance. At load it
instantiates the class, reads the decorated methods back off the prototype, and
publishes a handler table keyed by `<plugin_id>.<method-suffix>` plus the
agent-facing tool definitions. The generics `<Facets, Canonical>` are inferred
from the constructor, so facet/canonical payload types are derived from the
schema-id literal at every call site.

---

## 4. What a module can call — the deps

The constructor receives `PluginDeps<Facets, Canonical> = { graph, ctx, util,
rpc }`:

- **`ctx: PluginContext`** — `{ user_id, extension_kind, extension_id }`.
  `extension_id` is the RPC-name prefix; `user_id` is stamped host-side for
  scoping, never supplied by JS.
- **`util`** — `uuid_v5(namespace, name)`, a deterministic UUIDv5 byte-equal to
  the Rust side, for deriving ids that match native handlers.
- **`rpc`** — `execute<T>(method, params?)`, cross-module RPC over the host
  router. Allowed targets are declared in the manifest `[permissions]` `call`
  list. (LinkedIn uses it to call `contacts.get_social_tracking_by_handle`,
  etc.)
- **`graph: GraphService<Facets, Canonical>`** — the graph API, below.

**The graph API** (payload types derived from the schema-id you pass):

- **Entities** — `create_entity`, `get_entity`/`get_entities` (batch),
  `list_entities`, `list_entities_window` (page + latest render facet + exact
  total in one statement), `list_entities_by_facet_field`,
  `search_entities_by_name`, `get_entity_full(id, { facets?, links? })`,
  `update_entity_name`, `delete_entity`, `find_by_external_id`, …
- **Facets** — `attach_facet({ entity_id, schema_id, data, external_id?,
  confidence? })` (idempotent by entity + external_id), `update_facet`,
  `list_facets_for_entity`, `list_facets_for_entities` (batch), `delete_facet`.
- **Canonical** — `get_canonical`, `list_canonical_for_entities` (batch),
  `resolve_canonical(id)` (recompute after attaching facets),
  `apply_canonical_override`.
- **Links** — `add_link`, `delete_link`, `list_links_for_entity`.
- **Batch/merge** — `apply_batch(GraphBatchInput)` (atomic
  entities+facets+links fragment — the bulk-ingest primitive), `merge_preview`,
  `merge_execute`.

**Prefer the batch reads** (`get_entities`, `list_facets_for_entities`,
`list_canonical_for_entities`) over per-row calls — an N+1 in a list handler is
a defect the tests forbid (§11).

---

## 5. Tools and RPC — declaring what a method is

Four decorators declare a method's role; the callable name is always
`<plugin_id>.<suffix>`:

| Decorator | Role | Agent-visible? | Approval |
|---|---|---|---|
| `@tool(suffix, spec)` | read tool | yes | no |
| `@writeTool(suffix, spec)` | write tool | yes | `requires_approval: true` |
| `@rpc(suffix, spec?)` | internal RPC (for other modules / UI) | no | — |
| `@syncHandler(surface?)` | the reserved `__sync__` ingest hook | no | — |

`spec.params` is a JSON schema the agent sees. The suffix is the method's public
name — `@tool("list")` → `companies.list`. Dotted suffixes make sub-namespaces:
`@tool("posts.list")` → `linkedin.posts.list`. The decorators are the ONLY
declaration: the host routes any `<id>.…` method to the module by prefix and
harvests tool definitions from the running code — nothing is listed in the
manifest. Only `@tool`/`@writeTool` methods become agent tools; `@rpc` and
`@syncHandler` register handlers but stay off the agent surface.

**Write tools are idempotent, and provenance is automatic.** Agents retry, so a
create path should accept a `client_id` (UUID) and return the existing entity if
it already exists; for batch rows derive per-row ids with
`util.uuid_v5(batch_client_id, "<method>:<i>")` so a retried batch reuses ids.
Every write is stamped with provenance (the owning module + source) for you —
never fake it. And because every write is permission-checked with **no silent
skip**, a write that "does nothing" almost always means a missing grant in
`[permissions]`, surfaced as a thrown error.

---

## 6. Cross-module calls — using another module's tools

A module often needs an effect that belongs to **another** module.
`contacts.create` needs an `email.address` entity, but contacts must not write
the `email.*` schema — that is the email module's. Instead it **calls the email
module's method** over RPC and links the result into its own slice of the graph.

That is what `deps.rpc` is for. `rpc.execute<T>(method, params)` invokes another
module's method by its fully-qualified name and returns the result, so you can
use the id it hands back:

```ts
@writeTool("create", { /* … */ })
async create(params: CreateParams): Promise<ContactCreated> {
  let email_address_entity_id: string | null = null;
  if (params.email) {
    // ask the email module to find-or-create its own entity
    const addr = await this.rpc.execute<{ id: string }>(
      "email.ensure_address", { address: params.email },
    );
    email_address_entity_id = addr.id;
    // link my contact to it — the kind must be granted (see below)
    await this.graph.add_link({ from_id: contact.id, to_id: addr.id, kind: "has_email" });
  }
  // return the id your UI + tests read off the result
  return { /* …list item… */, fields: { email_address_entity_id } };
}
```

Two manifest grants make this legal, both least-privilege (own:own links and
own-namespace writes never need declaring — `[permissions]` lists only the
foreign asks):

```toml
[permissions]
call  = ["email.ensure_address"]   # EXACT methods you may call — no wildcards
links = ["has_email"]              # foreign-touching link kinds you may create
```

`call` lists **exact** fully-qualified methods: you may call
`email.ensure_address` and nothing else. A call to an undeclared method is
refused, and `add_link` with an ungranted foreign kind is refused — there is
**no silent skip**, so a missing grant surfaces as a thrown error, never a
no-op. The call runs as the same user, so the target module is user-scoped
exactly as your own reads are.

**The callee side.** To let other modules call into yours, expose a plain
`@rpc` method (§5) — off the agent surface — that is **idempotent** (callers
retry) and returns the id(s) the caller needs to link. `email.ensure_address`
is find-or-create: same address in, same entity id out.

---

## 7. Schemas — two separate concerns

Owning an entity/facet involves two things that are easy to conflate:

1. **`schema.ts` constants** are *only* the deduped spelling of each namespace
   string for read/write call sites — e.g.
   `export const COMPANY = "companies.company"`. They are **not** the
   registration source.
2. **The `schemas/` directory** is the source of truth, discovered by
   convention. `<entity>.json` is an entity descriptor (`name`,
   `description`, optional `triggerable` / `mergeable` traits);
   `<entity>.<facet>.json` is a facet contract (`version`, canonical
   `mappings` tying a `path` to a `canonical` key with a `strategy`, and the
   JSON Schema shape flattened at top level). A facet file always has
   `"version"`; an entity file never does. The schema id is derived from the
   filename inside the module's namespace `<id>.…`; legacy ids override with
   `"id"`, foreign-entity facets with `"entity"` (full rules in
   [manifest.md](./manifest.md)).

Installing the module registers the `schemas/` files **natively** — there is
no install hook to write. A `migrations/` folder (plus `[[migrations]]` in the
manifest) appears **only** when the module needs a real **data migration**
(`defineMigration` — transform rows already in the graph on a version bump).
That is rare; most modules have no migrations folder.

To own a facet you simply add its `schemas/` file — writes to your own
namespace are implicitly granted; only foreign asks go in `[permissions]`.

---

## 8. The canonical-vs-facet gotcha

The single mistake to avoid. There are two ways to read a field, and they
resolve different values:

- **Latest facet** (`list_entities_window` *with* a `facet_schema`) returns each
  row's most recent render facet, ordered by `observed_at`.
- **Canonical** (`get_canonical` / `list_canonical_for_entities`) returns the
  *merged* value resolved by strategy — `single_aligned` = confidence → recency
  — which is **not** the same as the latest facet.

If your module's truth is the merged canonical (companies: name, website,
industry), read **canonical** — call the window with **no** `facet_schema` so the
list fields come from canonical, then hydrate the page's canonical in **one
batch** (`list_canonical_for_entities`, never per-row). A latest-facet window
would silently produce a different value. If your truth is the freshest rendered
data (LinkedIn: latest post metrics), pass the `facet_schema` and read the
facet. Choose deliberately; the tests pin which one each handler uses.

---

## 9. Sync ingest — receiving from a source

A module that owns a surface implements `@syncHandler`, which registers the
reserved `<plugin_id>.__sync__` method. The host invokes it with a
`SourceEnvelope` (the thing a [source](./source.md) emitted), and the method
dispatches internally on `envelope.kind` and a `payload` discriminator (e.g.
`entity_type`). This is where external data becomes graph writes — typically via
`apply_batch` for bulk fragments. The source produces envelopes; the module's
sync handler decides how they land in the graph it owns.

---

## 10. UI — connecting the frontend to your module

The UI entry (`ui/index.tsx`, by convention) calls `defineModule(config)`, declaring
your module's identity and the component slots the host mounts:

```tsx
// ui/index.tsx
import { Icon } from "@magnis/host/ui";
import { defineModule } from "@magnis/host/base";
import { ContactCard } from "./EntityCards";
import { ContactOverview } from "./ContactOverview";
import { ContactCreateRenderer } from "./ContactCreateRenderer";

export const ContactsModule = defineModule({
  id: "contacts",
  title: "Contacts",
  icon: <Icon name="user" size={26} />,
  entityTypes: ["person"],
  primaryEntityType: "person",
  rpc: { update: "contacts.update" },   // enables inline rename in the header
  enableListRename: true,
  EntityCard: ContactCard,               // the agent's entity card
  DetailsTabContent: ContactOverview,    // body of the entity's "Overview" tab
  toolCallRenderers: [{ actions: ["create"], Render: ContactCreateRenderer }],
  mapListItem: (raw) => ({ /* id, name, schema_id, preview, … */ }),
});
```

The host renders the detail **shell** — avatar, name, the `OVERVIEW / MEMORY /
FILES …` tabs; your `DetailsTabContent` fills the Overview tab. Tabs like
MEETINGS or PROJECTS are contributed by *those* modules, not yours. Slot props
are host-defined contracts (e.g. `DetailsTabContent` receives
`{ entityId, facets, linkedEntities }`); provide only the slots your module
needs (`EntityCard`, `DetailsTabContent`, `ListItemContent`, `HeaderActions`,
`toolCallRenderers`).

**Tool-call renderers.** When the agent calls one of your tools, the chat shows
an approve/result card. A renderer per action (`toolCallRenderers`) wraps the
host's `BaseToolCallCard` — the host owns the approve/deny/allowlist chrome; you
render only the tool's args and result. Match the renderer's `actions` to the
`@writeTool` suffix it renders (`create` → the `create` renderer).

**UI → backend calls go over RPC by the same `<plugin_id>.<suffix>` names** your
module exposes — `useAppRuntime().transport.rpc<T>("contacts.list", { limit,
offset })`, not a bespoke client. The wire DTOs (`ContactListItem`,
`PaginatedResponse`) are shared between `module/` and `ui/` through the root
`types.ts` — the reason it sits at the root, reachable by both halves.

**Import host code only through the `@magnis/host/*` surface** — never deep host
paths. The curated entry points:

| Import | Provides |
|---|---|
| `@magnis/host/ui` | design system: `Icon`, `Stack`, `Row`, `Text`, `Card`, `IconButton`, … |
| `@magnis/host/base` | `defineModule`, `BaseEntityCard`, `BaseToolCallCard`, `useEntityFacet`, shared types |
| `@magnis/host/runtime` | `useAppRuntime`, `AppRuntime`, renderer/contract types |
| `@magnis/host/agent` | `ExpandableEntityCard`, `AllowlistDropdown`, `ExpansionContext` |
| `@magnis/host/markdown` | `MarkdownEditor`, `useEditorMentionSuggestion` |
| `@magnis/host/utils` | `toAvatarColor`, … |
| `@magnis/plugin-sdk` | shared wire types (`PaginatedResponse`, …) |

Tailwind utility classes used directly in a plugin `.tsx` are picked up by the
host's build; if a brand-new plugin lays out fine but renders flat/unstyled,
that scan (or a stale dev server) is the first thing to suspect.

`build:plugins` bundles the UI; the module isolate is bundled separately. Both
resolve their entries by convention (`ui/index.tsx`, `module/index.ts`) — see
the commands in [README.md](./README.md).

---

## 11. Testing

Module tests run under **vitest** (`bun run test`) with
`@magnis/testkit/module` — no database:

- **`mockGraph(overrides?)`** — a throwing Proxy: any graph op you did not
  explicitly stub throws `unexpected graph op: <name>`. That is how a test
  forbids an N+1 — leave `get_entities` / `list_facets_for_entities` unstubbed
  and a per-row read blows up.
- **`mountModule(TheClass, opts?)`** — runs the class through the real
  `definePlugin`/init path. In dispatch mode it returns `{ rpc, tools }` so you
  assert the *decorated* names and routing (`call("companies.list", …)` or the
  bare `"list"`), and that `tools` excludes `@rpc`/`@syncHandler` methods.

The minimum bar for a module: tool-shape correct, and no per-row N+1 in list
handlers (assert the exact crossing counts). Whole-module tests live in
`module/__tests__/`; a unit test for a single helper co-locates as
`helper.test.ts`.

---

## 12. Conformance checklist

A module is done only when all hold:

- [ ] `bun run typecheck` clean; `bun run lint` clean (0 warnings, no `any`).
- [ ] `tsconfig.json` sets `experimentalDecorators: true`.
- [ ] `service.ts` is the class only — no constants, no free functions.
- [ ] `schema.ts` + `types.ts` are loose root files; no single-file folders.
- [ ] `module/index.ts` is `definePlugin(...)` and nothing else.
- [ ] No `migrations/` folder unless it carries a real data migration.
- [ ] Every entity/facet has its `schemas/` file under the `<id>.…` namespace
      (entity file: no `version`; facet file: has `version`), and every
      FOREIGN ask is declared in `[permissions]`.
- [ ] List handlers read the intended value (canonical vs latest facet,
      deliberately) and use batch reads — no per-row N+1.
- [ ] Whole-module tests in `module/__tests__/` on `@magnis/testkit/module`,
      green under `bun run test`.
