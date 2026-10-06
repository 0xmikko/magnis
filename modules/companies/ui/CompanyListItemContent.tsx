import type { JSX } from "react";
import {
  Avatar,
  Stack,
  Text,
} from "@magnis/host/ui";
import type { CompanyProfile } from "./types";

export interface CompanyListItemContentProps {
  readonly company: CompanyProfile;
}

export function CompanyListItemContent({ company }: CompanyListItemContentProps): JSX.Element {
  return (
    <>
      <Avatar label={company.initials} color={company.color} size="md" />
      <Stack gap={0.5} flex1>
        <Text variant="title" truncate className="list-item-title">{company.name}</Text>
        <Text variant="caption" truncate className="list-item-secondary">{company.preview}</Text>
      </Stack>
    </>
  );
}
