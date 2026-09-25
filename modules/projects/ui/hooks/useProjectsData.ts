import { useMemo } from "react";
import { useProjectsListQuery } from "../queries";
import { mapProject } from "../helpers";
import type { ProjectProfile } from "../types";

export function useProjectsData(): {
  listTitle: string;
  searchPlaceholder: string;
  projects: readonly ProjectProfile[];
} {
  const { data } = useProjectsListQuery();

  const projects: readonly ProjectProfile[] = useMemo(
    () => (data?.items ?? []).map(mapProject),
    [data],
  );

  return {
    listTitle: "Projects",
    searchPlaceholder: "Search projects...",
    projects,
  };
}
