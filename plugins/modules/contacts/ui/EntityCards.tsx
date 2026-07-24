import { useContext, type JSX } from "react";
import type { EntityRendererProps } from "@magnis/host/runtime";
import { BaseEntityCard } from "@magnis/host/base";
import { ActionPrefix } from "@magnis/host/base";
import { ExpansionContext } from "@magnis/host/agent";

/**
 * SINGLE canonical contact card. Per `docs/frontend/module-standard.md`
 * ("ONE COMPONENT PER ENTITY"): reads `expanded` from `ExpansionContext`
 * and switches between compact (name + subtitle) and expanded (bio,
 * location, telegram, emails, phones, aliases, links) from the same
 * payload. No facet fetch — the agent includes the relevant contact
 * fields alongside the entity id at attachment time.
 */

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.length > 0);
}

/**
 * Display name for a contact. Falls back to a capitalized email local-part
 * when the graph has no person name attached — common for contacts that
 * the system extracted from email senders/recipients without ever seeing
 * the human name. Last resort is "Unknown" (no email either).
 */
function contactDisplayName(data: Readonly<Record<string, unknown>>): string {
  if (typeof data.name === "string" && data.name.length > 0) return data.name;
  const email = typeof data.email === "string" ? data.email : undefined;
  if (email) {
    const at = email.indexOf("@");
    const local = at > 0 ? email.slice(0, at) : email;
    if (local.length > 0) return local.charAt(0).toUpperCase() + local.slice(1);
  }
  return "Unknown";
}

function emailList(data: Readonly<Record<string, unknown>>): string[] {
  const single = typeof data.email === "string" && data.email.length > 0 ? [data.email] : [];
  return Array.from(new Set([...single, ...toStringList(data.emails)]));
}

function phoneList(data: Readonly<Record<string, unknown>>): string[] {
  const single = typeof data.phone === "string" && data.phone.length > 0 ? [data.phone] : [];
  return Array.from(new Set([...single, ...toStringList(data.phones)]));
}

/**
 * True when the attachment carries more contact info than the 2-line
 * collapsed row can display. Drives the ExpandableEntityCard chevron.
 */
export function contactHasMore(data: Readonly<Record<string, unknown>>): boolean {
  const bio = typeof data.bio === "string" && data.bio.length > 0;
  const location = typeof data.location === "string" && data.location.length > 0;
  const telegram = typeof data.telegram === "string" && data.telegram.length > 0;
  const aliases = toStringList(data.aliases).length > 0;
  const links = toStringList(data.links).length > 0;
  const emails = emailList(data).length;
  const phones = phoneList(data).length;
  return (
    bio ||
    location ||
    telegram ||
    aliases ||
    links ||
    emails > 1 ||
    phones > 1 ||
    (emails > 0 && phones > 0)
  );
}

function Row({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex gap-2 text-[11px]">
      <span className="w-16 shrink-0 text-content-tertiary">{label}</span>
      <span className="min-w-0 flex-1 break-words text-content">{value}</span>
    </div>
  );
}

export function ContactCard(props: EntityRendererProps): JSX.Element {
  const { data, action } = props;
  const name = contactDisplayName(data);
  const email = data.email as string | undefined;
  const phone = data.phone as string | undefined;
  const role = data.role as string | undefined;
  const company = data.company as string | undefined;
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- intentional falsy fallback: an empty role·company subtitle must fall through to email/phone (?? would keep "").
  const subtitle = [role, company].filter(Boolean).join(" · ") || email || phone || "";
  const { expanded } = useContext(ExpansionContext);

  const bio = typeof data.bio === "string" && data.bio.length > 0 ? data.bio : undefined;
  const location =
    typeof data.location === "string" && data.location.length > 0 ? data.location : undefined;
  const telegram =
    typeof data.telegram === "string" && data.telegram.length > 0 ? data.telegram : undefined;
  const aliases = toStringList(data.aliases);
  const links = toStringList(data.links);
  const emails = emailList(data);
  const phones = phoneList(data);

  const rows: { label: string; value: string }[] = [];
  if (bio) rows.push({ label: "Bio", value: bio });
  if (location) rows.push({ label: "Location", value: location });
  if (telegram) rows.push({ label: "Telegram", value: telegram });
  if (emails.length > 0) rows.push({ label: "Emails", value: emails.join(", ") });
  if (phones.length > 0) rows.push({ label: "Phones", value: phones.join(", ") });
  if (aliases.length > 0) rows.push({ label: "Aliases", value: aliases.join(", ") });
  if (links.length > 0) rows.push({ label: "Links", value: links.join(", ") });

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
