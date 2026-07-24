import { Icon } from "@magnis/host/ui";
import { defineModule } from "@magnis/host/base";
import { ContactCard, contactHasMore } from "./EntityCards";
import { ContactBatchCreateRenderer } from "./ContactBatchCreateRenderer";
import { ContactCreateRenderer } from "./ContactCreateRenderer";
import { ContactMergeRenderer } from "./ContactMergeRenderer";
import { ContactOverview } from "./ContactOverview";

export const MOCK_TAGS: readonly string[] = [
  "Friend",
  "Partner",
  "Crypto",
  "Berlin Tech",
];

export const ContactsModule = defineModule({
  id: "contacts",
  title: "Contacts",
  icon: <Icon name="user" size={26} />,
  iconName: "user",
  themeColor: "purple",
  entityTypes: ["person"],
  primaryEntityType: "person",
  entityLabels: { person: { icon: "user", label: "Contact" } },
  rpc: { update: "contacts.update" },
  enableListRename: true,
  EntityCard: ContactCard,
  hasMore: contactHasMore,
  DetailsTabContent: ContactOverview,
  toolCallRenderers: [
    {
      actions: ["create"],
      Render: ContactCreateRenderer as never,
    },
    {
      actions: ["batch_create"],
      Render: ContactBatchCreateRenderer as never,
    },
{
      actions: ["merge"],
      Render: ContactMergeRenderer as never,
    },
  ],
  groupBy: "letter",
  getGroupLetter: (item) => item.name?.[0]?.toUpperCase() ?? "#",
  mapListItem: (raw) => ({
    id: raw.id as string,
    name: (raw.name as string | undefined) ?? null,
    schema_id: (raw.schema_id as string | undefined) ?? "",
    preview: (raw.email as string | undefined) ?? (raw.phone as string | undefined) ?? null,
    timestamp: null,
    avatar_url: (raw.avatar_url as string | undefined) ?? null,
    is_pinned: (raw.is_pinned as boolean | undefined) ?? undefined,
    is_archived: (raw.is_archived as boolean | undefined) ?? undefined,
  }),
});
