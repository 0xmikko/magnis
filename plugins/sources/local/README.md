# local (external MCP connector)

Local-filesystem notes as a Magnis external source — migrated out of the backend
(`backend/src/sources/local`). Read-only sync: it scans a notes directory for
`*.md` files and serves them on the `notes` surface via `magnis.sync.fetch`, with
the same canonical payload (`path`, `filename`, `body`, `size`, `mtime`,
`content_hash`; `remote_id = path`) the in-core source emitted.

Note **writes** are unchanged — the `notes` module writes the same directory
directly — so this connector only ingests.

- **Server:** `magnis-local` binary (this crate).
- **Manifest:** [`manifest.toml`](manifest.toml) — `id = "local"`,
  `surfaces = ["notes"]`, `core = true` (always loaded).
- **Config (env, inherited from the backend):** `NOTES_DIR` (defaults to
  `$STORAGE_DIR/notes`).

Fetch model: `direction = "backward"` (bootstrap) returns all notes;
`direction = "forward"` (catch-up) returns notes whose `mtime` is past the
cursor's `last_mtime`. `next_cursor = { "last_mtime": <newest mtime> }`.
