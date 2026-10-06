import type { AvatarColor } from "@magnis/host/base";

export type { ProjectDetailView, ProjectListItem } from "../types.ts";

export interface ProjectProfile {
  readonly id: string;
  readonly name: string;
  readonly initials: string;
  readonly status: string;
  readonly preview: string;
  readonly time: string;
  readonly color: AvatarColor;
}
