# The Cross-Module RPC Hub

A module often needs an effect that belongs to **another** module — e.g.
`contacts.create` needs an `email.address` entity. The contacts module must not
write the `email.*` schema directly (that's the email module's schema). Instead
it **calls the email module over RPC** and links the result. That's the "hub".

Full spec + rationale: `docs/plans/plugin-cross-module-rpc-hub.md` (Codex-approved).

## The pattern

```ts
async create(params) {
  let email_address_entity_id = null;
  if (params.email) {
    // ask the email module to find-or-create its own entity
    const addr = await this.rpc.execute<{ id: string }>(
      "email.ensure_address", { address: params.email },
    );
    email_address_entity_id = addr.id;
    // link my entity to it (capability: link_kinds_writable: ["has_email"])
    await this.graph.add_link({ from_id: contact.id, to_id: addr.id, kind: "has_email" });
  }
  return { ...listItem, fields: { email_address_entity_id } };
}
```

Manifest side:

```jsonc
"capabilities": {
  "rpc_calls": ["email.ensure_address"],   // exact methods allowed (least privilege)
  "link_kinds_writable": ["has_email"]
}
```

## The decisions (DEC-1..DEC-9)

- **DEC-1 — synchronous request/reply.** `rpc.execute` returns the target's
  result value. (Rejected: fire-and-forget via the event bus — no return value,
  so the caller couldn't get the new entity id to link it.)
- **DEC-2 — method-level capability (least privilege).** `rpc_calls` lists exact
  fully-qualified methods. Module-level grants are not allowed.
- **DEC-3 — `rpc.execute(method, params)`.** Fully-qualified method string +
  params object; matches `RpcRouter` method names and the `rpc_calls` list 1:1.
- **DEC-4 — runs through the full `RpcRouter` on the host runtime.** The op
  marshals to the host via `on_host` and calls
  `app_state.rpc_router().dispatch(&app_state, &ctx, method, params)`. All
  captured values are owned (`Send + 'static`).
- **DEC-5 — native-only in v0, ENFORCED.** A plugin-owned target would route
  back into the dispatcher and deadlock the single-threaded calling worker. The
  op rejects any target where `plugin_dispatcher.has_route(method)` is true.
  Plugin→plugin is a future stage (needs a non-blocking worker model).
- **DEC-6 — per-dispatch `AppState`, no stored handle, no cycle.** `AppState` is
  a by-value `Clone`, not `Arc<AppState>`. The router passes an owned clone into
  `dispatcher.dispatch_with_state(.., app_state)` → the worker forwards it to
  `PluginRegistry::dispatch_with_host`, which sets it on the runtime
  (`set_dispatch_host`) **before** the handler and clears it after. No worker
  retains `AppState`, so there's no `AppState ⇄ dispatcher` reference cycle and
  tests still drop `AppState` cleanly.
- **DEC-12 — identity inherited.** The cross-module call runs under the caller's
  `user_id` (read from `OpState`, wrapped in `RequestContext::for_user`). The
  target module is user-scoped exactly as a direct call would be. (The worker
  carries `user_id` only, not the OAuth token — fine for internal targets like
  `ensure_address`; token threading is out of scope for v0.)

The op is `op_plugin_rpc_call` in `backend/src/plugin_runtime/ops/rpc.rs`,
exposed to JS as `globalThis.__magnis_rpc.execute` (and `deps.rpc.execute` via
the SDK). `graph.add_link` is `op_graph_add_link` in `ops/graph.rs`.

## Adding a new hub target (the callee side)

To let other modules call into yours, expose a plain RPC method on your module
(native modules: add to `rpc_methods()` + the `handle` match — see
`email.ensure_address` in `backend/src/modules/emails/controller.rs`). It should
be **idempotent** (callers retry) and return the id(s) the caller needs to link.
Do NOT add internal-only hub targets to `tools()` — they aren't agent tools.

## Flow (what you'll see in the logs)

```
RPC contacts.create  (plugin worker)
  └─ rpc.execute("email.ensure_address")
       → on_host → RpcRouter::dispatch → email.ensure_address  (host runtime)
RPC email.ensure_address  Nms     ← logged INSIDE contacts.create
RPC contacts.create       Mms
```

If `rpc.execute` returns "host rpc unavailable", you're on the single-runtime
unit path (no `AppState` in OpState) — use the full app harness
(`app_state_with_plugins`) for tests that exercise the hub.
