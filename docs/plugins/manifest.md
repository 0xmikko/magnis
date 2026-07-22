# `manifest.toml` reference

Every plugin — module or source — has a `manifest.toml` at its root. It is the
**single source of truth** for what the plugin is, what it owns, what it is
allowed to do, and how the host loads or spawns it. The host validates it when
the plugin is installed; a manifest that violates a rule below (an owned id
outside the module's namespace, an unknown auth type) is rejected.

TOML is chosen over JSON for the reason Cargo was: it is strictly typed
(integers vs floats, native strings, no ambiguous coercion) **and** allows
comments, so every non-obvious field can explain itself in place. Remember TOML's
one ordering rule: all bare top-level keys (`id`, `version`, …) must come
**before** any `[table]`.

This reference is split by kind — [module manifest](#module-manifest-v3) first,
then [source manifest](#source-manifest). For how a module is built around this
manifest see [module.md](./module.md); for a source, [source.md](./source.md).

---

## Module manifest (v3)

A module manifest is a **package card**: identity, the sync surfaces it
ingests, and its foreign permission asks. Everything else is discovered by
convention inside the package:

```
plugins/modules/<id>/
  manifest.toml    identity + [ingests] + [permissions]
  README.md        catalog description (markdown detail page)
  icon.svg|png     catalog icon, at the package ROOT
  schemas/         graph model, convention-discovered (see below)
  module/index.ts  the module code the host loads (convention)
  ui/index.tsx     the UI the frontend fetches (convention; presence = has UI)
  migrations/      ONLY when real data migrations exist
```

Example fields below are the real `companies` / `contacts` manifests.

### Top level

```toml
id = "companies"                 # plugin id == RPC prefix == route key == namespace
version = "0.1.0"
magnis_api_version = "0.1.0"     # host SDK contract this manifest targets
title = "Companies"              # catalog card
summary = "Track companies you interact with across email, meetings, and notes."
publisher = "ai.magnis"          # reverse-domain publisher identity
```

`tier = "system"` (optional) marks a mandatory, always-loaded module that
cannot be uninstalled or disabled (`triggers` is the only one).

### `schemas/` — the data model the module owns

The graph model lives in per-schema JSON files under `schemas/`, discovered by
convention — **not** in the manifest:

- `<entity>.json` — an **entity descriptor**: `name`, `description`, plus the
  optional traits `"triggerable": true` (its events may drive triggers) and
  `"mergeable": true` (canonical merge allowed).
- `<entity>.<facet>.json` — a **facet contract**: `version`, optional
  `mappings`, and the JSON Schema shape (`type` / `required` / `properties` /
  `additionalProperties`) flattened at the top level. The facet's schema id is
  derived from the filename: `schemas/company.details.json` in `companies` →
  `companies.company.details`.

The discrimination rule: a facet file **always** has `"version"`; an entity
file **never** does. Two overrides exist for grandfathered ids:

- `"id"` — a legacy facet id that doesn't nest as
  `<plugin>.<entity>.<facet>` (e.g. `contacts.memory` lives in
  `schemas/person.memory.json` with `"id": "contacts.memory"`).
- `"entity"` — a facet attached to a FOREIGN entity (e.g. telegram's
  `schemas/contact.json` carries `"entity": "contacts.person"`).

```jsonc
// schemas/company.json — entity descriptor
{ "name": "Company", "description": "A company / organisation entity…", "mergeable": true }

// schemas/company.details.json — facet contract
{
  "version": 1,
  "mappings": [
    { "path": "name", "canonical": "companies.name", "strategy": "single_aligned" }
  ],
  "type": "object",
  "additionalProperties": true,
  "properties": { "name": { "type": "string" }, "headcount": { "type": "integer" } }
}
```

Installing a module registers these schemas natively — there is no install
hook to write.

#### Canonical mappings

A facet's `mappings` array declares how its fields project into **canonical
properties** — the derived truth merged across every source that ever wrote the
field. This is what lets `graph.get_canonical(...)` return a single merged value.
Mappings travel in the schema file; the host reads them, and the generic core
defines no domain mappings of its own.

```jsonc
{ "path": "name",                  // dotted path into the facet data
  "canonical": "companies.name",   // the canonical property it feeds
  "strategy": "single_aligned" }   // how conflicting values merge
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

### `[permissions]` — the security boundary

**Own-namespace rights are implicit**: writes to `<id>.` facets, own:own
links, and reads of own schemas need no declaration. `[permissions]` lists
ONLY the foreign asks; omit the whole section when there are none. Every
undeclared foreign op is denied.

```toml
[permissions]
read  = ["contacts.person"]          # foreign schemas it may read
create = []                          # foreign entities it may create
links = ["has_email"]                # foreign-touching link kinds it may create
call  = ["email.ensure_address"]     # EXACT cross-module methods it may call
host  = ["sync_state"]               # privileged host ops it may call
```

| Field | Gate | Matching |
|---|---|---|
| `read` | reads of foreign schemas (own always readable) | prefix (`"contacts."`) / exact |
| `create` | creating foreign entities | entity schema id |
| `links` | `graph.add_link` with a foreign-touching kind (own:own implicit) | link `kind` / `<from>:<to>` pair |
| `call` | `rpc.execute` (cross-module) | **exact** fully-qualified method |
| `host` | privileged host ops (`sync_state`, `composer`, `file_register`, …) | exact op grant |

A denied op throws — there is **no silent skip**. If a write seems to do nothing,
suspect a missing entry here (see [module.md](./module.md) §6).

### `[ingests]` — sync configuration

One table per sync surface the module consumes from a source; omit entirely
for pure-CRUD modules:

```toml
[ingests.email]
item = "email.message"   # optional: the surface's primary-item schema — its
                         # user-scoped graph count IS the "items synced" badge
```

RPC methods and tools are **not** declared in the manifest — they live only in
code. Every method a module registers is namespaced `<id>.…`, so the host
routes by prefix, and tool definitions are harvested from the running module.
Entrypoints are convention too: `module/index.ts` and `ui/index.tsx`.

### Migrations

There is no install hook — installing a module registers its `schemas/` files
natively. A `migrations/` folder (plus `[[migrations]]` in the manifest) exists
ONLY when the module ships real data migrations (see [module.md](./module.md)
§7).

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

## `[presentation]` (sources only)

An optional catalog card a **source** reports about itself. Modules do NOT use
this block: their card is the top-level `title` / `summary` / `publisher`, the
markdown detail page is `README.md`, and the icon is `icon.svg|png` at the
package root.

```toml
[presentation]
title = "Google"
summary = "Gmail + Calendar + Contacts over one OAuth ceremony."
publisher = "Magnis"
```

---

## Changing a manifest

When a plugin is reinstalled, the host runs a **breaking-change check** against
the previously installed manifest — a newly-required facet field or a narrowed
type is rejected. Additive changes (new optional fields, new schemas, new
capability entries) are safe. Bump `version` whenever you change schemas.
