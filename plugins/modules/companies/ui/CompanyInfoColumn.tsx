/**
 * Company-detail rail — Google-Contacts-style column for a company.
 * Surfaces single-instance fields from the `companies.company.details`
 * facet (industry / size / location / founded / stage / headcount /
 * funding_total / website) plus multi-instance facets (email / phone /
 * external_link) as icon + value + label rows.
 *
 * Reads from the `facets` array passed by `BaseModuleComponent`; no
 * extra fetch. Empty fields are hidden.
 */
import type { JSX } from "react";

import { Icon, Stack, Text } from "@magnis/host/ui";
import type { FacetSummary } from "@magnis/host/base";

export interface CompanyInfoColumnProps {
  readonly facets: readonly FacetSummary[];
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

/** True iff `CompanyInfoColumn` would render any row for these facets.
 *  Parents use this to decide whether to reserve a grid column at all
 *  — an empty column track still consumes space, so a company with
 *  zero enrichment should let the description fill the row. */
// eslint-disable-next-line react-refresh/only-export-components
export function hasCompanyInfo(facets: readonly FacetSummary[]): boolean {
  return buildRows(facets).length > 0;
}

export function CompanyInfoColumn({ facets }: CompanyInfoColumnProps): JSX.Element | null {
  const rows = buildRows(facets);
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

function buildRows(facets: readonly FacetSummary[]): InfoRow[] {
  const rows: InfoRow[] = [];

  // Pull the latest details facet (single-aligned schema — last wins).
  const detailsList = facets.filter((f) => f.schema_id === "companies.company.details");
  const lastDetails = detailsList.at(-1);
  const details = lastDetails ? lastDetails.data : {};

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

  for (const f of facets) {
    if (f.schema_id === "companies.company.email") {
      const email = stringField(f.data, "email");
      if (email) {
        rows.push({
          iconName: "mail",
          value: email,
          label: emailLabel(f),
          href: `mailto:${email}`,
        });
      }
    }
  }
  for (const f of facets) {
    if (f.schema_id === "companies.company.phone") {
      const phone = stringField(f.data, "phone");
      if (phone) {
        rows.push({
          iconName: "phone",
          value: phone,
          label: phoneLabel(f),
          href: `tel:${phone}`,
        });
      }
    }
  }
  for (const f of facets) {
    if (f.schema_id === "companies.company.external_link") {
      const url = stringField(f.data, "external_url");
      const name = stringField(f.data, "external_name") ?? stringField(f.data, "external_id");
      const sourceType = stringField(f.data, "source_type");
      if (name) {
        rows.push({
          iconName: sourceType === "slack" ? "slack" : "link",
          value: name,
          label: sourceType ? capitalize(sourceType) : undefined,
          href: url ?? undefined,
        });
      }
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

function emailLabel(facet: FacetSummary): string | undefined {
  const type = stringField(facet.data, "type");
  if (type) return capitalize(type);
  return undefined;
}

function phoneLabel(facet: FacetSummary): string | undefined {
  const type = stringField(facet.data, "type");
  if (type) return capitalize(type);
  return undefined;
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
