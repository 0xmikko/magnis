# `manifest.toml` reference

Every plugin — module or source — has a `manifest.toml` at its root. It is the
**single source of truth** for what the plugin is, what it owns, what it is
allowed to do, and how the host loads or spawns it. The host validates it when
the plugin is installed; a manifest that violates a rule below (an owned id
outside `owns`, an unknown auth type) is rejected.

TOML is chosen over JSON for the reason Cargo was: it is strictly typed
(integers vs floats, native strings, no ambiguous coercion) **and** allows
comments, so every non-obvious field can explain itself in place. Remember TOML's
one ordering rule: all bare top-level keys (`id`, `version`, `owns`, …) must come
**before** any `[table]`.

This reference is split by kind — [module manifest](#module-manifest) first,
then [source manifest](#source-manifest), then the [presentation](#presentation-both-kinds) block both share. For how a module is built around this manifest see
[module.md](./module.md); for a source, [source.md](./source.md).

---

## Module manifest

A module manifest declares the graph schemas the module owns, its capabilities,
its callable surface, and its entry points. Example fields below are the real
`companies` / `contacts` manifests.

### Top level

```toml
id = "companies"                 # plugin id == RPC prefix == route key
version = "0.1.0"
magnis_api_version = "0.1.0"     # host SDK contract this manifest targets
owns = ["companies.*"]           # ownership globs — EVERY schema id / link kind
                                 # declared below must match one, or it's rejected
requires_schemas = []            # optional: schemas OWNED by other modules that
                                 # this one reads/links (informational + ordering)
```

### `[schemas]` — the data model the module owns

Entities, their versioned facets (each a JSON Schema plus canonical `mappings`),
and link kinds:

```toml
[schemas]
links = []                       # link kinds this module defines (see below)

[[schemas.entities]]
id = "companies.company"
name = "Company"
description = "A company / organisation entity owned by the companies plugin."

[[schemas.facets]]
id = "companies.company.details"   # facet schema id (dotted, under an owned prefix)
entity_schema = "companies.company"  # which entity it attaches to
version = 1

[schemas.facets.json_schema]
type = "object"
additionalProperties = true
# each property nests as [schemas.facets.json_schema.properties.<field>]

[schemas.facets.json_schema.properties.name]
type = "string"

[schemas.facets.json_schema.properties.headcount]
type = "integer"
```

A link kind (from `contacts`, which links people to their email entities):

```toml
[[schemas.links]]
kind = "has_email"
from = "contacts.person"
to   = "email.address"
```

#### Canonical mappings

A facet's `mappings` array declares how its fields project into **canonical
properties** — the derived truth merged across every source that ever wrote the
field. This is what lets `graph.get_canonical(...)` return a single merged value.
Mappings travel in the manifest; the host reads them, and the generic core
defines no domain mappings of its own.

```toml
[[schemas.facets.mappings]]
facet_path    = "name"             # dotted path into the facet data
canonical_key = "companies.name"   # the canonical property it feeds
strategy      = "single_aligned"   # how conflicting values merge
```

| `strategy` | Merge behaviour | Use for |
|---|---|---|
| `single_aligned` | one value; conflicts resolved by confidence → recency | single-valued truth (name, website, industry) |
| `collection` | a deduped list of every value seen | fields a subject can have many of (emails, phones, handles) |
| `mergeable_object` | merge objects field-by-field | structured blocks assembled from several sources |

> **Plural-vs-singular gotcha.** A `collection` strategy produces a **plural**
> canonical key (`person.emails`, a deduped list) — the singular `person.email`
> is then never populated. Read the collection key (or the facets array), not
> the singular. Choose the strategy deliberately; the read side depends on it
> (see [module.md](./module.md) §8, canonical vs facet).

### `[capabilities]` — the security boundary

The host checks every capability on every op. **All arrays default to empty
(deny)** — grant only what the module needs.

```toml
[capabilities]
facet_write_prefixes = ["companies."]              # facets it may write
link_kinds_writable  = []                          # link kinds it may create
reads_schemas        = ["companies.", "contacts.person"]  # OTHER schemas it may read
events_emitted       = []                          # event kinds it may emit
can_merge_schemas    = ["companies.company"]       # entity schemas it may merge
# rpc_calls          = ["email.ensure_address"]    # EXACT cross-module methods it may call
```

| Field | Gate | Matching |
|---|---|---|
| `facet_write_prefixes` | `graph.attach_facet` / `update_facet` | prefix (`"companies."`) / glob (`"companies.*"`) / exact |
| `link_kinds_writable` | `graph.add_link` | same matcher, on the link `kind` |
| `reads_schemas` | reads of OTHER schemas (own facets always readable) | same matcher |
| `events_emitted` | `events.emit` | exact event kind |
| `can_merge_schemas` | `merge_execute` | entity schema id |
| `rpc_calls` | `rpc.execute` (cross-module) | **exact** fully-qualified method |

A denied op throws — there is **no silent skip**. If a write seems to do nothing,
suspect a missing entry here (see [module.md](./module.md) §6).

### `[surfaces]` — what the module exposes

```toml
[surfaces]
rpc_handlers  = ["companies.list", "companies.get", "companies.create", "companies.update"]
tools         = ["companies.list", "companies.get", "companies.create", "companies.update"]
sync_handlers = []
```

| Field | Meaning |
|---|---|
| `rpc_handlers` | fully-qualified methods the module answers; must match the routes its handlers register |
| `tools` | the subset exposed to the **agent** as tools — usually the same list; omit internal-only methods |
| `sync_handlers` | sync surfaces the module ingests from a source (empty for pure-CRUD modules) |

Method names **must** be prefixed with `<id>.` — the SDK glues the prefix from
the plugin id, and the host asserts ownership.

### `[entry]`

```toml
[entry]
module = "module/index.ts"   # the module code the host loads
ui     = "index.tsx"         # the UI the frontend fetches (optional)
```

### `[lifecycle]`

```toml
[lifecycle]
install = "lifecycle/install.ts"   # or "standard" for the host default
```

`install` runs once when the plugin is installed, to register its schemas.
Most modules register exactly what the manifest declares and use the built-in
`"standard"` routine (no `lifecycle/` folder); a file path is needed only for
custom install / migration work (see [module.md](./module.md) §7).

---

## Source manifest

A source manifest declares the surfaces it serves, how the host spawns it, how it
authenticates, and which credential keys it needs. Examples below are the real
`x` (api_key) and `google` (oauth2) manifests.

### `[source]`

```toml
[source]
id = "x"
version = "1.0.0"
surfaces = ["x", "contacts"]   # the named streams it fetches
transport = "stdio"            # the host talks to it over stdio JSON-RPC
account_mode = "single"        # single | multi
kind = "plugin"
```

### `[spawn]`

```toml
[spawn]
command = "bun"
args = ["run", "src/main.ts"]   # the host runs this with the source dir as cwd
```

Bun executes the TypeScript directly — no build, no dist.

### `[auth]`

`type` selects the **ceremony** the host/UI runs. Add the `[auth.oauth2]`
sub-table only for `oauth2`.

```toml
# api_key (x) — operator pastes a key; no browser screen
[auth]
type = "api_key"
```

```toml
# oauth2 (google) — host owns the browser ceremony; connector runs only exchange
[auth]
type = "oauth2"
ui = "auth/screen.tsx"

[auth.oauth2]
auth_url = "https://accounts.google.com/o/oauth2/v2/auth"
scopes = "openid email https://www.googleapis.com/auth/gmail.readonly …"
```

| `type` | Used by | Connector implements |
|---|---|---|
| `api_key` | X | only `probeAuth` (verify the key) |
| `shared_provider` | LinkedIn | same as `api_key` (a shared upstream provider) |
| `oauth2` | Google | `auth.exchange` (+ `revoke`); host owns the browser flow |
| `phone_code` | Telegram | stateful `auth.begin` / `auth.step` / `auth.revoke` |

The full ceremony contract and the auth screen live in [source.md](./source.md)
§6.

### `[credentials]`

Declare the keys the source needs, which are minted by the auth flow, and how
they reach the process.

```toml
# x — one app-cred, string OR object form (object opts it into Settings → Sources)
[credentials]
keys = [
  { name = "bearer_token", label = "API bearer token", help_url = "https://developer.x.com/en/portal/dashboard", description = "App-only bearer token from your X developer portal." },
]
inject = "meta"
```

```toml
# google — minted refresh_token + app creds
[credentials]
keys   = ["refresh_token", "client_id", "client_secret"]
minted = ["refresh_token"]   # keys the auth ceremony produces (vs operator-supplied)
inject = "meta"              # "meta" (per-call _meta) | "env" (child-process env)
```

| Field | Meaning |
|---|---|
| `keys` | credential keys the source reads — plain strings, or objects (`name`, `label`, `help_url`, `description`) to render fields in Settings → Sources |
| `minted` | the subset produced by the auth ceremony and stored host-side; never operator-entered |
| `inject` | `"meta"` (attached to every call's `_meta`, almost everyone) or `"env"` (put in the child process environment at spawn) |

The connector reads only `_meta` (or env) — never a secret store. The full
secrets model is in [source.md](./source.md) §7.

### `[profile]`

```toml
[profile]
mode = "poll"          # poll | push
interval_secs = 300    # poll cadence (poll mode)
```

### `[lifecycle]`

```toml
[lifecycle]
install = "standard"   # host-standard install routine
```

Sources declare lifecycle entirely here and carry no `lifecycle/` folder.

---

## `[presentation]` (both kinds)

An optional catalog card the plugin reports about itself: how it appears in the
extensions catalog.

```toml
[presentation]
title = "Companies"
summary = "Track companies you interact with across email, meetings, and notes."
publisher = "Magnis"
publisher_url = "https://magnis.ai"
icon_url = "/api/plugins/companies/ui/icon.svg"
details = "# Companies\n\nLonger markdown shown on the catalog detail page."
```

---

## Changing a manifest

When a plugin is reinstalled, the host runs a **breaking-change check** against
the previously installed manifest — a newly-required facet field or a narrowed
type is rejected. Additive changes (new optional fields, new schemas, new
capability entries) are safe. Bump `version` whenever you change schemas.
