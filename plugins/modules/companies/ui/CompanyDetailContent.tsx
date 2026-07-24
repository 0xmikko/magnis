import type { JSX } from "react";
import {
  InfoCard,
  ChannelChip,
  Row,
} from "@magnis/host/ui";
import { EntityDetailTabs } from "@magnis/host/base";
import type { CompanyProfile } from "./types";
import type { LinkedEntitySummary, FacetSummary } from "@magnis/host/base";

export interface CompanyDetailContentProps {
  readonly company: CompanyProfile;
  readonly entityId: string;
  readonly linkedEntities: readonly LinkedEntitySummary[];
  readonly facets: readonly FacetSummary[];
  readonly fieldLabels: {
    readonly website: string;
    readonly industry: string;
    readonly size: string;
    readonly teamMembers: string;
  };
}

export function CompanyDetailContent({
  company,
  entityId,
  linkedEntities,
  facets,
  fieldLabels,
}: CompanyDetailContentProps): JSX.Element {
  const headerContent = (
    <div className="px-5 py-4">
      <InfoCard
        rows={[
          { label: fieldLabels.website, value: company.website },
          { label: fieldLabels.industry, value: company.industry },
          { label: fieldLabels.size, value: company.size },
          {
            label: `${fieldLabels.teamMembers} (${String(company.members.length)})`,
            value: (
              <Row gap={1.5} wrap className="mt-0.5">
                {company.members.map((member) => (
                  <ChannelChip key={member} label={member} />
                ))}
              </Row>
            ),
          },
        ]}
      />
    </div>
  );

  return (
    <EntityDetailTabs
      entityId={entityId}
      linkedEntities={linkedEntities}
      facets={facets}
      descriptionSchemaId="companies.description"
      memorySchemaId="companies.memory"
      headerContent={headerContent}
      maxVisibleTabs={7}
    />
  );
}
