import { useContext, useState, type JSX } from "react";
import type { EntityRendererProps } from "@magnis/host/runtime";
import { BaseEntityCard } from "@magnis/host/base";
import { ActionPrefix } from "@magnis/host/base";
import { ExpansionContext } from "@magnis/host/agent";

/**
 * SINGLE canonical note card. Per `docs/frontend/module-standard.md`
 * ("ONE COMPONENT PER ENTITY"): reads `expanded` from `ExpansionContext`
 * and switches between compact (title + preview) and expanded (full
 * body with a 20-line clamp toggle) from the same payload.
 */

const CLAMP_LINES = 20;

function noteBody(data: Readonly<Record<string, unknown>>): string | undefined {
  if (typeof data.body !== "string" || data.body.length === 0) return undefined;
  const title =
    typeof data.title === "string"
      ? data.title
      : typeof data.name === "string"
        ? data.name
        : "";
  return stripDuplicatedTitleHeading(data.body, title);
}

/**
 * Strip leading `# <title>` heading from the note body when it merely
 * repeats the title already shown above (panel header or card title
 * row). Mirrors the rule in `NoteDetail.tsx` — the title is metadata,
 * not body content, and shouldn't be rendered twice.
 */
function stripDuplicatedTitleHeading(body: string, title: string): string {
  const trimmedTitle = title.trim();
  if (trimmedTitle.length === 0) return body;
  const escaped = trimmedTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^\\s*#\\s+${escaped}\\s*\\n+`, "i");
  return body.replace(pattern, "");
}

/** Chevron shows only when the note has a body payload to reveal. */
export function noteHasMore(data: Readonly<Record<string, unknown>>): boolean {
  return noteBody(data) !== undefined;
}

export function NoteCard(props: EntityRendererProps): JSX.Element {
  const { data, action } = props;
  const title = (data.title as string | undefined) ?? (data.name as string | undefined);
  const body = noteBody(data);
  const preview = body ? body.slice(0, 80).replace(/\n/g, " ") : undefined;
  const { expanded } = useContext(ExpansionContext);
  const [showAll, setShowAll] = useState(false);

  const lines = body?.split("\n") ?? [];
  const clamped = body !== undefined && lines.length > CLAMP_LINES && !showAll;
  const visible = body === undefined
    ? undefined
    : clamped
      ? lines.slice(0, CLAMP_LINES).join("\n")
      : body;

  return (
    <BaseEntityCard {...props}>
      <div className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-medium text-content">
          <ActionPrefix action={action} />
          {title ?? "Untitled note"}
        </span>
        {!expanded && preview && (
          <span className="block truncate text-[11px] text-content-tertiary">{preview}</span>
        )}
        {expanded && visible !== undefined && (
          <div className="mt-1">
            <div className="whitespace-pre-wrap break-words text-[11px] text-content">
              {visible}
              {clamped && "…"}
            </div>
            {lines.length > CLAMP_LINES && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setShowAll((v) => !v);
                }}
                className="mt-1 text-[11px] text-content-tertiary hover:text-content"
              >
                {showAll ? "Show less" : `Show all ${String(lines.length)} lines`}
              </button>
            )}
          </div>
        )}
      </div>
    </BaseEntityCard>
  );
}
