// Notes plugin — pure helpers (no graph/host access). Ports the native
// `backend/src/modules/notes` preview + template logic to TS.

const PREVIEW_MAX_CHARS = 80;

/// Hyphenated 8-4-4-4-12 hex (matches crypto.randomUUID + the Rust uuid parser's
/// hyphenated form). Native `notes.create` rejected a non-UUID client_id with a
/// 400 before touching the graph (controller.rs:154-158).
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/// True when `id` is a hyphenated UUID accepted as a note `client_id`.
export function isValidUuid(id: string): boolean {
  return UUID_RE.test(id);
}

/// Resolve the single markdown body from the two accepted wire names.
///
/// MCP clients send `content`; the UI and the graph facet use `body`. They name
/// the SAME field, so exactly one must be present — supplying both is
/// ambiguous (which wins?) and supplying neither is the call that used to
/// produce a note with an empty body. Both are rejected before any write.
// @tested-by: tst_module_notes_write_001
export function resolveBody(params: { body?: string; content?: string }): string {
  const hasBody = params.body !== undefined;
  const hasContent = params.content !== undefined;
  if (hasBody && hasContent) {
    throw new Error("notes.create: supply the markdown under `body` OR `content`, not both");
  }
  if (hasBody) return params.body as string;
  if (hasContent) return params.content as string;
  throw new Error("notes.create: missing required param — `body` or `content`");
}

/// The lenient counterpart of `resolveBody`, for RENDERING a pending
/// `notes.create`/`notes.update` tool call whose arguments have not been
/// validated yet. Lives beside the tool schema on purpose: the card and the
/// schema must agree on which wire names carry the body, and keeping the list
/// in the renderer is how the card came to show an empty note for a `content`
/// call. `text` is the legacy name, kept last.
// @tested-by: tst_module_notes_write_003
export function bodyFromToolArgs(args: Record<string, unknown>): string {
  for (const key of ["body", "content", "text"] as const) {
    const value = args[key];
    if (typeof value === "string") return value;
  }
  return "";
}

/// Truncate to `maxChars` codepoints (NOT bytes — Cyrillic/emoji safe),
/// appending `suffix` only when truncation actually happened.
function truncateChars(value: string, maxChars: number, suffix: string): string {
  const chars = Array.from(value);
  if (chars.length > maxChars) {
    return chars.slice(0, maxChars).join("") + suffix;
  }
  return value;
}

/// First non-heading, non-empty body line, truncated to <=80 chars on a char
/// boundary with an ellipsis. Mirrors native `preview_from_note_body`.
export function previewFromBody(body: string): string | null {
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (line.length > 0 && !line.startsWith("#")) {
      return truncateChars(line, PREVIEW_MAX_CHARS, "…");
    }
  }
  return null;
}

/// Render one of the four hardcoded note templates (native
/// controller.rs `render_template`). `project_name` (from `variables`)
/// prefixes a "Project:" line; an unknown template throws.
export function renderTemplate(
  template: string,
  title: string,
  variables?: Record<string, unknown>,
): string {
  const projectName =
    typeof variables?.project_name === "string" ? (variables.project_name) : "";
  const projectRef = projectName ? `Project: ${projectName}\n\n` : "";

  switch (template) {
    case "outreach_tracker":
      return (
        `# ${title}\n\n` +
        projectRef +
        "| Contact | Status | Last Action | Next Step | Notes |\n" +
        "|---------|--------|-------------|-----------|-------|\n" +
        "|         |        |             |           |       |\n"
      );
    case "comparison_table":
      return (
        `# ${title}\n\n` +
        projectRef +
        "| Option | Pros | Cons | Score | Notes |\n" +
        "|--------|------|------|-------|-------|\n" +
        "|        |      |      |       |       |\n"
      );
    case "meeting_prep":
      return (
        `# ${title}\n\n` +
        projectRef +
        "## Attendees\n\n- \n\n" +
        "## Agenda\n\n1. \n\n" +
        "## Key Questions\n\n- \n\n" +
        "## Background\n\n\n\n" +
        "## Action Items\n\n- [ ] \n"
      );
    case "follow_up_plan":
      return (
        `# ${title}\n\n` +
        projectRef +
        "## Objective\n\n\n\n" +
        "## Contacts\n\n- \n\n" +
        "## Timeline\n\n\n\n" +
        "## Status\n\n\n\n" +
        "## Notes\n\n\n"
      );
    default:
      throw new Error(`unknown template: ${template}`);
  }
}
