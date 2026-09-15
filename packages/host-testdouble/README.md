# `@magnis/host-testdouble`

Runtime doubles for the `@magnis/host/*` modules, for this repository's UI
test lane. **Never bundled** — `scripts/build-plugins.ts` marks every
`@magnis/host/*` specifier external, and the host rewrites it to its own
implementation at load time.

## Why it exists

A plugin UI compiles against `@magnis/host-stubs` (types) and *runs* against
whatever the host injects on `window.__magnis_host`. Between those two there
was a hole: the UI tests under `plugins/modules/*/ui/__tests__/` had no way
to run in this repository at all. They ran in the closed frontend's vitest,
which checked this repo out as a git submodule and aliased `@magnis/host/*`
at its real shims.

That submodule is gone. These doubles are what replaced it: the tests stayed
in the repository that owns the code they test, and the host surface they
render against became an explicit, readable double instead of an implicit
dependency on somebody else's checkout.

## What a double owes you

Enough behaviour for a *plugin's* assertions to mean something, and no more:

- **Components** render their children and put their layout-relevant props on
  the DOM, so a plugin can assert what it passed. They do not reproduce the
  host's styling — a test that asserts host classes is asserting the host.
- **Hooks** return the shape the contract declares, seeded from
  `setHostRuntime()` where a test needs to steer them.
- **Pure utilities** (`@magnis/host/utils`) are reimplemented, because a
  plugin that formats a timestamp and asserts the string needs a real answer.

If a plugin test fails only because a double is too thin, thicken the double.
If it fails because it was really asserting the host's own behaviour, the
test belongs in the host.

## Drift

`@magnis/host-stubs/types` is generated from the host and is the contract.
`__tests__/surface.test.ts` reads those declarations and fails when a module
here stops exporting something the host declares — so a host that grows an
export cannot leave this double silently behind.
