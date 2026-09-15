/** `@magnis/host/agent` — the agent-panel surface a module renderer sits in.
 *
 * `ExpandableEntityCard` and `EntityCardRenderer` are the seam a module's
 * card is reached through: the host resolves the registration for a schema
 * and renders it. The double keeps that resolution — a plugin test that
 * registers a card and expects it rendered is testing its own registration,
 * and it must still get the answer.
 */
import { useState, type JSX, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { ExpansionContext } from "./internal/entity-card";
import { EntityCardRenderer } from "./runtime";
import { Icon } from "./ui";

export { ExpansionContext } from "./internal/entity-card";
export type { ExpansionContextValue } from "./internal/entity-card";

interface RuntimeLike {
  readonly agent: {
    resolveEntityRenderer: (schemaId: string) =>
      | {
          readonly Render: (props: Record<string, unknown>) => JSX.Element;
          readonly hasMore?: (data: Readonly<Record<string, unknown>>, runtime: unknown) => boolean;
        }
      | undefined
      | null;
  };
}

export function ExpandableEntityCard({
  schemaId,
  data,
  runtime,
  action,
}: {
  readonly schemaId: string;
  readonly data: Readonly<Record<string, unknown>>;
  readonly runtime: unknown;
  readonly action?: string;
}): JSX.Element {
  const reg = (runtime as RuntimeLike).agent.resolveEntityRenderer(schemaId);
  const [open, setOpen] = useState(false);
  const canExpand = reg?.hasMore?.(data, runtime) ?? false;

  if (!canExpand) {
    return <EntityCardRenderer schemaId={schemaId} data={data} runtime={runtime} action={action} />;
  }

  return (
    <ExpansionContext.Provider value={{ bare: true, expanded: open }}>
      <div data-host="ExpandableEntityCard">
        <EntityCardRenderer schemaId={schemaId} data={data} runtime={runtime} action={action} />
        <button
          type="button"
          data-testid="expand-chevron"
          aria-expanded={open}
          aria-label={open ? "Collapse" : "Expand"}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setOpen((v) => !v);
          }}
        >
          <Icon name={open ? "chevron-down" : "chevron-right"} />
        </button>
      </div>
    </ExpansionContext.Provider>
  );
}

export function MarkdownText({
  text,
  className,
}: {
  readonly text: string;
  readonly className?: string;
}): JSX.Element {
  // Real GFM, not a passthrough: a module that puts a note body through this
  // is asserting that markdown SEMANTICS reach the screen — a bold run as
  // <strong>, a table as a table — and a stub that echoed the source string
  // would turn that assertion into its opposite while staying green.
  return (
    <div data-host="MarkdownText" className={`agent-markdown ${className ?? ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer noopener" />,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

export function AllowlistDropdown({
  isAllowlisted,
  onToggle,
}: {
  readonly isAllowlisted: false | "dialog" | "always";
  readonly onToggle: (scope?: "dialog" | "always") => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  if (isAllowlisted !== false) {
    return (
      <button
        type="button"
        data-host="AllowlistDropdown"
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
      >
        {isAllowlisted === "dialog" ? "Allowed in this dialog" : "Allowed always"}
      </button>
    );
  }
  return (
    <div data-host="AllowlistDropdown">
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
        }}
      >
        Allowlist
      </button>
      {open ? (
        <div>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setOpen(false);
              onToggle("dialog");
            }}
          >
            Allow in this dialog
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setOpen(false);
              onToggle("always");
            }}
          >
            Allow always
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* ── extractEntities ────────────────────────────────────────────
 * A pure host function, reimplemented rather than stubbed: a module
 * renderer receives what this returns, so a stub would change the SUBJECT
 * of every test downstream of it. The host owns the authoritative pin
 * (`frontend/src/components/agent/__tests__/extractEntitiesMeetings.test.ts`);
 * `__tests__/agent.test.tsx` here pins that this double agrees with it.
 */

const TOOL_PREFIX_TO_SCHEMA: Readonly<Record<string, string>> = {
  contacts: "contacts.person",
  email: "emails.message",
  emails: "emails.message",
  notes: "notes.note",
  projects: "projects.project",
  tasks: "tasks.task",
  telegram: "telegram.message",
  meetings: "meetings.calendar_event",
};

export function inferSchemaFromTool(toolName: string | undefined): string | null {
  if (!toolName) return null;
  const prefix = toolName.split(/[._]/)[0];
  return prefix ? (TOOL_PREFIX_TO_SCHEMA[prefix] ?? null) : null;
}

function withSchema(
  item: Record<string, unknown>,
  fallback: string | null,
): Record<string, unknown> | null {
  if (item.id === null || item.id === undefined) return null;
  if (typeof item.schema_id === "string") return item;
  if (fallback !== null) return { ...item, schema_id: fallback };
  return null;
}

export interface ExtractEntitiesOptions {
  readonly toolName?: string;
  readonly defaultSchemaId?: string;
}

export function extractEntities(
  result: unknown,
  opts?: ExtractEntitiesOptions,
): readonly Readonly<Record<string, unknown>>[] {
  if (!result || typeof result !== "object") return [];
  const r = result as Record<string, unknown>;
  const fallback = opts?.defaultSchemaId ?? inferSchemaFromTool(opts?.toolName);

  if (r.id !== null && r.id !== undefined) {
    const single = withSchema(r, fallback);
    if (single) return [single];
  }

  for (const key of ["items", "results"] as const) {
    const arr = r[key];
    if (Array.isArray(arr)) {
      const rows = (arr as unknown[])
        .filter((i): i is Record<string, unknown> => i !== null && typeof i === "object")
        .map((row) => withSchema(row, fallback))
        .filter((row): row is Record<string, unknown> => row !== null);
      if (rows.length > 0) return rows;
    }
  }

  if (r.result !== undefined && typeof r.result === "object" && r.result !== null) {
    return extractEntities(r.result, {
      defaultSchemaId: opts?.defaultSchemaId,
      toolName: opts?.toolName ?? (typeof r.tool_name === "string" ? r.tool_name : undefined),
    });
  }

  if (Array.isArray(r.content)) {
    const first = r.content[0] as Record<string, unknown> | undefined;
    const text = first?.text;
    if (typeof text === "string") {
      try {
        return extractEntities(JSON.parse(text), opts);
      } catch {
        return [];
      }
    }
  }
  return [];
}

export type { ReactNode };
