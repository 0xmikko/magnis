// local — local-filesystem notes as a Magnis MCP source.
//
// TS port of the `magnis-local` Rust binary (wire-identical). Read-only sync:
// scans a notes directory for `*.md` files and serves them on the `notes`
// surface. Note *writes* are unchanged — the notes module writes the same
// directory directly — so this connector only ingests.
//
// NOTE (see manifest.toml): the manifest carries NO [profile] block, so the
// host builds no source runtime for it and this connector is never synced.
// It is kept as the working reference implementation of a filesystem source.

import { runConnector } from "@magnis/connector-sdk";
import { fetchLocalNotes } from "./fetch";

await runConnector({
  name: "magnis-local",
  version: "0.1.0",
  surfaces: ["notes"],
  intervalSecs: 60,
  fetch: fetchLocalNotes,
});
