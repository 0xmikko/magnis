import type { JSX } from "react";
import { Avatar, Row, Text } from "@magnis/host/ui";
import type { ProjectProfile } from "./types";

export interface ProjectListItemContentProps {
  readonly project: ProjectProfile;
}

export function ProjectListItemContent({ project }: ProjectListItemContentProps): JSX.Element {
  return (
    <Row gap={3} align="center" className="w-full min-w-0">
      <Avatar label={project.initials} color={project.color} size="sm" />
      <div className="flex-1 min-w-0">
        <Text variant="body" className="truncate text-[13px] font-medium">
          {project.name}
        </Text>
        <Text variant="caption" color="tertiary" className="truncate text-[11px]">
          {project.status}
        </Text>
      </div>
      <Text variant="caption" color="tertiary" className="shrink-0 text-[10px]">
        {project.time}
      </Text>
    </Row>
  );
}
