// Pure sync-progress cursor helper — twin of plugins/sources/google/src/progress.rs.
//
// Contract (INV-2 / INV-7 / INV-8):
// - `discovered` is CUMULATIVE: prior `discovered` (read from the incoming
//   cursor) + this page's item count. It never resets mid-bootstrap.
// - `total` is a best-effort estimate resolved as `fresh ?? prior-cursor total`
//   so page 1 supplies it and pages 2+ re-report the SAME value (anti-flicker).
// - A catchup-style call (`total` absent, prior `discovered = N`) carries `N`
//   forward — it never emits `discovered: 0`.

export interface Progress {
  /** Cumulative count of primary items enumerated so far (prior + this page). */
  discovered: number;
  /** Best-effort total estimate, threaded forward (absent → indeterminate). */
  total?: number;
}

function asObj(v: unknown): Record<string, unknown> | undefined {
  return v !== null && typeof v === "object"
    ? (v as Record<string, unknown>)
    : undefined;
}

/** Advance the cumulative progress counters for one fetched page. */
export function progressCursor(
  priorCursor: unknown,
  pageLen: number,
  total?: number,
): Progress {
  const c = asObj(priorCursor);
  const priorDiscovered =
    typeof c?.discovered === "number" ? c.discovered : 0;
  const priorTotal = typeof c?.total === "number" ? c.total : undefined;
  return { discovered: priorDiscovered + pageLen, total: total ?? priorTotal };
}

/** Merge the counters into a cursor object so the next page resumes them.
 * A missing total omits the key (indeterminate source), like the Rust
 * `merge_into`. */
export function mergeProgress(
  cursor: Record<string, unknown>,
  progress: Progress,
): void {
  cursor.discovered = progress.discovered;
  if (progress.total !== undefined) cursor.total = progress.total;
}
