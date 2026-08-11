import { useMemo, type JSX } from "react";
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
  onDeleted,
}: DetailPanelProps): JSX.Element {
  const queryClient = useQueryClient();
  const detail = useTriggerDetailQuery(entityId, runtime);
  const history = useTriggerHistory(entityId, runtime);

  const setStatus = useMutation({
    mutationFn: (status: string) =>
      runtime.transport.rpc("triggers.update", { id: entityId, status }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: triggerKeys.all });
    },
  });

  const remove = useMutation({
    mutationFn: () => runtime.transport.rpc("triggers.delete", { id: entityId }),
    onSuccess: () => {
      // Report upward FIRST. The host owns what selection means, and the
      // invalidation below refetches this panel's own now-dead queries — with
      // retries and backoff that is a second or more, and awaiting it would
      // leave a deleted trigger on screen with live Pause and Delete buttons.
      onDeleted?.();
      // The plugin's own list, detail and history keys.
      void queryClient.invalidateQueries({ queryKey: triggerKeys.all });
      // INV-P2.3: and the owners that named this trigger. The panel has no
      // owner id — a watched entity carries only id and name — so the
      // predicate is explicit. A predicate rather than a per-entry key: a key
      // matches by PREFIX, so invalidating a contact's detail would also drop
      // its descendant queries (`contacts/ui/queries.ts` nests
      // `social_tracking` under the detail key), which is more than this owns.
      void queryClient.invalidateQueries({
        predicate: (cached) => {
          const links = (cached.state.data as { linked_entities?: unknown } | undefined)
            ?.linked_entities;
          if (!Array.isArray(links)) return false;
          return links.some((link) => (link as { id?: unknown } | null)?.id === entityId);
        },
      });
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
          {watchedEntities.isError ? (
            <Text variant="body" color="tertiary">Watched entities unavailable</Text>
          ) : !watchedEntities.data ? (
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

      <Row gap={2}>
        <ActionButton
          label={trigger.status === "active" ? "Pause" : "Resume"}
          icon={trigger.status === "active" ? "pause" : "activity"}
          onClick={() => {
            // One in flight at a time: a second click would issue a second
            // write against the same trigger.
            if (setStatus.isPending) return;
            setStatus.mutate(trigger.status === "active" ? "paused" : "active");
          }}
        />
        <ActionButton
          label="Delete"
          variant="danger"
          icon="trash"
          onClick={() => {
            if (remove.isPending) return;
            remove.mutate();
          }}
        />
      </Row>

      {/* A rejected write is surfaced, not swallowed: the row stays, the status
          is unchanged, and the operator is told why. */}
      {setStatus.isError ? (
        <Text variant="body" color="tertiary">
          {`Could not change the status: ${setStatus.error.message}`}
        </Text>
      ) : null}
      {remove.isError ? (
        <Text variant="body" color="tertiary">
          {`Could not delete this trigger: ${remove.error.message}`}
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
