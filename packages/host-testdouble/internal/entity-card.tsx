/** The pieces `@magnis/host/base`, `/agent` and `/runtime` all need.
 *
 * The host's own dependency graph is a cycle in miniature: `EntityCardRenderer`
 * falls back to `BaseEntityCard`, `BaseEntityCard` reads `ExpansionContext`,
 * and `ExpandableEntityCard` provides that context around the renderer. In the
 * host those live in one bundle and the cycle is invisible. Here each shim is
 * its own module, so the shared bottom of the graph is factored out to this
 * file: the schema-visual registry, the entity href rules, the expansion
 * context, and the base card. Nothing here imports a shim.
 */
import { createContext, createElement, useContext, type JSX, type ReactNode } from "react";

import { Icon } from "../ui";

/* ── Expansion context ──────────────────────────────────────── */

export interface ExpansionContextValue {
  readonly bare: boolean;
  readonly expanded: boolean;
}

export const ExpansionContext = createContext<ExpansionContextValue>({
  bare: false,
  expanded: false,
});

/* ── Schema visual registry ─────────────────────────────────── */

export interface SchemaEntry {
  readonly icon: string;
  readonly label: string;
  readonly tabLabel?: string;
  readonly themeColor?: string;
}

const registry = new Map<string, SchemaEntry>();

export function registerSchemaVisuals(
  entries: readonly { schemaId: string; entry: SchemaEntry }[],
): void {
  for (const { schemaId, entry } of entries) {
    registry.set(schemaId, entry);
  }
}

const FALLBACK: SchemaEntry = { icon: "file", label: "Entity", tabLabel: "Entities" };

export function schemaIcon(schemaId: string): string {
  return (registry.get(schemaId) ?? FALLBACK).icon;
}

export function schemaLabel(schemaId: string): string {
  return (registry.get(schemaId) ?? FALLBACK).label;
}

export function schemaTabLabel(schemaId: string): string {
  const entry = registry.get(schemaId) ?? FALLBACK;
  return entry.tabLabel ?? entry.label + "s";
}

export function schemaVisual(schemaId: string): SchemaEntry & { readonly moduleId: string } {
  const entry = registry.get(schemaId) ?? FALLBACK;
  const dotIdx = schemaId.indexOf(".");
  return { ...entry, moduleId: dotIdx >= 0 ? schemaId.slice(0, dotIdx) : schemaId };
}

export function allSchemaEntries(): readonly {
  readonly icon: string;
  readonly label: string;
  readonly schemaId: string;
}[] {
  return Array.from(registry.entries()).map(([schemaId, entry]) => ({
    icon: entry.icon,
    label: entry.tabLabel ?? entry.label + "s",
    schemaId,
  }));
}

/* ── Entity href ────────────────────────────────────────────── */

const LEGACY_SCHEMA_MAP: Readonly<Record<string, string>> = {
  person: "contacts.person",
  email_message: "email.message",
  email_address: "email.address",
  telegram_message: "telegram.message",
  telegram_chat: "telegram.chat",
  calendar_event: "meetings.calendar_event",
  file_object: "file.object",
};

export function normalizeSchemaId(schemaId: string): string {
  return LEGACY_SCHEMA_MAP[schemaId] ?? schemaId;
}

export function entityHref(schemaId: string, entityId: string | null | undefined): string | null {
  if (!schemaId || !entityId) return null;
  const normalized = normalizeSchemaId(schemaId);
  if (!normalized.includes(".")) return null;
  return `#/${normalized.replace(".", "/")}/${entityId}`;
}

/* ── The base card ──────────────────────────────────────────── */

export function ActionPrefix({ action }: { readonly action?: string }): JSX.Element | null {
  if (action === undefined || action.length === 0) return null;
  return <span data-host="ActionPrefix">{action}: </span>;
}

/**
 * The card every schema gets when its module registered none.
 *
 * The `<a>` is load-bearing, not decoration: a card that renders a name with
 * no link is an entity the user cannot open, which is why callers assert on
 * `closest("a")`.
 */
export function BaseEntityCard({
  schemaId,
  data,
  action,
  children,
}: {
  readonly schemaId: string;
  readonly data: Readonly<Record<string, unknown>>;
  readonly runtime?: unknown;
  readonly action?: string;
  readonly children?: ReactNode;
}): JSX.Element {
  const entityId = (data.id as string | undefined) ?? "";
  const href = entityHref(schemaId, entityId);
  const visual = schemaVisual(normalizeSchemaId(schemaId));
  const { bare, expanded } = useContext(ExpansionContext);

  return createElement(
    href ? "a" : "span",
    {
      "data-host": "BaseEntityCard",
      "data-bare": bare ? "true" : "false",
      "data-expanded": expanded ? "true" : "false",
      "data-module": visual.moduleId,
      ...(href ? { href } : {}),
    },
    <span key="icon">
      <Icon name={visual.icon} />
    </span>,
    children ?? (
      <span key="title">
        <ActionPrefix action={action} />
        {(data.name as string | undefined) ?? (data.title as string | undefined) ?? "Untitled"}
      </span>
    ),
  );
}
