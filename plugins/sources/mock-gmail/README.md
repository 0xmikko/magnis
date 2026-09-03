# mock-gmail

External MCP source used by dataset, eval, and E2E flows. It exposes the
`email` and `meetings` surfaces over stdio JSON-RPC.

Test data and administration enter only through manifest-declared dataset
actions. The host validates each payload and supplies invocation/account/user/time
metadata. Event actions return production-shaped `Live` envelopes with stable
remote IDs; `rate_limit_next_fetch` makes exactly one subsequent poll surface
the connector's typed rate-limit error before polling returns to empty success.

There is no HTTP injection port, shared JSONL store, or provider bypass.
