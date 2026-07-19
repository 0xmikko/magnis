// ═══════════════════════════ LIFECYCLE CONTRACT ═══════════════════════════
//
// Idiom: a lifecycle is a set of hooks (+ migration steps). You pass hooks to
// `defineLifecycle` and each migration ladder step to `defineMigration`.
// (Contrast: a module is a decorator-declared class + config; a source is a
// plain config object.)
//
// What a lifecycle is: implement `LifecycleHooks.install(ctx)` (and declare
// migrations) to run install/upgrade logic in the transient lifecycle isolate;
// the host validates against the manifest and writes the row only after the
// hook succeeds; hooks MUST be idempotent.
//
// This file is PURE TYPES — zero runtime. `defineLifecycle` and
// `defineMigration` live in `../index.ts` and import their types from here.
// Every name below is re-exported from `@magnis/plugin-sdk`, so this move
// changes no consumer.

// ── Lifecycle hooks (extensions-lifecycle Stage 4, spec docs/plugins/lifecycle.md §4.1)

/** The install context handed to a package's lifecycle install hook. The hook
 * DECLARES its installation actions; the host validates them against the
 * manifest and performs the DB writes — the `installed_extensions` row is
 * written ONLY after the hook succeeds. Hooks MUST be idempotent. */
export interface InstallContext {
  /** Register exactly the schemas this package's manifest declares — the
   * default for every first-party package. */
  registerManifestSchemas(): void;
  /** Register an explicit subset (validated ⊆ manifest by the host). */
  register(registrations: { entities?: string[]; facets?: string[] }): void;
}

export interface LifecycleHooks {
  install(ctx: InstallContext): void;
}

/** One data-migration ladder step (spec §4.2), consumed by `defineMigration`.
 * The host runs it in the transient migrate isolate; on success it bumps
 * `installed_extensions.version` to the step target in its own transaction — a
 * crash resumes from the last committed step. The step MUST be idempotent: a
 * crash between step success and the version bump re-runs it on the next
 * reconcile (idempotency is the recovery mechanism, as with install). */
export type MigrationStep = () => void;
