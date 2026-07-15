import type { AvatarColor } from "@magnis/host/base";
import type { ProjectListItem, ProjectProfile } from "./types";

const AVATAR_COLORS: readonly AvatarColor[] = [
  "blue", "green", "orange", "purple", "red", "pink",
];

function initialsFrom(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function colorFromId(id: string): AvatarColor {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]!;
}

export function mapProject(item: ProjectListItem): ProjectProfile {
  return {
    id: item.id,
    name: item.name,
    initials: initialsFrom(item.name),
    status: item.status ?? "active",
    preview: item.status ?? "",
    time: new Date(item.created_at).toLocaleDateString(),
    color: colorFromId(item.id),
  };
}

export function getProject(
  projects: readonly ProjectProfile[],
  id: string,
): ProjectProfile | undefined {
  return projects.find((p) => p.id === id);
}
