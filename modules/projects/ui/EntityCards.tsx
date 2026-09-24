import { useContext, type JSX } from "react";
import type { EntityRendererProps } from "@magnis/host/runtime";
import { BaseEntityCard } from "@magnis/host/base";
import { ActionPrefix } from "@magnis/host/base";
import { ExpansionContext } from "@magnis/host/agent";

/**
 * SINGLE canonical project card. Per `docs/frontend/module-standard.md`
 * ("ONE COMPONENT PER ENTITY"): the only renderer for `projects.project`.
 * Reads `expanded` from `ExpansionContext` and renders compact (name +
 * preview) or expanded (full description) layout from the same payload.
 */

function descriptionText(data: Readonly<Record<string, unknown>>): string | undefined {
  if (typeof data.description === "string" && data.description.length > 0) return data.description;
  return undefined;
}

/** Chevron shows only when the attachment carries a description. */
export function projectHasMore(data: Readonly<Record<string, unknown>>): boolean {
  return descriptionText(data) !== undefined;
}

export function ProjectCard(props: EntityRendererProps): JSX.Element {
  const { data, action } = props;
  const name = (data.name as string | undefined) ?? "Untitled Project";
  const description = descriptionText(data);
  const preview = description ? description.slice(0, 80).replace(/\n/g, " ") : undefined;
  const { expanded } = useContext(ExpansionContext);

  return (
    <BaseEntityCard {...props}>
      <div className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-medium text-content">
          <ActionPrefix action={action} />
          {name}
        </span>
        {!expanded && preview && (
          <span className="block truncate text-[11px] text-content-tertiary">{preview}</span>
        )}
        {expanded && description && (
          <div className="mt-1 whitespace-pre-wrap break-words text-[11px] text-content">
            {description}
          </div>
        )}
      </div>
    </BaseEntityCard>
  );
}
