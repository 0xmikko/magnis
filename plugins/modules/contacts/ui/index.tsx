import { Icon } from "@magnis/host/ui";
import { defineModule } from "@magnis/host/base";
import { ContactCard, contactHasMore } from "./EntityCards";
import { ContactBatchCreateRenderer } from "./ContactBatchCreateRenderer";
import { ContactCreateRenderer } from "./ContactCreateRenderer";
import { ContactMergeRenderer } from "./ContactMergeRenderer";
import { ContactOverview } from "./ContactOverview";

// eslint-disable-next-line react-refresh/only-export-components
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
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    name: (raw.name as string) ?? null,
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    schema_id: (raw.schema_id as string) ?? "",
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    preview: (raw.email as string) ?? (raw.phone as string) ?? null,
    timestamp: null,
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    avatar_url: (raw.avatar_url as string) ?? null,
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    is_pinned: (raw.is_pinned as boolean) ?? undefined,
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    is_archived: (raw.is_archived as boolean) ?? undefined,
  }),
});
