import type { JSX } from "react";
import {
  StatsGrid,
  Tag,
  Stack,
  Row,
  SectionHeader,
  NoteCard,
  AddButton,
} from "@magnis/host/ui";
import type { ContactSidebarData } from "./types";

export interface ContactsSidebarProps {
  readonly sidebarData: ContactSidebarData;
}

export function ContactsSidebar({ sidebarData }: ContactsSidebarProps): JSX.Element {
  return (
    <Stack gap={6} p={4}>
      <Stack>
        <SectionHeader title={sidebarData.statsTitle} className="mb-3" />
        <StatsGrid stats={sidebarData.stats} />
      </Stack>

      <Stack>
        <SectionHeader
          title={sidebarData.notesTitle}
          action={<AddButton />}
          className="mb-3"
        />
        {sidebarData.notes.map((note) => (
          <NoteCard key={note.meta} content={note.content} meta={note.meta} />
        ))}
      </Stack>

      <Stack>
        <SectionHeader
          title={sidebarData.tagsTitle}
          action={<AddButton />}
          className="mb-3"
        />
        <Row gap={1.5} wrap>
          {sidebarData.tags.map((tag) => (
            <Tag key={tag.label} label={tag.label} variant={tag.variant} />
          ))}
        </Row>
      </Stack>
    </Stack>
  );
}
