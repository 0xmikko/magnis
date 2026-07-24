import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { useAppRuntime } from "@magnis/host/runtime";
import type { CompanyListItem } from "./types";
import type { PaginatedResponse } from "@magnis/plugin-sdk";

export const companyKeys = {
  all: ["companies"] as const,
  list: (params?: Record<string, unknown>) => [...companyKeys.all, "list", params] as const,
  detail: (id: string) => [...companyKeys.all, "detail", id] as const,
};

export function useCompaniesListQuery(limit = 100, offset = 0): UseQueryResult<PaginatedResponse<CompanyListItem>> {
  const runtime = useAppRuntime();
  return useQuery({
    queryKey: companyKeys.list({ limit, offset }),
    queryFn: () => runtime.transport.rpc<PaginatedResponse<CompanyListItem>>(
      "companies.list", { limit, offset },
    ),
    staleTime: 30_000,
  });
}

export function useCompanyDetailQuery(id: string): UseQueryResult {
  const runtime = useAppRuntime();
  return useQuery({
    queryKey: companyKeys.detail(id),
    queryFn: () => runtime.transport.rpc("companies.get", { id }),
    enabled: !!id,
  });
}
