import { useMemo, useRef, type JSX } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DetailPanelProps } from "@magnis/host/base";
import { ExpandableEntityCard } from "@magnis/host/agent";
import { ActionButton, InfoCard, Row, Stack, Text } from "@magnis/host/ui";
import { formatTimeAgo } from "@magnis/host/utils";
import { triggerKeys } from "./queries";
import { useTriggerDetailQuery, useTriggerHistory } from "./useTriggerDetail";

// The module's own vocabulary for what an execution did.
const OUTCOME_LABELS: Record<string, string> = {
  spawned: "Fired",
  skipped_gate: "Skipped (not relevant)",
  skipped_cooldown: "Skipped (cooldown)",
  error: "Error",
};

const OUTCOME_COLORS: Record<string, string> = {
  spawned: "text-green-400",
  skipped_gate: "text-yellow-400",
  skipped_cooldown: "text-content-muted",
  error: "text-red-400",
};

interface ResolvedEntity {
  readonly id: string;
  readonly schemaId: string;
  readonly name: string;
  readonly data: Readonly<Record<string, unknown>>;
  /** The graph read for this one watch failed; it is named, not hidden. */
  readonly unreadable: boolean;
}

// The one event kind the backend emits, in the words the operator reads. The
// host panel carried this mapping; without it the row shows `sync_ingested`.
const EVENT_KIND_LABELS: Record<string, string> = {
  sync_ingested: "New message/email",
};

function deduplicateEntities(entities: readonly ResolvedEntity[]): readonly ResolvedEntity[] {
  const ids = new Set<string>();
  return entities.filter((entity) => {
    if (ids.has(entity.id)) return false;
    ids.add(entity.id);
    return true;
  });
}

export function TriggerDetailPanel({
  entityId,
  runtime,
}: DetailPanelProps): JSX.Element {
  const queryClient = useQueryClient();
  const detail = useTriggerDetailQuery(entityId, runtime);
  const history = useTriggerHistory(entityId, runtime);

  // A ref, not the mutation's `isPending`: that is a rendered snapshot, so two
  // clicks dispatched before React re-renders would both get past it and issue
  // two writes against the same trigger.
  //
  // A SET of in-flight ids, not a boolean. The host reuses this panel when the
  // selection changes — `BaseModuleComponent` renders it unkeyed — so the guard
  // has to be per trigger: a boolean would swallow a legitimate Stop on the next
  // trigger, and a single remembered id would forget the first one over an
  // A → B → A walk.
  const statusInFlight = useRef(new Set<string>());

  const setStatus = useMutation({
    mutationFn: (vars: { readonly id: string; readonly status: string }) =>
      runtime.transport.rpc("triggers.update", { id: vars.id, status: vars.status }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: triggerKeys.all });
    },
    onSettled: (_data, _error, vars) => {
      statusInFlight.current.delete(vars.id);
    },
  });

  const watchIds = useMemo(
    () => detail.data?.watched_entities.map((entity) => entity.id) ?? [],
    [detail.data?.watched_entities],
  );
  const watchedEntities = useQuery<readonly ResolvedEntity[]>({
    queryKey: triggerKeys.watchedEntities(entityId, watchIds),
    enabled: watchIds.length > 0,
    queryFn: async () => {
      // Per watch, not one `Promise.all` that rejects as a unit: one
      // unreadable watch used to hide every other watch behind "unavailable".
      // A failed one is still named — the trigger watches it either way.
      const entities = await Promise.all(
        watchIds.map(async (id) => {
          try {
            const data = await runtime.transport.rpc<Record<string, unknown>>(
              "graph.entity.get",
              { id },
            );
            return {
              id,
              schemaId: data.schema_id as string,
              name: (data.name as string | undefined) ?? "",
              data: { ...data, id },
              unreadable: false,
            };
          } catch {
            return { id, schemaId: "", name: "", data: { id }, unreadable: true };
          }
        }),
      );
      return deduplicateEntities(entities);
    },
    staleTime: 30_000,
  });

  if (!detail.data) {
    return (
      <Stack gap={3} align="center" className="py-12">
        <Text variant="body" color="tertiary">
          {detail.isLoading ? "Loading trigger…" : "Trigger unavailable"}
        </Text>
      </Stack>
    );
  }

  const trigger = detail.data;
  // Anything that is not `active` does not fire — the engine compares exactly
  // that, so "stopped" needs no engine support.
  const running = trigger.status === "active";
  const configurationRows = [
    { label: "Status", value: trigger.status },
    // A scheduled trigger's "when" IS its cron; the event_kinds row only
    // makes sense for the watched path.
    ...(trigger.schedule
      ? [
          { label: "Schedule", value: trigger.schedule.cron },
          { label: "Timezone", value: trigger.schedule.timezone },
        ]
      : [
          {
            label: "When",
            value: trigger.event_kinds
              .map((kind) => EVENT_KIND_LABELS[kind] ?? kind)
              .join(", "),
          },
        ]),
    ...(trigger.gate_prompt
      ? [{ label: "Gate", value: trigger.gate_prompt }]
      : []),
    { label: "Action", value: trigger.action_prompt },
    { label: "Fired", value: `${String(trigger.firing_count)}×` },
    { label: "Debounce", value: `${String(trigger.debounce_seconds)}s` },
    ...(trigger.max_firings !== null && trigger.max_firings !== undefined
      ? [{ label: "Maximum firings", value: String(trigger.max_firings) }]
      : []),
    ...(trigger.parent_episode_name
      ? [{ label: "Episode", value: trigger.parent_episode_name }]
      : []),
  ];

  return (
    <Stack gap={4} className="px-5 py-4">
      {watchIds.length > 0 ? (
        <Stack gap={2}>
          <Text variant="title">Watches</Text>
          {/* No error branch: every per-item read is caught, so the query
              cannot reject and an "unavailable" fallback would be dead code.
              A watch that could not be read is named in the list below. */}
          {!watchedEntities.data ? (
            <Text variant="body" color="tertiary">Loading entities…</Text>
          ) : (
            <Stack gap={2}>
              {watchedEntities.data.map((entity) =>
                entity.unreadable ? (
                  // Named, not dropped: the trigger watches this entity whether
                  // or not the graph read for it succeeded.
                  <Text key={entity.id} variant="body" color="tertiary">
                    {entity.id} (unavailable)
                  </Text>
                ) : (
                  <ExpandableEntityCard
                    key={entity.id}
                    schemaId={entity.schemaId}
                    data={entity.data}
                    runtime={runtime}
                  />
                ),
              )}
            </Stack>
          )}
        </Stack>
      ) : null}

      <InfoCard rows={configurationRows} />

      {/* A trigger is part of the graph: it is stopped, never deleted. One
          affordance, both directions. */}
      <Row gap={2}>
        <ActionButton
          label={running ? "Stop" : "Start"}
          icon={running ? "square" : "play"}
          onClick={() => {
            if (statusInFlight.current.has(entityId)) return;
            statusInFlight.current.add(entityId);
            setStatus.mutate({ id: entityId, status: running ? "stopped" : "active" });
          }}
        />
      </Row>

      {/* A rejected write is surfaced, not swallowed: the status is unchanged
          and the operator is told why. */}
      {setStatus.isError ? (
        <Text variant="body" color="tertiary">
          {`Could not change the status: ${setStatus.error.message}`}
        </Text>
      ) : null}

      {history.length > 0 ? (
        <Stack gap={2}>
          <Text variant="title">Recent activity</Text>
          <Stack gap={1}>
            {/* Keyed by position: two firings can share a timestamp AND an
                outcome (one trigger, two watched entities, one ingest), so
                nothing derived from the row's content is unique. */}
            {history.map((execution, index) => (
              <Row
                key={`${String(index)}-${execution.fired_at}`}
                justify="between"
                px={2}
                py={1}
              >
                <Text
                  variant="caption"
                  className={OUTCOME_COLORS[execution.outcome] ?? "text-content-muted"}
                >
                  {OUTCOME_LABELS[execution.outcome] ?? execution.outcome}
                </Text>
                <Text variant="caption" color="tertiary">
                  {formatTimeAgo(execution.fired_at)}
                </Text>
              </Row>
            ))}
          </Stack>
        </Stack>
      ) : null}
    </Stack>
  );
}
