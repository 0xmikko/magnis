import { useMemo, type JSX } from "react";
import { useQuery } from "@tanstack/react-query";
import type { DetailPanelProps } from "@magnis/host/base";
import { ExpandableEntityCard } from "@magnis/host/agent";
import { InfoCard, Stack, Text } from "@magnis/host/ui";
import type { TriggerDetailView } from "../types";

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
}: DetailPanelProps): JSX.Element {
  const detail = useQuery<TriggerDetailView>({
    queryKey: ["triggers", "detail", entityId],
    queryFn: () => runtime.transport.rpc("triggers.get", { id: entityId }),
    staleTime: 10_000,
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
    </Stack>
  );
}
