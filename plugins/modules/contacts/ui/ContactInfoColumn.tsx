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
 *
 * `telegram.contact` is read here alongside the `contacts.person.*`
 * facets on purpose. Telegram is the only module that declares
 * `create = ["contacts.person"]`, and it writes that ONE facet — the
 * person's telegram identity never lands in a `contacts.person.*`
 * facet and never reaches canonical (`telegram.contact` maps only
 * first_name/last_name). Matching `contacts.person.*` alone left every
 * telegram-derived person with zero rows and an unmounted card. The
 * contacts module already reads this facet directly elsewhere
 * (relevance_tier filtering, channel detection), so this is the same
 * layering, not a new coupling.
 */
import type { JSX } from "react";

import { EmptyState, Icon, Stack, Text } from "@magnis/host/ui";
import type { FacetSummary } from "@magnis/host/base";

export interface ContactInfoColumnProps {
  readonly facets: readonly FacetSummary[];
  /** S3 (§5.1): the composed card sections — emails from identity edges,
   * phones = curated ∪ replicas (labeled by origin). When present they are
   * the email/phone rows; the facet archive still feeds telegram /
   * external-link / birthday rows until their stages fold. */
  readonly emails?: readonly { id: string; address: string }[];
  readonly phones?: readonly { phone: string; type?: string | null; origin: string }[];
}

interface InfoRow {
  readonly iconName: "mail" | "phone" | "gift" | "link" | "slack" | "send";
  readonly value: string;
  readonly label?: string;
  readonly href?: string;
}

const CARD_CLASS = "rounded-2xl bg-surface-secondary/50 px-5 py-4";

export function ContactInfoColumn({ facets, emails, phones }: ContactInfoColumnProps): JSX.Element {
  const rows = buildRows(facets, emails, phones);
  if (rows.length === 0) {
    // Never `null` — an unmounted card collapses the left grid track and
    // leaves the Description panel floating in a half-empty Overview.
    return (
      <div className={CARD_CLASS}>
        <EmptyState
          className="!py-6"
          icon={<Icon name="contacts" size={24} />}
          title="No contact details yet"
          subtitle="Emails, phones and links appear here as Magnis learns them."
        />
      </div>
    );
  }
  return (
    <Stack gap={3} className={CARD_CLASS}>
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

function buildRows(
  facets: readonly FacetSummary[],
  emails?: readonly { id: string; address: string }[],
  phones?: readonly { phone: string; type?: string | null; origin: string }[],
): InfoRow[] {
  const rows: InfoRow[] = [];
  // Stable iteration order: emails → phones → external links → birthday.
  // S3: the composed sections are the email/phone rows when present; the
  // facet archive covers pre-fold contacts and the categories whose stages
  // have not folded yet.
  for (const e of emails ?? []) {
    rows.push({ iconName: "mail", value: e.address, href: `mailto:${e.address}` });
  }
  for (const p of phones ?? []) {
    rows.push({
      iconName: "phone",
      value: p.phone,
      label: p.origin === "curated" ? (p.type ?? undefined) : p.origin,
    });
  }
  const composedEmails = (emails?.length ?? 0) > 0;
  const composedPhones = (phones?.length ?? 0) > 0;
  for (const f of facets) {
    if (!composedEmails && f.schema_id === "contacts.person.email") {
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
    if (!composedPhones && f.schema_id === "contacts.person.phone") {
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
  // Telegram identity. Phone goes after the authored `contacts.person.phone`
  // rows so a typed label wins the dedupe; the handle goes BEFORE
  // `external_link` so "@handle · Telegram" beats a Google-imported link
  // pointing at the same t.me URL.
  for (const f of facets) {
    if (f.schema_id === "telegram.contact") {
      const phone = stringField(f, "phone");
      if (phone) {
        rows.push({ iconName: "phone", value: phone, href: `tel:${phone}` });
      }
    }
  }
  for (const f of facets) {
    if (f.schema_id === "telegram.contact") {
      const username = stringField(f, "username");
      if (username) {
        rows.push({
          iconName: "send",
          value: `@${username}`,
          label: "Telegram",
          href: `https://t.me/${username}`,
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
    // Two rows that resolve to the SAME target are one fact wearing two
    // labels (a telegram handle and a Google-imported t.me link; a typed
    // phone and the same number off `telegram.contact`). Key on the href
    // so they collapse; fall back to icon+value for label-only rows.
    const key = r.href ?? `${r.iconName}:${r.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}
