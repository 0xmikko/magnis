/**
 * Contact-detail rail — Google-Contacts-style column showing all
 * communication channels for the contact: emails, phones, birthday,
 * external links (telegram, linkedin, github, x). Each row is an
 * icon + value + label triplet rendered with consistent spacing.
 *
 * Everything is read off the detail DTO the contacts module composes: the
 * `emails` the hub reaches over `identity`, the `phones` (curated ∪ replica)
 * and the REPLICA dictionaries themselves — one node per source, each holding
 * that source's view of the person. No extra RPC fetch and no canonical
 * dependency, so rows render as soon as the detail lands.
 */
import type { JSX } from "react";

import { EmptyState, Icon, Stack, Text } from "@magnis/host/ui";

/** One source-node dictionary the hub reaches over `identity`. */
export interface ContactReplica {
  readonly id: string;
  readonly schema_id: string;
  readonly name: string | null;
  readonly properties: Readonly<Record<string, unknown>>;
}

export interface ContactInfoColumnProps {
  /** S3 (§5.1): the composed card sections — emails from identity edges,
   * phones = curated ∪ replicas (labeled by origin). */
  readonly emails?: readonly { id: string; address: string }[];
  readonly phones?: readonly { phone: string; type?: string | null; origin: string }[];
  /** The source nodes themselves: telegram handle, external links, birthday. */
  readonly replicas?: readonly ContactReplica[];
}

interface InfoRow {
  readonly iconName: "mail" | "phone" | "gift" | "link" | "slack" | "send";
  readonly value: string;
  readonly label?: string;
  readonly href?: string;
}

const CARD_CLASS = "rounded-2xl bg-surface-secondary/50 px-5 py-4";

export function ContactInfoColumn({
  emails,
  phones,
  replicas,
}: ContactInfoColumnProps): JSX.Element {
  const rows = buildRows(emails, phones, replicas);
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
  emails?: readonly { id: string; address: string }[],
  phones?: readonly { phone: string; type?: string | null; origin: string }[],
  replicas?: readonly ContactReplica[],
): InfoRow[] {
  const rows: InfoRow[] = [];
  // Stable iteration order: emails → phones → telegram → external links →
  // birthday.
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
  // Telegram identity. The handle goes BEFORE an external link so
  // "@handle · Telegram" beats a Google-imported link at the same t.me URL.
  for (const r of replicas ?? []) {
    if (!r.schema_id.startsWith("telegram.")) continue;
    const username = dictString(r.properties, "username");
    if (username) {
      rows.push({
        iconName: "send",
        value: `@${username}`,
        label: "Telegram",
        href: `https://t.me/${username}`,
      });
    }
  }
  for (const r of replicas ?? []) {
    const url = dictString(r.properties, "external_url");
    if (!url) continue;
    const platform = dictString(r.properties, "platform") ?? sourceOf(r.schema_id);
    rows.push({
      iconName: platform === "slack" ? "slack" : "link",
      value: dictString(r.properties, "display_name") ?? r.name ?? url,
      label: platform ? capitalize(platform) : undefined,
      href: url,
    });
  }
  for (const r of replicas ?? []) {
    const birthday = dictString(r.properties, "birthday");
    if (birthday) {
      rows.push({ iconName: "gift", value: formatBirthday(birthday), label: "Birthday" });
      break; // one birthday per contact
    }
  }
  return dedupe(rows);
}

function dictString(dict: Readonly<Record<string, unknown>>, key: string): string | undefined {
  const v = dict[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** The source a replica came from — its schema's first segment. */
function sourceOf(schemaId: string): string | undefined {
  const head = schemaId.split(".")[0];
  return head !== undefined && head.length > 0 ? head : undefined;
}

function capitalize(s: string): string {
  const head = s.slice(0, 1);
  return head.length === 0 ? s : head.toUpperCase() + s.slice(1);
}

/** ISO `YYYY-MM-DD` or Google's `--MM-DD` (no year) → "12 April". */
function formatBirthday(raw: string): string {
  const m = /^(?:(\d{4})|-)?-?(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return raw;
  const month = Number(m[2]);
  const day = Number(m[3]);
  const MONTHS = [
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
  const name = MONTHS[month - 1];
  return name === undefined ? raw : `${String(day)} ${name}`;
}

function dedupe(rows: readonly InfoRow[]): InfoRow[] {
  const seen = new Set<string>();
  const out: InfoRow[] = [];
  for (const row of rows) {
    // Two rows that resolve to the SAME target are one fact wearing two
    // labels (a telegram handle and a Google-imported t.me link; a typed
    // phone and the same number off a replica). Key on the href so they
    // collapse; fall back to icon+value for label-only rows.
    const key = row.href ?? `${row.iconName}:${row.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}
