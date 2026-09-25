import { useContext, type JSX } from "react";
import type { EntityRendererProps } from "@magnis/host/runtime";
import { BaseEntityCard, ActionPrefix } from "@magnis/host/base";
import { ExpansionContext } from "@magnis/host/agent";

/**
 * SINGLE canonical company card. Per `docs/frontend/module-standard.md`
 * ("ONE COMPONENT PER ENTITY"): reads `expanded` from `ExpansionContext`
 * and switches between compact (name + subtitle) and expanded (full
 * description + meta rows) from the same payload.
 */

function str(data: Readonly<Record<string, unknown>>, key: string): string | undefined {
  const v = data[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** Chevron shows when the attachment carries any of the expandable fields. */
export function companyHasMore(data: Readonly<Record<string, unknown>>): boolean {
  return (
    str(data, "description") !== undefined ||
    str(data, "location") !== undefined ||
    str(data, "size") !== undefined ||
    str(data, "founded") !== undefined ||
    // Surface these only as expanded rows when they aren't already in the subtitle.
    (str(data, "industry") !== undefined && str(data, "domain") !== undefined)
  );
}

function Row({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex gap-2 text-[11px]">
      <span className="w-20 shrink-0 text-content-tertiary">{label}</span>
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-content">{value}</span>
    </div>
  );
}

export function CompanyCard(props: EntityRendererProps): JSX.Element {
  const { data, action } = props;
  const name = str(data, "name") ?? "Company";
  const subtitle = str(data, "industry") ?? str(data, "domain") ?? str(data, "website");
  const { expanded } = useContext(ExpansionContext);

  const description = str(data, "description");
  const industry = str(data, "industry");
  const domain = str(data, "domain") ?? str(data, "website");
  const location = str(data, "location");
  const size = str(data, "size");
  const founded = str(data, "founded");

  const rows: { label: string; value: string }[] = [];
  if (description) rows.push({ label: "About", value: description });
  if (industry) rows.push({ label: "Industry", value: industry });
  if (domain) rows.push({ label: "Domain", value: domain });
  if (location) rows.push({ label: "Location", value: location });
  if (size) rows.push({ label: "Size", value: size });
  if (founded) rows.push({ label: "Founded", value: founded });

  return (
    <BaseEntityCard {...props}>
      <div className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-medium text-content">
          <ActionPrefix action={action} />
          {name}
        </span>
        {!expanded && subtitle && (
          <span className="block truncate text-[11px] text-content-tertiary">{subtitle}</span>
        )}
        {expanded && rows.length > 0 && (
          <div className="mt-1 flex flex-col gap-1">
            {rows.map((r) => (
              <Row key={r.label} label={r.label} value={r.value} />
            ))}
          </div>
        )}
      </div>
    </BaseEntityCard>
  );
}
