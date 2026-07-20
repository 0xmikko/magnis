import type { JSX } from "react";
import { EntityDetailTabs } from "@magnis/host/base";
import type { LinkedEntitySummary, FacetSummary } from "@magnis/host/base";
import { SocialTrackingControls } from "./SocialTrackingControls";

export interface ContactsDetailProps {
  readonly entityId: string;
  readonly linkedEntities: readonly LinkedEntitySummary[];
  readonly facets: readonly FacetSummary[];
}

export function ContactsDetail({
  entityId,
  linkedEntities,
  facets,
}: ContactsDetailProps): JSX.Element {
  return (
    <>
      <EntityDetailTabs
        entityId={entityId}
        linkedEntities={linkedEntities}
        facets={facets}
        descriptionSchemaId="contacts.description"
        memorySchemaId="contacts.memory"
        searchable
        maxVisibleTabs={7}
      />
      {/* Opt-in: track this contact on X / LinkedIn (drives the connector fetch). */}
      <SocialTrackingControls entityId={entityId} />
    </>
  );
}
