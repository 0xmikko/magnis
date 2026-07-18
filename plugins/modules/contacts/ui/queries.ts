import { useQuery } from "@tanstack/react-query";
import { useAppRuntime } from "@magnis/host/runtime";
import type { ContactListItem, ContactDetailView } from "./types";
import type { PaginatedResponse } from "@magnis/plugin-sdk";

export const contactKeys = {
  all: ["contacts"] as const,
  list: (params?: Record<string, unknown>) => [...contactKeys.all, "list", params] as const,
  detail: (id: string) => [...contactKeys.all, "detail", id] as const,
};

export function useContactsListQuery(limit = 100, offset = 0) {
  const runtime = useAppRuntime();
  return useQuery({
    queryKey: contactKeys.list({ limit, offset }),
    queryFn: () => runtime.transport.rpc<PaginatedResponse<ContactListItem>>(
      "contacts.list",
      { limit, offset },
    ),
    staleTime: 30_000,
  });
}

export function useContactDetailQuery(id: string) {
  const runtime = useAppRuntime();
  return useQuery({
    queryKey: contactKeys.detail(id),
    queryFn: () => runtime.transport.rpc<ContactDetailView>("contacts.get", { id }),
    enabled: !!id,
  });
}

// contacts.person.social opt-in state (DEC-9). The social source connectors
// fetch ONLY tracked handles (DEC-8 / INV-1), so this is the UI seam that turns
// tracking on/off per platform.
export interface SocialTrackingState {
  tracked_x?: boolean;
  x_handle?: string;
  tracked_linkedin?: boolean;
  linkedin_handle?: string;
}

export const socialTrackingKey = (id: string): readonly unknown[] =>
  [...contactKeys.detail(id), "social_tracking"] as const;

export function useSocialTrackingQuery(id: string) {
  const runtime = useAppRuntime();
  return useQuery({
    queryKey: socialTrackingKey(id),
    queryFn: () =>
      runtime.transport.rpc<SocialTrackingState>("contacts.get_social_tracking", { id }),
    enabled: !!id,
  });
}
