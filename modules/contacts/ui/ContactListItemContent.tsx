import type { JSX } from "react";
import {
  Avatar,
  Stack,
  Text,
} from "@magnis/host/ui";
import type { ContactProfile } from "./types";

export interface ContactListItemContentProps {
  readonly profile: ContactProfile;
}

export function ContactListItemContent({ profile }: ContactListItemContentProps): JSX.Element {
  return (
    <>
      <Avatar label={profile.initials} color={profile.color} size="md" />
      <Stack gap={0.5} flex1>
        <div className="flex items-center gap-2 min-w-0">
          <Text variant="title" truncate className="list-item-title">{profile.name}</Text>
          {profile.isTeamMember ? <TeamBadge /> : null}
        </div>
        <Text variant="caption" truncate className="list-item-secondary">{profile.role}</Text>
      </Stack>
    </>
  );
}

/**
 * Compact pill rendered next to the contact's name when the contact
 * was authored as part of the operator's team (not ingested via a
 * sync source). Visual: small orange chip with the text "team".
 */
function TeamBadge(): JSX.Element {
  return (
    <span
      title="Team member — authored by you, not synced from an external source"
      className="shrink-0 rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-orange-400"
    >
      team
    </span>
  );
}
