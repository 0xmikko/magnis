# @magnis/testkit

Dev-only test doubles and builders for Magnis plugin tests — fake hosts, envelope builders, contract harnesses. This is how a plugin proves the wire contract without a live core or a live provider.

Never shipped in a plugin bundle or the published catalog; it exists so `bun run test` and `bun run test:connectors` can run hermetically.
