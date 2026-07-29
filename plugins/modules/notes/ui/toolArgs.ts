// The wire names that carry a note's markdown body — the SINGLE source of
// truth, shared by the tool schema, the write handlers and the approval card.
//
// Lives in `ui/`, not in `module/` and not in the plugin root. `module/` runs
// in a restricted V8 isolate and `ui/` is a browser bundle: the UI bundler
// resolves nothing its entrypoint reaches OUTSIDE `ui/`, so a root file here
// turns `bun run test:scripts` red while `build-plugins.ts` still succeeds on
// its own — green to the eye, broken at the gate. `module/` reaches in the
// other direction through the tsc onLoad hook, which does resolve it.
//
// Keeping ONE list here is the fix for B23: the card and the schema drifted,
// so a `content` call rendered a blank approval card.

/** Names accepted on a WRITE. Mutually exclusive — exactly one. */
export const BODY_WIRE_NAMES = ["body", "content"] as const;

/** Names understood when RENDERING a pending call. Superset of the write
 *  names: `text` is a legacy shape still present in old episodes, readable
 *  but no longer writable. */
export const RENDERABLE_BODY_WIRE_NAMES = ["body", "content", "text"] as const;

/** JSON-schema fragment expressing "exactly one of the write names".
 *  `oneOf`, not `anyOf` — `anyOf` means "at least one" and would declare a
 *  both-present call legal while the handler rejects it. */
export const BODY_ONE_OF = BODY_WIRE_NAMES.map((name) => ({ required: [name] }));

interface BodyArgs {
  body?: string;
  content?: string;
}

/// Resolve the body for `notes.create`: exactly one name, non-blank.
///
/// Both-present is ambiguous (which wins?); neither-present and a blank string
/// both produce the empty note that B1 describes, so all three are rejected
/// before any write. Mirrors the `trim()` guard `triggers.create` applies to
/// its own required prompts.
// @tested-by: tst_module_notes_write_001
export function resolveBody(params: BodyArgs): string {
  const { body, content } = params;
  if (body !== undefined && content !== undefined) {
    throw new Error("notes.create: supply the markdown under `body` OR `content`, not both");
  }
  const value = body ?? content;
  if (value === undefined) {
    throw new Error("notes.create: missing required param — `body` or `content`");
  }
  if (!value.trim()) {
    throw new Error("notes.create: the note body cannot be blank");
  }
  return value;
}

/// Resolve the body for `notes.update`, where it is OPTIONAL — `undefined`
/// means "leave the stored body alone". Accepts the same names as create, so
/// an update card that renders `content` does not then drop it (B23 one verb
/// over).
// @tested-by: tst_module_notes_write_005
export function resolveUpdateBody(params: BodyArgs): string | undefined {
  const { body, content } = params;
  if (body !== undefined && content !== undefined) {
    throw new Error("notes.update: supply the markdown under `body` OR `content`, not both");
  }
  return body ?? content;
}

/// The lenient counterpart, for RENDERING a pending call whose arguments have
/// not been validated yet: first string wins, never throws, empty when absent.
// @tested-by: tst_module_notes_write_003
export function bodyFromToolArgs(args: Record<string, unknown>): string {
  for (const key of RENDERABLE_BODY_WIRE_NAMES) {
    const value = args[key];
    if (typeof value === "string") return value;
  }
  return "";
}
