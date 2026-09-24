/**
 * Company-detail rail — Google-Contacts-style column for a company.
 * Surfaces the hub's DICTIONARY (industry / size / location / founded /
 * stage / headcount / funding_total / website) plus its curated phones and
 * the addresses its `identity` edges reach, as icon + value + label rows.
 *
 * S5: the dictionary and the linked entities both come from the detail the
 * parent already fetched — no extra crossing. Empty fields are hidden.
 */
import type { JSX } from "react";

import { Icon, Stack, Text } from "@magnis/host/ui";
import type { LinkedEntitySummary } from "@magnis/host/base";

export interface CompanyInfoColumnProps {
  readonly properties: Readonly<Record<string, unknown>>;
  readonly linkedEntities: readonly LinkedEntitySummary[];
}

interface InfoRow {
  readonly iconName:
    | "globe"
    | "briefcase"
    | "map-pin"
    | "calendar"
    | "users"
    | "scale"
    | "mail"
    | "phone"
    | "link"
    | "slack";
  readonly value: string;
  readonly label?: string;
  readonly href?: string;
}

/** True iff `CompanyInfoColumn` would render any row for these records.
 *  Parents use this to decide whether to reserve a grid column at all
 *  — an empty column track still consumes space, so a company with
 *  zero enrichment should let the description fill the row. */
export function hasCompanyInfo(
  properties: Readonly<Record<string, unknown>>,
  linkedEntities: readonly LinkedEntitySummary[],
): boolean {
  return buildRows(properties, linkedEntities).length > 0;
}

export function CompanyInfoColumn({
  properties,
  linkedEntities,
}: CompanyInfoColumnProps): JSX.Element | null {
  const rows = buildRows(properties, linkedEntities);
  if (rows.length === 0) return null;
  return (
    <Stack gap={3} className="rounded-2xl bg-surface-secondary/50 px-5 py-4">
      <Text variant="title" className="text-sm font-semibold">
        Company details
      </Text>
      <Stack gap={2}>
        {rows.map((r, i) => (
          <InfoRowView key={`${r.iconName}-${r.value}-${String(i)}`} row={r} />
        ))}
      </Stack>
    </Stack>
  );
}

function InfoRowView({ row }: { readonly row: InfoRow }): JSX.Element {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 shrink-0 text-content-tertiary">
        <Icon name={row.iconName} size={16} />
      </div>
      <div className="flex min-w-0 flex-1 items-baseline gap-2">
        {row.href ? (
          <a
            href={row.href}
            target="_blank"
            rel="noreferrer"
            className="truncate text-sm text-accent-primary hover:underline"
          >
            {row.value}
          </a>
        ) : (
          <span className="truncate text-sm text-content-primary">{row.value}</span>
        )}
        {row.label ? (
          <span className="shrink-0 text-xs text-content-tertiary">· {row.label}</span>
        ) : null}
      </div>
    </div>
  );
}

function buildRows(
  details: Readonly<Record<string, unknown>>,
  linkedEntities: readonly LinkedEntitySummary[],
): InfoRow[] {
  const rows: InfoRow[] = [];

  const website = stringField(details, "website") ?? domainAsUrl(details);
  if (website) {
    rows.push({
      iconName: "globe",
      value: stripScheme(website),
      label: "Website",
      href: website,
    });
  }

  const industry = stringField(details, "industry");
  if (industry) rows.push({ iconName: "briefcase", value: industry, label: "Industry" });

  const location = stringField(details, "location");
  if (location) rows.push({ iconName: "map-pin", value: location, label: "HQ" });

  const size = stringField(details, "size");
  const headcount = numericField(details, "headcount");
  if (size) {
    rows.push({ iconName: "users", value: size, label: "Size" });
  } else if (headcount !== undefined) {
    rows.push({ iconName: "users", value: String(headcount), label: "Employees" });
  }

  const founded = stringField(details, "founded");
  if (founded) rows.push({ iconName: "calendar", value: founded, label: "Founded" });

  const stage = stringField(details, "stage");
  if (stage) rows.push({ iconName: "scale", value: stage, label: "Stage" });

  const funding = stringField(details, "funding_total");
  if (funding) rows.push({ iconName: "scale", value: funding, label: "Funding" });

  // An address is an identity CHANNEL the company reaches over an edge, not
  // a field of the company (plan §3).
  for (const linked of linkedEntities) {
    if (linked.schema_id !== "email.address" || linked.link_kind !== "identity") continue;
    if (!linked.name) continue;
    rows.push({
      iconName: "mail",
      value: linked.name,
      label: "Email",
      href: `mailto:${linked.name}`,
    });
  }
  const phones = details.phones;
  if (Array.isArray(phones)) {
    for (const entry of phones) {
      const phone = stringField(entry, "phone");
      if (!phone) continue;
      const type = stringField(entry, "type");
      rows.push({
        iconName: "phone",
        value: phone,
        label: type ? capitalize(type) : undefined,
        href: `tel:${phone}`,
      });
    }
  }

  return dedupe(rows);
}

function stringField(data: unknown, key: string): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const v = (data as Record<string, unknown>)[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function numericField(data: unknown, key: string): number | undefined {
  if (!data || typeof data !== "object") return undefined;
  const v = (data as Record<string, unknown>)[key];
  return typeof v === "number" ? v : undefined;
}

function domainAsUrl(data: unknown): string | undefined {
  const d = stringField(data, "domain");
  return d ? `https://${d}` : undefined;
}

function stripScheme(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

function dedupe(rows: InfoRow[]): InfoRow[] {
  const seen = new Set<string>();
  const out: InfoRow[] = [];
  for (const r of rows) {
    const key = `${r.iconName}:${r.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}
