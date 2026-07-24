import { useEffect, useState } from "react";
import type { JSX } from "react";
import { Icon } from "@magnis/host/ui";
import type { AgentRendererProps, AppRuntime, ToolCallRendererPayload } from "@magnis/host/runtime";
import { EntityCardRenderer } from "@magnis/host/runtime";
import { BaseToolCallCard } from "@magnis/host/base";

interface ResolvedEntity {
  readonly id: string;
  readonly schema_id: string;
  readonly name?: string;
  readonly data: Record<string, unknown>;
}

function useResolvedEntities(
  watchIds: readonly string[] | undefined,
  runtime: AppRuntime,
): readonly ResolvedEntity[] {
  const [entities, setEntities] = useState<ResolvedEntity[]>([]);

  useEffect(() => {
    if (!watchIds || watchIds.length === 0) return;
    let cancelled = false;
    void Promise.all(
      watchIds.map((id) =>
        runtime.transport
          .rpc<Record<string, unknown>>("graph.entity.get", { id })
          .then((e) => ({
            id,
            schema_id: (e.schema_id as string | undefined) ?? "",
            name: e.name as string | undefined,
            data: e,
          }))
          .catch(() => null),
      ),
    ).then((results) => {
      if (!cancelled)
        setEntities(
          results.filter((r): r is NonNullable<typeof r> => r !== null),
        );
    });
    return (): void => {
      cancelled = true;
    };
  }, [watchIds, runtime]);

  return entities;
}

export function TriggerToolCallRenderer({
  payload,
  runtime,
}: AgentRendererProps<ToolCallRendererPayload>): JSX.Element {
  const { toolCall: tc, toolResult, isAllowlisted, superseded, onApprove, onDeny, onAllowlistToggle } =
    payload;
  const args = tc.args as Record<string, unknown>;
  const result = toolResult?.result as Record<string, unknown> | undefined;

  const [expanded, setExpanded] = useState(false);

  const name = (result?.name ?? args.name) as string | undefined;
  const gatePrompt = (result?.gate_prompt ?? args.gate_prompt) as string | undefined;
  const actionPrompt = (result?.action_prompt ?? args.action_prompt) as string | undefined;
  const watchIds = args.watch_entity_ids as readonly string[] | undefined;
  const watchedNames = result?.watched_entity_names as readonly string[] | undefined;
  const watchedEntities = useResolvedEntities(watchIds, runtime);

  return (
    <BaseToolCallCard
      icon="zap"
      title={name ?? "Trigger"}
      variant="teal"
      status={tc.status}
      toolResult={toolResult}
      superseded={superseded}
      isAllowlisted={isAllowlisted}
      primaryLabel="Create"
      primaryIcon="zap"
      doneLabel="Created"
      onApprove={onApprove}
      onDeny={onDeny}
      onAllowlistToggle={onAllowlistToggle}
    >
      {/* Expand/collapse toggle */}
      <div className="absolute top-3 right-12">
        <button
          type="button"
          onClick={() => {
            setExpanded(!expanded);
          }}
          className="flex h-6 w-6 items-center justify-center rounded-md text-agent-text-muted hover:text-agent-text"
        >
          <Icon name={expanded ? "minimize-2" : "maximize-2"} size={13} />
        </button>
      </div>

      {/* Watched entities */}
      {watchedEntities.length > 0 ? (
        <div className="mb-2 space-y-1">
          <span className="text-[11px] text-agent-text-muted">Watches</span>
          {watchedEntities.map((entity) => (
            <EntityCardRenderer
              key={entity.id}
              schemaId={entity.schema_id}
              data={entity.data}
              runtime={runtime}
            />
          ))}
        </div>
      ) : watchedNames && watchedNames.length > 0 ? (
        <div className="mb-2 text-[12px]">
          <span className="text-agent-text-muted">Watches: </span>
          <span className="text-agent-text">{watchedNames.join(", ")}</span>
        </div>
      ) : null}

      {/* Gate prompt */}
      {gatePrompt && (
        <div className="mb-1.5 text-[12px]">
          <span className="text-agent-text font-semibold">Gate: </span>
          <span className="text-agent-text">
            {expanded ? gatePrompt : gatePrompt.length > 80 ? gatePrompt.slice(0, 80) + "…" : gatePrompt}
          </span>
        </div>
      )}

      {/* Action prompt */}
      {actionPrompt && (
        <div className="mb-1 text-[12px]">
          <span className="text-agent-text font-semibold">Action: </span>
          <span className="text-agent-text">
            {expanded
              ? actionPrompt
              : actionPrompt.length > 100
                ? actionPrompt.slice(0, 100) + "…"
                : actionPrompt}
          </span>
        </div>
      )}
    </BaseToolCallCard>
  );
}
