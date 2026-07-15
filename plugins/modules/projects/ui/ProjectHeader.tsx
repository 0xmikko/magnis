import type { JSX } from "react";
import {
  Avatar,
  TOPBAR_AVATAR_SIZE,
  TopBarHeader,
} from "@magnis/host/ui";
import type { HeaderComponentProps } from "@magnis/host/base";

export function ProjectHeader({
  entityName,
  themeColor,
  onRename,
}: HeaderComponentProps): JSX.Element {
  const initials = entityName
    ? entityName.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()
    : "?";

  return (
    <TopBarHeader
      leading={
        <Avatar label={initials} color={themeColor} size={TOPBAR_AVATAR_SIZE} />
      }
      title={entityName ?? "Untitled"}
      onTitleEdit={onRename}
    />
  );
}
