// Notes plugin — pure helpers (no graph/host access). Ports the native
// `backend/src/modules/notes` preview + template logic to TS.

const PREVIEW_MAX_CHARS = 80;

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
    typeof variables?.["project_name"] === "string" ? (variables["project_name"] as string) : "";
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
