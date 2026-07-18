// StateMock — the ONE programmable mock connector (accounts-sync-status plan
// §11.1). Tests drive it into ANY contract-expressible outcome.
//
// TS port of the `magnis-mock-statemachine` Rust binary. Where the Rust twin
// was ONE binary spawned by three archetype manifests, this is ONE package
// (`@magnis/source-statemachine`) imported by the three archetype packages'
// `src/main.ts` — bun has no shared-binary equivalent, and a relative
// `../_statemachine/...` spawn path would escape the archetype's own extension
// dir. The CLI contract is unchanged: --surfaces, --mode, --state-dir.
//
// MockStep (mirrors the plan verbatim):
//   { "op": "fetch_ok", "envelopes": N, "next_cursor": {...}|null,
//     "total": N|null, "total_exact": bool }
//   { "op": "fetch_ok_no_cursor" }                 — contract violation: has_more, no cursor
//   { "op": "fetch_error", "error": { "kind": "auth"|"rate_limited"|"network"|..., ... } }
//   { "op": "fetch_hang", "ms": N }                — heartbeat stall
//   { "op": "probe_ok", "subject": "..." }         — ProbeAuth success (S2)
//   { "op": "probe_reject", "message": "..." }     — ProbeAuth 401 (S2)
// An EMPTY queue answers a clean empty fetch (envelopes: [], hasMore: false).

import {
  ConnectorError,
  runConnector,
  type Envelope,
  type FetchArgs,
  type FetchResult,
} from "@magnis/connector-sdk";
import { logCall, mode, nextStep, surfaces } from "./state";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function uint(v: unknown): number | undefined {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : undefined;
}

/** Execute the next programmed step for `surface` (or a clean empty fetch). */
export async function fetchStateMock(args: FetchArgs): Promise<FetchResult> {
  const surface = typeof args.surface === "string" && args.surface ? args.surface : "mock";
  // Rust logs the cursor as JSON null when the host sent none.
  logCall({ surface, tool: "magnis.sync.fetch", cursor: args.cursor ?? null });

  const step = nextStep(surface);
  // No programmed step (or a non-string op) ⇒ a clean empty fetch. Guarding here
  // narrows `step` to defined for every real op below.
  if (!step) return { envelopes: [], nextCursor: null, hasMore: false };
  const op = str(step.op) ?? "";
  switch (op) {
    case "":
      return { envelopes: [], nextCursor: null, hasMore: false };

    case "fetch_ok": {
      const n = uint(step.envelopes) ?? 0;
      const envelopes: Envelope[] = Array.from({ length: n }, (_, i) => ({
        surface,
        payload: { n: i },
        remote_id: `sm-${surface}-${String(i)}`,
        kind: "snapshot",
      }));
      const nextCursor = step.next_cursor ?? null;
      const out: Record<string, unknown> = {
        envelopes,
        nextCursor,
        hasMore: nextCursor !== null,
      };
      // `total` / `total_exact` are emitted ONLY when programmed non-null.
      if (step.total !== undefined && step.total !== null) out.total = step.total;
      if (step.total_exact !== undefined && step.total_exact !== null) {
        out.total_exact = step.total_exact;
      }
      return out as unknown as FetchResult;
    }

    // Contract violation on purpose: hasMore with no cursor to advance on.
    case "fetch_ok_no_cursor":
      return { envelopes: [], nextCursor: null, hasMore: true };

    case "fetch_hang":
      await sleep(uint(step.ms) ?? 1000);
      return { envelopes: [], nextCursor: null, hasMore: false };

    case "fetch_error": {
      // Typed error surface: mirrored to the MCP error data contract.
      const err = (step.error ?? { kind: "internal" }) as Record<string, unknown>;
      throw new ConnectorError(str(err.message) ?? "programmed error", err);
    }

    default:
      throw new ConnectorError(`unprogrammed op ${op}`, {
        kind: "contract",
        message: `unprogrammed op ${op}`,
      });
  }
}

/** ProbeAuth: a programmed `probe_reject` fails the probe; anything else (incl.
 * an empty queue) answers the default identity, keeping zero-config archetypes
 * usable. */
export function probeStateMock(): Promise<{ subject: string }> {
  logCall({ surface: "__auth__", tool: "magnis.auth.probe" });
  const step = nextStep("__auth__");
  if (str(step?.op) === "probe_reject") {
    // The SDK maps a probe rejection to `-32000 { data: { kind: "auth", message } }`
    // — byte-identical to the Rust reject reply.
    return Promise.reject(new Error(str(step?.message) ?? "rejected"));
  }
  return Promise.resolve({ subject: str(step?.subject) ?? "statemock" });
}

/** Run one StateMock archetype. Shape comes from the CLI (--surfaces/--mode),
 * exactly as the three archetype manifests pass it. */
export async function runStateMock(): Promise<void> {
  await runConnector({
    name: "magnis-mock-statemachine",
    version: "0.1.0",
    surfaces: surfaces(),
    mode: mode(),
    intervalSecs: 300,
    fetch: fetchStateMock,
    probeAuth: probeStateMock,
  });
}
