/**
 * Operator-driven optimistic create — fires the `meetings.create` RPC
 * with default title/time fields. Mirrors notes.create UX: the user
 * renames in-place after the row appears. The `client_id` makes the
 * call idempotent at the backend.
 */
import type { AppRuntime } from "@magnis/host/runtime";

export async function createMeetingFromHeaderButton(
  runtime: AppRuntime,
  onCreated: (id: string) => void,
): Promise<void> {
  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);
  const result = await runtime.transport.rpc<{ id: string }>(
    "meetings.create",
    {
      title: "Untitled Meeting",
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      client_id: crypto.randomUUID(),
    },
  );
  onCreated(result.id);
}
