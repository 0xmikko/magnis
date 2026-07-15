import type { AvatarColor, FacetSummary, LinkedEntitySummary } from "@magnis/host/base";
export type { FacetSummary, LinkedEntitySummary } from "@magnis/host/base";

export interface ContactListItem {
  readonly id: string;
  readonly name: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly role: string | null;
  readonly company: string | null;
  readonly channels: readonly string[];
  readonly avatar_color: string;
  readonly initials: string;
  readonly created_at: string;
  /** True iff the operator authored this contact as part of their
   *  team (employee / co-founder). Distinguishes team members from
   *  contacts ingested via Gmail/Telegram sync. Sourced from the
   *  `contacts.person.profile.is_team_member` facet. */
  readonly is_team_member?: boolean;
}

export interface ContactDetailView extends ContactListItem {
  readonly canonical: Record<string, unknown>;
  readonly facets: readonly FacetSummary[];
  readonly linked_entities: readonly LinkedEntitySummary[];
}

export interface ContactProfile {
  readonly id: string;
  readonly name: string;
  readonly initials: string;
  readonly role: string;
  readonly username: string;
  readonly phone: string;
  readonly email: string;
  readonly channels: readonly string[];
  readonly preview: string;
  readonly time: string;
  readonly listChannel: "telegram" | "email" | "file";
  readonly statusDot?: "online" | "idle" | "offline";
  readonly color: AvatarColor;
  /** True iff the operator authored this contact as a team member.
   *  Drives the "team" badge in list rows. */
  readonly isTeamMember?: boolean;
}

export interface ContactEmailEntry {
  readonly title: string;
  readonly subtitle: string;
  readonly meta: string;
}

export interface ContactMeetingEntry {
  readonly day: string;
  readonly month: string;
  readonly title: string;
  readonly subtitle: string;
  readonly meta: string;
}

export interface ContactDetailData {
  readonly statusText: string;
  readonly emails: readonly ContactEmailEntry[];
  readonly meetings: readonly ContactMeetingEntry[];
}

export interface ContactSidebarStat {
  readonly value: string;
  readonly label: string;
}

export interface ContactNote {
  readonly content: string;
  readonly meta: string;
}

export interface ContactTag {
  readonly label: string;
  readonly variant?: "gold" | "green";
}

export interface ContactSidebarData {
  readonly statsTitle: string;
  readonly stats: readonly ContactSidebarStat[];
  readonly notesTitle: string;
  readonly notes: readonly ContactNote[];
  readonly tagsTitle: string;
  readonly tags: readonly ContactTag[];
}

export interface ContactsModuleData {
  readonly listTitle: string;
  readonly searchPlaceholder: string;
  readonly sidebarTitle: string;
  readonly tabs: readonly string[];
  readonly fieldLabels: {
    readonly username: string;
    readonly phone: string;
    readonly email: string;
  };
  readonly channelsTitle: string;
  readonly contacts: readonly ContactProfile[];
  readonly detailById: Readonly<Record<string, ContactDetailData>>;
  readonly sidebarData: ContactSidebarData;
}
