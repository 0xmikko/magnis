# mock-gmail

External MCP source used by dataset, eval, and E2E flows. It exposes the
`email` and `meetings` surfaces over stdio JSON-RPC.

Test data enters only through the manifest-declared `emit_message` dataset
action. The host validates its payload, supplies invocation/account/user/time
metadata, and accepts only production-shaped `Live` envelopes with stable
remote IDs. The normal `magnis.sync.fetch` path is stateless and empty.

There is no HTTP injection port, shared JSONL store, or provider bypass.
