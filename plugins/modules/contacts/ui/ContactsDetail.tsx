import type { JSX } from "react";
import { EntityDetailTabs } from "@magnis/host/base";
import type { LinkedEntitySummary } from "@magnis/host/base";
import { SocialTrackingControls } from "./SocialTrackingControls";

export interface ContactsDetailProps {
  readonly entityId: string;
  readonly linkedEntities: readonly LinkedEntitySummary[];
}

export function ContactsDetail({
  entityId,
  linkedEntities,
}: ContactsDetailProps): JSX.Element {
  return (
    <>
      <EntityDetailTabs
        entityId={entityId}
        linkedEntities={linkedEntities}
        searchable
        maxVisibleTabs={7}
      />
      {/* Opt-in: track this contact on X / LinkedIn (drives the connector fetch). */}
      <SocialTrackingControls entityId={entityId} />
    </>
  );
}
