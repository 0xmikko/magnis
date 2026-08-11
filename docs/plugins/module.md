# Building a module, end to end

A **module** owns a slice of the graph — it registers schemas, reads and writes
entities and their dictionaries, exposes tools to the agent, and draws UI.
Companies, contacts, email, meetings are modules. This guide takes you from an
empty folder to a conforming, tested module: what a module is, how it is laid
out, how it runs, what it can call, how schemas register, and the write rule
that catches everyone once.

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
  schemas/               # graph model, one JSON file per ENTITY (see Schemas)
  search.toml            # which dictionary keys are searchable + what gets embedded
  types.ts               # wire DTOs
  schema.ts              # schema-id string constants for read/write call sites
  module/                # the backend part (V8 isolate)
    index.ts             # definePlugin(TheClass) — nothing else (the entry, by convention)
    service.ts           # the class ONLY — no constants, no free functions
    helpers.ts           # free functions the service uses
    __tests__/           # whole-module tests on @magnis/testkit/module
  ui/                    # the frontend part (React) — optional; ui/index.tsx = the entry
  migrations/            # ONLY if the module ships a real data migration (see Schemas)
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
  private readonly graph: GraphService;
  constructor(deps: PluginDeps) {
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
agent-facing tool definitions. `GraphService` is not generic: a node's
dictionary is a plain JSON map, and a module types it with its own interface at
the call sites that care.

---

## 4. What a module can call — the deps

The constructor receives `PluginDeps = { graph, ctx, util, rpc }`:

- **`ctx: PluginContext`** — `{ user_id, extension_kind, extension_id }`.
  `extension_id` is the RPC-name prefix; `user_id` is stamped host-side for
  scoping, never supplied by JS.
- **`util`** — `uuid_v5(namespace, name)`, a deterministic UUIDv5 byte-equal to
  the Rust side, for deriving ids that match native handlers.
- **`rpc`** — `execute<T>(method, params?)`, cross-module RPC over the host
  router. Allowed targets are declared in the manifest `[permissions]` `call`
  list. (LinkedIn uses it to call `contacts.get_social_tracking_by_handle`,
  etc.)
- **`graph: GraphService`** — the graph API, below.

**The graph API:**

- **Entities** — `create_entity`, `get_entity`/`get_entities` (batch),
  `list_entities`, `list_entities_window` (a page + the exact total in ONE
  statement, filtered/ordered over entity columns, dictionary keys or an edge
  dictionary), `list_entities_by_property_field`, `search_entities_by_name`,
  `get_entity_full(id, { links? })`, `update_entity_name`, `delete_entity`, …
- **The node dictionary** — `update_properties({ entity_id, properties })`
  MERGES the top-level keys you send, and an explicit `null` REMOVES a key.
  The bulk `apply_batch` lane is the other way round: it REPLACES the
  dictionary with the fields as last synced. Know which lane you are on — a
  curated edit that resends the whole map is harmless, a sync that sends a
  partial one silently drops the rest.
- **Identity** — a node is found by its `anchor`, not by an external id column.
  `create_entity` takes the anchor and the chokepoint resolves it, so the
  second sync of the same provider record attaches instead of duplicating.
- **Links** — `add_link`, `delete_link`, `list_links_for_entity`. An edge's own
  dictionary (`metadata`) UNIONS on re-observation — many observers, unlike the
  node.
- **Batch/merge** — `apply_batch(GraphBatchInput)` (atomic entities+links
  fragment — the bulk-ingest primitive), `merge_preview`, `merge_execute`.

**Prefer the batch reads** (`get_entities`, `list_entities_window`) over
per-row calls — an N+1 in a list handler is a defect the tests forbid (see the
Testing section).

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
`@rpc` method (see the tools-and-RPC section) — off the agent surface — that
is **idempotent** (callers
retry) and returns the id(s) the caller needs to link. `email.ensure_address`
is find-or-create: same address in, same entity id out.

---

## 7. Schemas — two separate concerns

Owning an entity involves two things that are easy to conflate:

1. **`schema.ts` constants** are *only* the deduped spelling of each namespace
   string for read/write call sites — e.g.
   `export const COMPANY = "companies.company"`. They are **not** the
   registration source.
2. **The `schemas/` directory** is the source of truth, discovered by
   convention — **one file per ENTITY**, nothing else. `<entity>.json` carries
   `name`, `description`, the endpoint `roles` the link registry checks, and
   optional `triggerable` / `mergeable` traits. The schema id is derived from
   the filename inside the module's namespace `<id>.…` — a package cannot claim
   a foreign one (full rules in [manifest.md](./manifest.md)).

   A file carrying `"version"` is a **retired facet contract and is REFUSED at
   install**. Per-block schemas, canonical `mappings` and merge strategies were
   the facet model; the node dictionary replaced all three, and a dictionary
   key needs no contract.

3. **`search.toml`** declares which dictionary keys are searchable, how each is
   typed, and what the indexer embeds — see [graph.md](../graph.md). It is what
   generates the module's `<prefix>.search` / `.list` / `.predicate` tools.

Installing the module registers the `schemas/` files **natively** — there is
no install hook to write. A `migrations/` folder (plus `[[migrations]]` in the
manifest) appears **only** when the module needs a real **data migration**
(`defineMigration` — transform rows already in the graph on a version bump).
That is rare; most modules have no migrations folder.

To own an entity you simply add its `schemas/` file — writes to your own
namespace are implicitly granted; only foreign asks go in `[permissions]`.

---

## 8. The write rule that catches everyone once

**The two write lanes do NOT behave the same way.**

`apply_batch` — the sync lane — REPLACES a node's dictionary: after the write
it is exactly what the source observed, never a mixture of this sync and the
last one. That is what makes a re-sync safe, and it is why a sync handler that
sends a partial map silently drops every key it omitted.

`update_properties` — the curated lane — MERGES the top-level keys you send,
and an explicit `null` removes one. A human correcting a phone number does not
have to resend the person.

The invariant "one node, one writer" is about WHO writes, not about how much:
no two sources contend for one dictionary, because each source's view lives on
its own node and the hub reaches it over `identity`.

An EDGE behaves the other way round: many observers, so re-observing a link
UNIONS into its `metadata` rather than replacing it. Per-observer state — an
unread count, a pin order — belongs there, not on the node, because the node
has no room for two observers' answers.

Reading is likewise one question, not two. There is no second store to consult:
`list_entities_window` returns the page and its exact total in one statement,
with filters and ordering over entity columns, dictionary keys, or an edge
dictionary. The old "latest record vs merged canonical" fork is gone with the
two stores that created it.

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
`{ entityId, linkedEntities }`); provide only the slots your module
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
| `@magnis/host/base` | `defineModule`, `BaseEntityCard`, `BaseToolCallCard`, shared types |
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
  forbids an N+1 — leave `get_entities` / `list_entities_window` unstubbed and
  a per-row read blows up.
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
- [ ] Every ENTITY has its `schemas/` file under the `<id>.…` namespace, with
      its endpoint `roles`; no file carries `"version"` (that is a retired
      facet contract and install refuses it); every FOREIGN ask is declared in
      `[permissions]`.
- [ ] Searchable keys are declared in `search.toml`, and what the module
      filters on is what the indexer embeds.
- [ ] Sync writers send the WHOLE dictionary (`apply_batch` replaces);
      curated writers send only what changed (`update_properties` merges).
- [ ] List handlers use batch reads — no per-row N+1.
- [ ] Whole-module tests in `module/__tests__/` on `@magnis/testkit/module`,
      green under `bun run test`.
