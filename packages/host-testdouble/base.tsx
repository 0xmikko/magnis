/** `@magnis/host/base` — the module contract itself.
 *
 * `defineModule` is the one place where a double must reproduce host LOGIC
 * rather than host chrome: a module hands it a config and gets back the
 * registration the host will act on — renderer ids, the tool-name spellings
 * a history renderer matches, the agent contribution. Every one of those is
 * the plugin's own wiring, so the wiring rules are reimplemented here.
 *
 * What is NOT reproduced is the host's list/detail shell (`Component`): a
 * plugin supplies config and never asserts the shell's markup.
 */
import { createElement, useState, type ComponentType, type JSX, type ReactNode } from "react";
import { createStore } from "zustand/vanilla";

import { AllowlistDropdown } from "./agent";
import { BaseEntityCard, registerSchemaVisuals } from "./internal/entity-card";
import { Icon } from "./ui";

/* ── Shared internals ──────────────────────────────────────── */

// The registry, the href rules, the expansion context and the base card are
// the bottom of this graph — see internal/entity-card.tsx for why they are
// not defined here.
export {
  registerSchemaVisuals,
  schemaIcon,
  schemaLabel,
  schemaTabLabel,
  schemaVisual,
  allSchemaEntries,
  normalizeSchemaId,
  entityHref,
  ActionPrefix,
  BaseEntityCard,
} from "./internal/entity-card";

/* ── Tool-call card ────────────────────────────────────────── */

type ToolCallState = "draft" | "in-flight" | "done" | "failed" | "denied" | "superseded";

export function resolveToolCallState(
  status: "pending" | "approved" | "denied",
  superseded: boolean,
  inFlight: boolean,
  toolResult?: { result: unknown },
): ToolCallState {
  if (superseded) return "superseded";
  if (status === "denied") return "denied";
  if (status === "approved") {
    if (toolResult) {
      const r = toolResult.result;
      if (r !== null && typeof r === "object" && "error" in (r as Record<string, unknown>)) {
        return "failed";
      }
      if (typeof r === "string" && r.startsWith("Error")) return "failed";
    }
    return "done";
  }
  if (inFlight) return "in-flight";
  return "draft";
}

const STATE_BADGE_TEXT: Readonly<Record<ToolCallState, string>> = {
  draft: "Draft",
  "in-flight": "Applying...",
  done: "Applied",
  failed: "Failed",
  denied: "Denied",
  superseded: "Superseded",
};

/** The variant palette a module picks from.
 *
 * A tool-call card names a variant ("purple" for contacts, "sky" for
 * telegram) and the host paints it. That choice IS the plugin's, and its
 * tests assert the tokens that came back — so the table is ported. The
 * classes are the host's spelling of the same design tokens the generated
 * theme.css carries.
 */
const VARIANT_CLASSES: Readonly<Record<string, { border: string; bg: string; icon: string; primary: string }>> = {
  amber: {
    border: "border-[var(--color-agent-tool-amber-border)]",
    bg: "bg-[var(--color-agent-tool-amber-bg)]",
    icon: "text-[var(--color-agent-tool-amber-text)]",
    primary: "bg-[var(--color-agent-tool-amber-primary)]",
  },
  sky: {
    border: "border-[var(--color-agent-tool-sky-border)]",
    bg: "bg-[var(--color-agent-tool-sky-bg)]",
    icon: "text-[var(--color-agent-tool-sky-text)]",
    primary: "bg-[var(--color-agent-tool-sky-primary)]",
  },
  rose: {
    border: "border-[var(--color-agent-tool-rose-border)]",
    bg: "bg-[var(--color-agent-tool-rose-bg)]",
    icon: "text-[var(--color-agent-tool-rose-text)]",
    primary: "bg-[var(--color-agent-tool-rose-primary)]",
  },
  teal: {
    border: "border-[var(--color-agent-tool-teal-border)]",
    bg: "bg-[var(--color-agent-tool-teal-bg)]",
    icon: "text-[var(--color-agent-tool-teal-text)]",
    primary: "bg-[var(--color-agent-tool-teal-primary)]",
  },
  purple: {
    border: "border-[var(--color-agent-tool-purple-border)]",
    bg: "bg-[var(--color-agent-tool-purple-bg)]",
    icon: "text-[var(--color-agent-tool-purple-text)]",
    primary: "bg-[var(--color-agent-tool-purple-primary)]",
  },
};

export function BaseToolCallCard({
  icon,
  title,
  status,
  toolResult,
  variant = "amber",
  superseded = false,
  isAllowlisted = false,
  children,
  headerExtra,
  primaryLabel = "Apply",
  primaryIcon = "check",
  doneLabel = "Applied",
  onApprove,
  onDeny,
  onEdit,
  onAllowlistToggle,
  onNavigate,
  customActions,
}: {
  readonly icon: string;
  readonly title: string;
  readonly variant?: string;
  readonly status: "pending" | "approved" | "denied";
  readonly toolResult?: { readonly id: string; readonly result: unknown };
  readonly superseded?: boolean;
  readonly isAllowlisted?: false | "dialog" | "always";
  readonly children: ReactNode;
  readonly headerExtra?: ReactNode;
  readonly primaryLabel?: string;
  readonly primaryIcon?: string;
  readonly doneLabel?: string;
  readonly onApprove: () => Promise<void> | void;
  readonly onDeny?: () => Promise<void> | void;
  readonly onEdit?: () => void;
  readonly onAllowlistToggle?: (scope?: "dialog" | "always") => void;
  readonly onNavigate?: () => void;
  readonly customActions?: ReactNode;
}): JSX.Element {
  const [inFlight, setInFlight] = useState(false);
  const [localDone, setLocalDone] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  const state = resolveToolCallState(localDone ? "approved" : status, superseded, inFlight, toolResult);

  let badgeText = STATE_BADGE_TEXT[state];
  if (state === "done" && doneLabel !== "Applied") badgeText = doneLabel;
  if (state === "in-flight") badgeText = `${primaryLabel}ing...`;

  const isPending = state === "draft";
  const isTerminal = state === "done" || state === "denied" || state === "failed";
  const colors = VARIANT_CLASSES[variant] ?? VARIANT_CLASSES.amber;

  // A rejected approve/deny MUST reach the screen — swallowing it left the
  // button reading as dead while the backend had already answered.
  const handleDeny = async (): Promise<void> => {
    if (!onDeny) return;
    setInFlight(true);
    setApproveError(null);
    try {
      await onDeny();
    } catch (err) {
      setApproveError(err instanceof Error ? err.message : String(err));
    } finally {
      setInFlight(false);
    }
  };

  const handlePrimary = async (): Promise<void> => {
    setInFlight(true);
    setApproveError(null);
    try {
      await onApprove();
      setLocalDone(true);
    } catch (err) {
      setApproveError(err instanceof Error ? err.message : String(err));
    } finally {
      setInFlight(false);
    }
  };

  return (
    <div
      data-host="BaseToolCallCard"
      data-state={state}
      className={`rounded-xl border ${colors?.border ?? ""} ${colors?.bg ?? ""}`}
    >
      <div>
        <Icon name={icon} className={colors?.icon} />
        <span>{title}</span>
        {headerExtra}
        <span>{badgeText}</span>
      </div>

      <div data-testid="tool-call-card-body">{children}</div>

      {isPending && customActions ? (
        <div>{customActions}</div>
      ) : isPending ? (
        <div>
          {approveError !== null && <p data-testid="tool-approve-error">{approveError}</p>}
          {onAllowlistToggle && (
            <AllowlistDropdown isAllowlisted={isAllowlisted} onToggle={onAllowlistToggle} />
          )}
          {onDeny && (
            <button type="button" onClick={() => void handleDeny()}>
              Deny
            </button>
          )}
          {onEdit && (
            <button type="button" onClick={onEdit}>
              <Icon name="edit" />
              Edit
            </button>
          )}
          <button type="button" className={colors?.primary} onClick={() => void handlePrimary()}>
            <Icon name={primaryIcon} />
            {primaryLabel}
          </button>
        </div>
      ) : isTerminal ? (
        <div onClick={onNavigate && state === "done" ? onNavigate : undefined}>
          {(state === "done" || state === "failed") && isAllowlisted && onAllowlistToggle && (
            <AllowlistDropdown isAllowlisted={isAllowlisted} onToggle={onAllowlistToggle} />
          )}
          <Icon name={state === "done" ? "circle-check" : "circle-alert"} />
          <span>{badgeText}</span>
          {onNavigate && state === "done" ? <Icon name="chevron-right" /> : null}
        </div>
      ) : null}
    </div>
  );
}

/* ── Detail scaffolding ─────────────────────────────────────── */

export function EntityDetailTabs({
  entityId,
  linkedEntities,
  headerContent,
  detailsContent,
}: {
  readonly entityId: string;
  readonly linkedEntities: readonly { readonly schemaId?: string; readonly id?: string }[];
  readonly maxVisibleTabs?: number;
  readonly searchable?: boolean;
  readonly headerContent?: ReactNode;
  readonly detailsContent?: ReactNode;
}): JSX.Element {
  return (
    <div data-host="EntityDetailTabs" data-entity={entityId} data-linked={String(linkedEntities.length)}>
      {headerContent}
      {detailsContent}
    </div>
  );
}

export function ListPaneHeaderActions({
  runtime,
  icon,
  onAction,
  onCreated,
  CustomComponent,
}: {
  readonly runtime: unknown;
  readonly icon?: string;
  readonly onAction?: (runtime: unknown, onCreated: (id: string) => void) => void | Promise<void>;
  readonly onCreated?: (id: string) => void;
  readonly invalidateKeys?: readonly unknown[];
  readonly CustomComponent?: ComponentType<Record<string, unknown>>;
}): JSX.Element | null {
  if (CustomComponent) {
    return <CustomComponent runtime={runtime} onCreated={onCreated} />;
  }
  if (!onAction || icon === undefined) return null;
  return (
    <button
      type="button"
      data-host="ListPaneHeaderActions"
      aria-label={icon}
      onClick={() => {
        void onAction(runtime, (id) => onCreated?.(id));
      }}
    >
      <Icon name={icon} />
    </button>
  );
}

/* ── Entity properties ──────────────────────────────────────── */

export function useEntityProperties(_entityId: string | undefined): {
  readonly properties: Record<string, unknown>;
  readonly isLoading: boolean;
} {
  // The host reads the dictionary over `graph.entity.get`. A plugin test that
  // needs a value seeds it through the runtime double's transport instead.
  return { properties: {}, isLoading: false };
}

export function useEntityProperty(
  _entityId: string | undefined,
  _key: string,
): { readonly value: string; readonly isLoading: boolean; readonly save: (value: string) => void } {
  const [value, setValue] = useState("");
  return { value, isLoading: false, save: setValue };
}

/* ── defineModule ───────────────────────────────────────────── */

interface ToolCallRendererReg {
  readonly actions: readonly string[];
  readonly Render: unknown;
}

interface ModuleConfigLike {
  readonly id: string;
  readonly title?: string;
  readonly icon?: unknown;
  readonly iconName?: string;
  readonly themeColor?: string;
  readonly entityTypes: readonly string[];
  readonly schemas?: readonly string[];
  readonly entityLabels?: Record<
    string,
    {
      readonly icon?: string;
      readonly label?: string;
      readonly tabLabel?: string;
      readonly EntityCard?: unknown;
      readonly hasMore?: unknown;
    }
  >;
  readonly EntityCard?: unknown;
  readonly hasMore?: unknown;
  readonly toolCallRenderers?: readonly ToolCallRendererReg[];
  readonly systemPrompt?: string;
  readonly navigateToEntity?: unknown;
  readonly extractAllowlistTarget?: unknown;
  readonly onDraftRequest?: unknown;
  readonly extendStore?: (
    set: (partial: Record<string, unknown>) => void,
    get: () => Record<string, unknown>,
  ) => Record<string, unknown>;
  readonly extraSetup?: (runtime: unknown) => unknown;
  readonly entityLink?: unknown;
  readonly rpc?: { readonly list?: string };
  readonly rpcListParams?: Record<string, unknown>;
}

export function defineModule(config: ModuleConfigLike): Record<string, unknown> {
  const schemas = config.schemas ?? config.entityTypes.map((t) => `${config.id}.${t}`);

  if (!config.schemas || config.entityLabels) {
    registerSchemaVisuals(
      config.entityTypes.map((entityType, i) => {
        const custom = config.entityLabels?.[entityType];
        const defaultLabel = entityType.charAt(0).toUpperCase() + entityType.slice(1);
        return {
          schemaId: schemas[i] ?? `${config.id}.${entityType}`,
          entry: {
            icon: custom?.icon ?? config.iconName ?? "file",
            label: custom?.label ?? defaultLabel,
            tabLabel: custom?.tabLabel,
            themeColor: config.themeColor,
          },
        };
      }),
    );
  }

  const queryKeys = {
    all: [config.id] as const,
    list: (params?: unknown) => [config.id, "list", params] as const,
    detail: (id: string) => [config.id, "detail", id] as const,
  };

  const entityRenderers = schemas.map((schemaId, i) => {
    const entityType = config.entityTypes[i] ?? "";
    const perType = config.entityLabels?.[entityType];
    const hasMore = perType?.hasMore ?? config.hasMore;
    return {
      id: `${config.id}-${entityType}`,
      moduleId: config.id,
      schemaMatch: schemaId,
      Render: perType?.EntityCard ?? config.EntityCard ?? BaseEntityCard,
      ...(hasMore ? { hasMore } : {}),
    };
  });

  const historyRenderers: Record<string, unknown>[] = [];
  for (const reg of config.toolCallRenderers ?? []) {
    // The agent emits a tool name in several spellings; a renderer that
    // matches only one silently falls through to the generic card.
    const variants: string[] = [config.id];
    if (config.id.endsWith("s")) variants.push(config.id.slice(0, -1));
    const fullActions = new Set(
      variants.flatMap((prefix) =>
        reg.actions.flatMap((a) => [
          `${prefix}.${a}`,
          `${prefix}_${a}`,
          `${prefix}_${a.replace(/\./g, "_")}`,
        ]),
      ),
    );
    historyRenderers.push({
      id: `${config.id}-tool-${reg.actions[0] ?? ""}`,
      moduleId: config.id,
      match: (block: { toolName?: string | null }) =>
        typeof block.toolName === "string" && fullActions.has(block.toolName),
      Render: reg.Render,
      priority: 10,
    });
  }

  return {
    id: config.id,
    title: config.title,
    icon: config.icon,
    iconName: config.iconName,
    themeColor: config.themeColor,

    Component: () =>
      createElement("div", { "data-host": "BaseModuleComponent", "data-module": config.id }),

    createStore: () =>
      createStore<Record<string, unknown>>((set, get) => ({
        selectedId: undefined,
        searchQuery: "",
        ...(config.extendStore
          ? config.extendStore(
              (partial) => {
                set(partial);
              },
              () => get(),
            )
          : {}),
      })),

    setup: (runtime: {
      queryClient: { prefetchQuery: (opts: unknown) => unknown };
      transport: { rpc: (method: string, params: unknown) => Promise<unknown> };
    }) => {
      const listParams = { limit: 50, offset: 0, ...config.rpcListParams };
      void runtime.queryClient.prefetchQuery({
        queryKey: queryKeys.list(listParams),
        queryFn: () => runtime.transport.rpc(config.rpc?.list ?? `${config.id}.list`, listParams),
        staleTime: 30_000,
      });
      const extraCleanup = config.extraSetup?.(runtime);
      return () => {
        if (typeof extraCleanup === "function") (extraCleanup as () => void)();
      };
    },

    agent: {
      systemPrompt: config.systemPrompt,
      entityRenderers,
      historyRenderers: historyRenderers.length > 0 ? historyRenderers : undefined,
      navigateToEntity: config.navigateToEntity,
      extractAllowlistTarget: config.extractAllowlistTarget,
      onDraftRequest: config.onDraftRequest,
    },

    entityLink: config.entityLink,
  };
}
