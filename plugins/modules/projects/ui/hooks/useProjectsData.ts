import { useMemo } from "react";
import { useProjectsListQuery } from "../queries";
import { mapProject } from "../helpers";
import type { ProjectProfile } from "../types";

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type, @typescript-eslint/explicit-module-boundary-types
export function useProjectsData() {
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
