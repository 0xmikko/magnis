import type { ContactDetailData, ContactListItem, ContactProfile } from "./types";
import { toAvatarColor } from "@magnis/host/utils";

export const AVATAR_BG: Readonly<Record<string, string>> = {
  blue: "bg-blue-500",
  green: "bg-green-500",
  red: "bg-red-500",
  purple: "bg-purple-500",
  pink: "bg-pink-500",
  orange: "bg-orange-500",
};

export function mapContact(c: ContactListItem): ContactProfile {
  return {
    id: c.id,
    name: c.name,
    initials: c.initials,
    role: c.role ?? "",
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    username: c.email ? `@${c.email.split("@")[0]}` : "",
    phone: c.phone ?? "",
    email: c.email ?? "",
    channels: [...c.channels],
    preview: c.email ?? c.phone ?? "",
    time: new Date(c.created_at).toLocaleDateString(),
    listChannel: c.channels.includes("Telegram")
      ? "telegram"
      : c.channels.includes("Email")
        ? "email"
        : "file",
    color: toAvatarColor(c.avatar_color),
    isTeamMember: c.is_team_member ?? false,
  };
}

export function getContact(
  contacts: readonly ContactProfile[],
  id: string,
): ContactProfile | undefined {
  if (contacts.length === 0) return undefined;
  const contactMap = new Map(contacts.map((contact) => [contact.id, contact]));
  return contactMap.get(id) ?? contacts[0];
}

export function getContactDetail(
  detailById: Readonly<Record<string, ContactDetailData>>,
  id: string,
): ContactDetailData | undefined {
  return detailById[id];
}
