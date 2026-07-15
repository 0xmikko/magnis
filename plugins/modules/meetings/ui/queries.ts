import { useQuery } from "@tanstack/react-query";
import { useAppRuntime } from "@magnis/host/runtime";
import type { MeetingListItem } from "./types";
import type { PaginatedResponse } from "@magnis/host/runtime";

export const meetingKeys = {
  all: ["meetings"] as const,
  list: (params?: Record<string, unknown>) => [...meetingKeys.all, "list", params] as const,
  detail: (id: string) => [...meetingKeys.all, "detail", id] as const,
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type, @typescript-eslint/explicit-module-boundary-types
export function useMeetingsListQuery(limit = 100, offset = 0) {
  const runtime = useAppRuntime();
  return useQuery({
    queryKey: meetingKeys.list({ limit, offset }),
    queryFn: () => runtime.transport.rpc<PaginatedResponse<MeetingListItem>>(
      "meetings.list", { limit, offset },
    ),
    staleTime: 30_000,
  });
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type, @typescript-eslint/explicit-module-boundary-types
export function useMeetingDetailQuery(id: string) {
  const runtime = useAppRuntime();
  return useQuery({
    queryKey: meetingKeys.detail(id),
    queryFn: () => runtime.transport.rpc("meetings.get", { id }),
    enabled: !!id,
  });
}
