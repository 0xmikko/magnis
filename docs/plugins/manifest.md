# `manifest.toml` Reference

Every plugin has a `manifest.toml` at its root. It is the **single source of
truth** for a module's schemas, what it's allowed to do (capabilities), and
what it exposes (surfaces). The Rust struct is `Manifest` in
`backend/src/plugin_runtime/manifest.rs`; `Manifest::parse_toml` validates it at
install time. Use `plugins/modules/contacts/manifest.toml` as the canonical example.

TOML is chosen over JSON for the same reason Cargo did: it is strictly typed
(integers vs floats, native strings, no ambiguous coercion) **and** allows
comments, so every non-obvious field can explain itself in place. Remember TOML's
one ordering rule: all bare top-level keys (`id`, `version`, `owns`, …) must come
**before** any `[table]`.

## Top level

```toml
id = "contacts"                # plugin id == RPC prefix == route key
version = "0.1.0"
magnis_api_version = "0.1.0"   # host SDK version this targets
owns = ["contacts.*"]          # ownership globs; every owned schema id must match one
requires_schemas = []          # schemas from OTHER modules it reads/links (informational)

[schemas]        # entities + versioned facets (json_schema + canonical mappings) + links
[capabilities]   # the security boundary — every array defaults to empty (deny)
[surfaces]       # rpc_handlers / tools / sync_handlers

[entry]
module = "module/index.ts"
ui = "ui/index.tsx"
```

## `schemas` — the data model the module owns

```toml
[[schemas.entities]]
id = "contacts.person"
name = "Person"
description = "..."

[[schemas.facets]]
id = "contacts.person.email"       # facet schema id (dotted)
entity_schema = "contacts.person"  # which entity it attaches to
version = 1

[schemas.facets.json_schema]
type = "object"
# properties nest as [schemas.facets.json_schema.properties.<field>]

[[schemas.facets.mappings]]         # canonical mappings — see below
facet_path = "email"
canonical_key = "person.emails"
strategy = "collection"

[[schemas.links]]
kind = "has_email"
from = "contacts.person"
to = "email.address"
```

### Canonical mappings (DEC-16)

A facet's `mappings` array (`core::CanonicalMapping`) declares how facet fields
project into **canonical properties** (the derived truth merged across sources).
This is what lets `graph.get_canonical(...)` return merged values. **Mappings
travel in the manifest** — the installer persists them; the Rust core defines no
domain mappings.

Each mapping (`core::CanonicalMapping`, `backend/src/core/schema.rs`):

| Field | Meaning |
|-------|---------|
| `facet_path` | dotted path into the facet data (`"email"`, `"profile.email"`) |
| `canonical_key` | the canonical property it feeds (`"person.emails"`) |
| `strategy` | `MergeStrategy` (serde snake_case): `single_aligned` (one value, conflicts resolved), `collection` (deduped list), `mergeable_object` (merge objects field-by-field) |
| `transform` | optional transform/validation hint (usually omitted) |

Real example — the contacts email facet:

```toml
# schemas.facets[].mappings for "contacts.person.email"
[[schemas.facets.mappings]]
facet_path = "email"
canonical_key = "person.emails"
strategy = "collection"
```

`strategy = "collection"` is why the canonical key is the **plural** `person.emails`
(a deduped list), not a scalar `person.email`. Pick `collection` for fields a
person can have many of (emails, phones, handles); `single_aligned` for
single-valued truth (full name, birthday).

> Plural vs singular gotcha (learned the hard way): the contacts mappings
> produce **plural** canonical keys (`person.emails`, `person.phones` as
> collections). The singular keys (`person.email`) are never populated, so a
> view's top-level `email` reads null — email surfaces via the **facets array**
> + `channels: ["Email"]`, mirroring the native module exactly.

## `capabilities` — the security boundary

Built into the per-dispatch `ModuleContext` (DEC-10) and checked by every op.
All arrays default to empty (deny).

| Field | Gate | Matching |
|-------|------|----------|
| `facet_write_prefixes` | `graph.attach_facet` / `update_facet` | prefix (`"contacts."`) or glob (`"contacts.*"`) or exact |
| `link_kinds_writable` | `graph.add_link` | same matcher, on link `kind` |
| `reads_schemas` | `graph` reads of OTHER schemas (own facets always readable) | same matcher |
| `events_emitted` | `events.emit` | exact event kind |
| `can_merge_schemas` | `merge_execute` | entity schema id |
| `rpc_calls` | `rpc.execute` (cross-module hub) | **exact** fully-qualified method, e.g. `"email.ensure_address"` |

`requires_schemas` (top level) declares schemas owned by other modules that this
one reads or links to — informational + install-ordering; the runtime gate is
`reads_schemas` / `link_kinds_writable`.

## `surfaces` — what the module exposes

| Field | Meaning |
|-------|---------|
| `rpc_handlers` | Fully-qualified RPC methods the module answers (`contacts.list`, `contacts.create`, …). Must match the routes the dispatcher registers. |
| `tools` | Subset exposed to the **agent** as tools (DEC-14 harvests their definitions at boot). Usually the same list; omit internal-only methods. |
| `sync_handlers` | Sync surfaces (provider ingestion — Gmail, Telegram, …). **Empty for pure CRUD modules** (most). If your module ingests from an external provider, sync is a separate subsystem with strict Source/Module/Surface boundaries — read `docs/backend/sync.md` before adding one. |

Method names **must** be prefixed with `<id>.` — the SDK glues the prefix from
`ctx.extension_id` at init, and the host asserts ownership.

## `entry`

```toml
[entry]
module = "module/index.ts"
ui = "ui/index.tsx"
```

`module` is the backend entry the isolate loads; `ui` is the file the frontend
fetches via `loadPluginModule(id, "index.tsx")`. Both default sensibly if
omitted (`module/index.ts`).

## Changing a manifest

The installer runs a **breaking-change check** against the previously installed
manifest (new required facet fields, type narrowing). Additive changes (new
capability entries, new optional fields, new schemas) are safe. Bump `version`
when you change schemas.
