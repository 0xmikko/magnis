import { useMemo, type JSX } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DetailPanelProps } from "@magnis/host/base";
import { ExpandableEntityCard } from "@magnis/host/agent";
import { ActionButton, InfoCard, Row, Stack, Text } from "@magnis/host/ui";
import { formatTimeAgo } from "@magnis/host/utils";
import type { TriggerDetailView } from "../types";
import { useTriggerHistory } from "./useTriggerDetail";

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
}

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
  onDeleted,
}: DetailPanelProps): JSX.Element {
  const queryClient = useQueryClient();
  const detail = useQuery<TriggerDetailView>({
    queryKey: ["triggers", "detail", entityId],
    queryFn: () => runtime.transport.rpc("triggers.get", { id: entityId }),
    staleTime: 10_000,
  });
  const history = useTriggerHistory(entityId, runtime);

  const setStatus = useMutation({
    mutationFn: (status: string) =>
      runtime.transport.rpc("triggers.update", { id: entityId, status }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["triggers"] });
    },
  });

  const remove = useMutation({
    mutationFn: () => runtime.transport.rpc("triggers.delete", { id: entityId }),
    onSuccess: async () => {
      // The plugin's own list and detail keys.
      await queryClient.invalidateQueries({ queryKey: ["triggers"] });
      // INV-P2.3: and the owners that named this trigger. The panel has no
      // owner id — a watched entity carries only id and name — so the
      // predicate is explicit: any cached detail whose `linked_entities`
      // contains the deleted id. Invalidating every module detail would be
      // easier and wrong.
      for (const cached of queryClient.getQueryCache().findAll()) {
        const links = (cached.state.data as { linked_entities?: unknown } | undefined)
          ?.linked_entities;
        if (!Array.isArray(links)) continue;
        const names = links.some(
          (link) => (link as { id?: unknown } | null)?.id === entityId,
        );
        if (!names) continue;
        await queryClient.invalidateQueries({ queryKey: cached.queryKey });
      }
      // The host owns what selection means; the panel only reports.
      onDeleted?.();
    },
  });
  const watchIds = useMemo(
    () => detail.data?.watched_entities.map((entity) => entity.id) ?? [],
    [detail.data?.watched_entities],
  );
  const watchedEntities = useQuery<readonly ResolvedEntity[]>({
    queryKey: ["triggers", "watched-entities", entityId, watchIds],
    enabled: watchIds.length > 0,
    queryFn: async () => {
      const entities = await Promise.all(
        watchIds.map(async (id) => {
          const data = await runtime.transport.rpc<Record<string, unknown>>(
            "graph.entity.get",
            { id },
          );
          return {
            id,
            schemaId: data.schema_id as string,
            name: (data.name as string | undefined) ?? "",
            data: { ...data, id },
          };
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
  const configurationRows = [
    { label: "Status", value: trigger.status },
    // A scheduled trigger's "when" IS its cron; the event_kinds row only
    // makes sense for the watched path.
    ...(trigger.schedule
      ? [
          { label: "Schedule", value: trigger.schedule.cron },
          { label: "Timezone", value: trigger.schedule.timezone },
        ]
      : [{ label: "When", value: trigger.event_kinds.join(", ") }]),
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
          {watchedEntities.isError ? (
            <Text variant="body" color="tertiary">Watched entities unavailable</Text>
          ) : !watchedEntities.data ? (
            <Text variant="body" color="tertiary">Loading entities…</Text>
          ) : (
            <Stack gap={2}>
              {watchedEntities.data.map((entity) => (
                <ExpandableEntityCard
                  key={entity.id}
                  schemaId={entity.schemaId}
                  data={entity.data}
                  runtime={runtime}
                />
              ))}
            </Stack>
          )}
        </Stack>
      ) : null}

      <InfoCard rows={configurationRows} />

      <Row gap={2}>
        <ActionButton
          label={trigger.status === "active" ? "Pause" : "Resume"}
          icon={trigger.status === "active" ? "pause" : "activity"}
          onClick={() => {
            setStatus.mutate(trigger.status === "active" ? "paused" : "active");
          }}
        />
        <ActionButton
          label="Delete"
          variant="danger"
          icon="trash"
          onClick={() => {
            remove.mutate();
          }}
        />
      </Row>

      {history.length > 0 ? (
        <Stack gap={2}>
          <Text variant="title">Recent activity</Text>
          <Stack gap={1}>
            {history.map((execution) => (
              <Row
                key={`${execution.fired_at}-${execution.outcome}`}
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
