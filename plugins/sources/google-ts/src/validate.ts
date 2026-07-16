// Serde-parity validation for Google API responses — the TS twin of what
// `#[derive(Deserialize)]` does in plugins/sources/google/src/*.rs.
//
// The Rust connector parses every provider response into a struct, so a body
// that violates the declared shape is a hard error, never a silent `undefined`.
// An unchecked `as` cast gives the opposite: a missing required field flows
// downstream as `undefined` and corrupts state (a cursor without `historyId`,
// an envelope with `remote_id: undefined`). These primitives mirror serde's
// per-field rules so the two connectors accept and reject the same bodies:
//
//   Rust field                     helper          missing        null
//   ─────────────────────────────  ─────────────   ───────────    ──────────
//   `T`                            reqX            throw          throw
//   `Option<T>`                    optX            null           null
//   `#[serde(default)] Vec<T>`     defaultArray    []             throw
//   `#[serde(default)] bool`       defaultBool     false          throw
//   `#[serde(default)] Struct`     defaultObject   {}             throw
//
// Unknown fields are ignored, matching serde's default (no `deny_unknown_fields`
// on any of these structs).
//
// Errors are plain `Error`s, mirroring `GoogleSyncError::Other(serde_err)`:
// `isFatal()` is false, so the CALLER decides the blast radius exactly as the
// Rust does — a bad `messages.get` body skips one message
// (`snapshotEnvelopesFromFetched`), while a bad list/profile/history body
// propagates and fails the whole fetch.

/** Field names are reported as they appear ON THE WIRE (camelCase), which is
 * what serde does under `#[serde(rename_all = "camelCase")]`. */
function missing(ctx: string, field: string): Error {
  return new Error(`${ctx}: missing field \`${field}\``);
}

function badType(ctx: string, field: string, expected: string): Error {
  return new Error(`${ctx}: invalid type for \`${field}\`, expected ${expected}`);
}

/** The response body itself must be a JSON object (serde struct root). */
export function asObject(v: unknown, ctx: string): Record<string, unknown> {
  if (v === null || typeof v !== "object" || Array.isArray(v)) {
    throw new Error(`${ctx}: invalid type, expected an object`);
  }
  return v as Record<string, unknown>;
}

/** `T = String` — required. */
export function reqString(
  o: Record<string, unknown>,
  field: string,
  ctx: string,
): string {
  const v = o[field];
  if (typeof v === "string") return v;
  if (v === undefined || v === null) throw missing(ctx, field);
  throw badType(ctx, field, "a string");
}

/** `Option<String>` — missing/null tolerated. */
export function optString(
  o: Record<string, unknown>,
  field: string,
  ctx: string,
): string | null {
  const v = o[field];
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") throw badType(ctx, field, "a string");
  return v;
}

/** `Option<u64>` — missing/null tolerated. */
export function optNumber(
  o: Record<string, unknown>,
  field: string,
  ctx: string,
): number | null {
  const v = o[field];
  if (v === undefined || v === null) return null;
  if (typeof v !== "number") throw badType(ctx, field, "a number");
  return v;
}

/** `Option<bool>` — missing/null tolerated. */
export function optBool(
  o: Record<string, unknown>,
  field: string,
  ctx: string,
): boolean | null {
  const v = o[field];
  if (v === undefined || v === null) return null;
  if (typeof v !== "boolean") throw badType(ctx, field, "a boolean");
  return v;
}

/** `#[serde(default)] bool` — missing → false; null is still a type error. */
export function defaultBool(
  o: Record<string, unknown>,
  field: string,
  ctx: string,
): boolean {
  const v = o[field];
  if (v === undefined) return false;
  if (typeof v !== "boolean") throw badType(ctx, field, "a boolean");
  return v;
}

/** `Option<Struct>` — missing/null tolerated. */
export function optObject(
  o: Record<string, unknown>,
  field: string,
  ctx: string,
): Record<string, unknown> | null {
  const v = o[field];
  if (v === undefined || v === null) return null;
  if (typeof v !== "object" || Array.isArray(v)) {
    throw badType(ctx, field, "an object");
  }
  return v as Record<string, unknown>;
}

/** `Struct` — required (e.g. `HistoryMessageEvent.message`). */
export function reqObject(
  o: Record<string, unknown>,
  field: string,
  ctx: string,
): Record<string, unknown> {
  const v = o[field];
  if (v === undefined || v === null) throw missing(ctx, field);
  if (typeof v !== "object" || Array.isArray(v)) {
    throw badType(ctx, field, "an object");
  }
  return v as Record<string, unknown>;
}

/** `#[serde(default)] Struct` — missing → an empty object the caller reads
 * defaults out of (serde's `Default::default()`); null is a type error. */
export function defaultObject(
  o: Record<string, unknown>,
  field: string,
  ctx: string,
): Record<string, unknown> {
  const v = o[field];
  if (v === undefined) return {};
  if (v === null || typeof v !== "object" || Array.isArray(v)) {
    throw badType(ctx, field, "an object");
  }
  return v as Record<string, unknown>;
}

/** `Option<Vec<T>>` — missing/null → null; each element must be an object. */
export function optObjectArray(
  o: Record<string, unknown>,
  field: string,
  ctx: string,
): Record<string, unknown>[] | null {
  const v = o[field];
  if (v === undefined || v === null) return null;
  return objectArray(v, field, ctx);
}

/** `#[serde(default)] Vec<T>` — missing → []; null → type error (serde cannot
 * deserialize a sequence from null, and `default` only covers ABSENCE). */
export function defaultObjectArray(
  o: Record<string, unknown>,
  field: string,
  ctx: string,
): Record<string, unknown>[] {
  const v = o[field];
  if (v === undefined) return [];
  return objectArray(v, field, ctx);
}

/** `#[serde(default)] Vec<String>` — missing → []; null/non-strings → error. */
export function defaultStringArray(
  o: Record<string, unknown>,
  field: string,
  ctx: string,
): string[] {
  const v = o[field];
  if (v === undefined) return [];
  if (!Array.isArray(v)) throw badType(ctx, field, "a sequence");
  return v.map((item, i) => {
    if (typeof item !== "string") badTypeThrow(ctx, field, i, "a string");
    return item as string;
  });
}

/** `Option<Vec<String>>` — missing/null → null. */
export function optStringArray(
  o: Record<string, unknown>,
  field: string,
  ctx: string,
): string[] | null {
  const v = o[field];
  if (v === undefined || v === null) return null;
  return defaultStringArray(o, field, ctx);
}

function badTypeThrow(
  ctx: string,
  field: string,
  index: number,
  expected: string,
): never {
  throw new Error(
    `${ctx}: invalid type for \`${field}[${index}]\`, expected ${expected}`,
  );
}

function objectArray(
  v: unknown,
  field: string,
  ctx: string,
): Record<string, unknown>[] {
  if (!Array.isArray(v)) throw badType(ctx, field, "a sequence");
  return v.map((item, i) => {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      badTypeThrow(ctx, field, i, "an object");
    }
    return item as Record<string, unknown>;
  });
}
