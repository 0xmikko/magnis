/**
 * Contact-detail rail — Google-Contacts-style column showing all
 * communication channels for the contact: emails, phones, birthday,
 * external links (telegram, linkedin, github, x). Each row is an
 * icon + value + label triplet rendered with consistent spacing.
 *
 * Reads from the `facets` array passed by `BaseModuleComponent` —
 * no extra RPC fetch, no canonical-property dependency (so phone
 * numbers render immediately on restore, before the search-indexer
 * has populated `person.phones` canonical).
 */
import type { JSX } from "react";

import { Icon, Stack, Text } from "@magnis/host/ui";
import type { FacetSummary } from "@magnis/host/base";

export interface ContactInfoColumnProps {
  readonly facets: readonly FacetSummary[];
}

interface InfoRow {
  readonly iconName: "mail" | "phone" | "gift" | "link" | "slack";
  readonly value: string;
  readonly label?: string;
  readonly href?: string;
}

export function ContactInfoColumn({ facets }: ContactInfoColumnProps): JSX.Element | null {
  const rows = buildRows(facets);
  if (rows.length === 0) return null;
  return (
    <Stack gap={3} className="rounded-2xl bg-surface-secondary/50 px-5 py-4">
      <Text variant="title" className="text-sm font-semibold">
        Contact details
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
  // Stable iteration order: emails → phones → external links → birthday.
  // Within a category the original facet ordering wins so authored
  // primary contact info renders first.
  for (const f of facets) {
    if (f.schema_id === "contacts.person.email") {
      const email = stringField(f, "email");
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
    if (f.schema_id === "contacts.person.phone") {
      const phone = stringField(f, "phone");
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
    if (f.schema_id === "contacts.person.external_link") {
      const url = stringField(f, "external_url");
      const name = stringField(f, "external_name") ?? stringField(f, "external_id");
      const sourceType = stringField(f, "source_type");
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
  for (const f of facets) {
    if (f.schema_id === "contacts.person.profile") {
      const birthday = stringField(f, "birthday");
      if (birthday) {
        rows.push({
          iconName: "gift",
          value: formatBirthday(birthday),
          label: "Birthday",
        });
        break; // one birthday per contact
      }
    }
  }
  return dedupe(rows);
}

function stringField(facet: FacetSummary, key: string): string | undefined {
  const v = (facet.data as Record<string, unknown>)[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function emailLabel(facet: FacetSummary): string | undefined {
  const type = stringField(facet, "type");
  if (type) return capitalize(type);
  return stringField(facet, "is_primary") === "true" ? "Primary" : undefined;
}

function phoneLabel(facet: FacetSummary): string | undefined {
  const type = stringField(facet, "type");
  if (type) return capitalize(type);
  return undefined;
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

function formatBirthday(raw: string): string {
  // Accepts ISO date "1981-06-12" or already-formatted strings. If
  // parseable, render as "12 June 1981"; otherwise pass through.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!m) return raw;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const name = months[month - 1] ?? raw;
  return `${String(day)} ${name} ${String(year)}`;
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
