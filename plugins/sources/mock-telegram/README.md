# mock-telegram

External MCP source used by dataset, eval, and E2E flows for the `telegram`
surface.

Test data enters only through the manifest-declared `emit_chat` and
`emit_message` dataset actions. The host validates their payloads, supplies
invocation/account/user/time metadata, and accepts only production-shaped
`Live` envelopes with stable remote IDs. The normal `magnis.sync.fetch` path is
stateless and empty.

There is no HTTP injection port, shared JSONL store, or provider bypass.
