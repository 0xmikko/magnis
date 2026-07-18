import { useContext, useEffect, useState, type JSX } from "react";
import type { EntityRendererProps, AppRuntime } from "@magnis/host/runtime";
import { EntityCardRenderer } from "@magnis/host/runtime";
import { BaseEntityCard, ActionPrefix } from "@magnis/host/base";
import { ExpansionContext } from "@magnis/host/agent";
import { useTriggerDetail, type WatchedEntityRef } from "./useTriggerDetail";

/**
 * SINGLE canonical trigger card. Per `docs/frontend/module-standard.md`
 * ("ONE COMPONENT PER ENTITY"): reads `expanded` from `ExpansionContext`
 * and switches between compact (name + status dot + watches subtitle)
 * and expanded (watches list + gate/action prompts + firing count).
 */

interface ResolvedEntity {
  readonly id: string;
  readonly schema_id: string;
  readonly data: Record<string, unknown>;
}

function useResolvedWatches(
  watched: readonly WatchedEntityRef[] | undefined,
  runtime: AppRuntime,
): readonly ResolvedEntity[] {
  const [resolved, setResolved] = useState<readonly ResolvedEntity[]>([]);
  useEffect(() => {
    if (!watched || watched.length === 0) {
      setResolved([]);
      return;
    }
    let cancelled = false;
    void Promise.all(
      watched.map((w) =>
        runtime.transport
          .rpc<Record<string, unknown>>("graph.entity.get", { id: w.id })
          .then((e) => ({
            id: w.id,
            schema_id: (e.schema_id as string) ?? "",
            data: e,
          }))
          .catch(() => null),
      ),
    ).then((r) => {
      if (!cancelled) setResolved(r.filter((x): x is ResolvedEntity => x !== null));
    });
    return (): void => {
      cancelled = true;
    };
  }, [watched, runtime]);
  return resolved;
}

const STATUS_DOT: Record<string, string> = {
  active: "bg-green-500",
  paused: "bg-yellow-500",
  expired: "bg-content-muted",
  disabled: "bg-content-muted",
};

export function TriggerCard(props: EntityRendererProps): JSX.Element {
  const { data, runtime, action } = props;
  const entityId = data.id as string | undefined;
  const name = data.name as string | undefined;
  const status = (data.status as string | undefined) ?? "active";

  const detail = useTriggerDetail(entityId, runtime);
  const { expanded } = useContext(ExpansionContext);
  const watches = useResolvedWatches(expanded ? detail?.watched_entities : undefined, runtime);
  const watchedNames = detail?.watched_entities.map((e) => e.name ?? "?") ?? [];
  const subtitle = watchedNames.length > 0 ? `Watches ${watchedNames.join(", ")}` : undefined;

  return (
    <BaseEntityCard {...props}>
      <div
        className="min-w-0 flex-1"
        data-testid={entityId ? `trigger-card-${entityId}` : undefined}
      >
        <span className="block truncate text-[12px] font-medium text-content">
          <ActionPrefix action={action} />
          {name ?? "Trigger"}
        </span>
        {!expanded && subtitle && (
          <span className="block truncate text-[11px] text-content-tertiary">{subtitle}</span>
        )}
        {expanded && detail && (
          <div
            data-testid={entityId ? `trigger-card-${entityId}-expanded` : undefined}
            className="mt-2 flex flex-col gap-1 text-[11px] text-content-tertiary"
          >
            {watches.length > 0 && (
              <div className="flex gap-2">
                <span className="w-20 shrink-0 text-content-tertiary">Watches</span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <ExpansionContext.Provider value={{ bare: false, expanded: false }}>
                    {watches.map((e) => (
                      <EntityCardRenderer
                        key={e.id}
                        schemaId={e.schema_id}
                        data={e.data}
                        runtime={runtime}
                      />
                    ))}
                  </ExpansionContext.Provider>
                </div>
              </div>
            )}
            {detail.gate_prompt && (
              <div className="flex gap-2">
                <span className="w-20 shrink-0 text-content-tertiary">Gate</span>
                <span className="min-w-0 flex-1 break-words text-content">{detail.gate_prompt}</span>
              </div>
            )}
            {detail.action_prompt && (
              <div className="flex gap-2">
                <span className="w-20 shrink-0 text-content-tertiary">Action</span>
                <span className="min-w-0 flex-1 break-words text-content">
                  {detail.action_prompt}
                </span>
              </div>
            )}
            {detail.firing_count > 0 && (
              <div className="text-[10px] text-content-tertiary">Fired {detail.firing_count}x</div>
            )}
          </div>
        )}
      </div>
      <span
        className={`mt-[5px] h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[status] ?? "bg-content-muted"}`}
        aria-label={`status: ${status}`}
      />
    </BaseEntityCard>
  );
}
