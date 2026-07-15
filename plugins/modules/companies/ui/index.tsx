import { Icon } from "@magnis/host/ui";
import { defineModule } from "@magnis/host/base";
import { CompanyCard, companyHasMore } from "./EntityCards";
import { CompanyOverview } from "./CompanyOverview";
import { CompanyCreateRenderer } from "./CompanyCreateRenderer";

export const CompaniesModule = defineModule({
  id: "companies",
  title: "Companies",
  icon: <Icon name="building" size={26} />,
  iconName: "building",
  themeColor: "green",
  entityTypes: ["company"],
  primaryEntityType: "company",
  entityLabels: {
    company: {
      label: "Company",
      tabLabel: "Companies",
      EntityCard: CompanyCard,
      hasMore: companyHasMore,
    },
  },
  // Overview tab pattern mirrors contacts. Drops the old
  // CompanyDetailPanel wrapper — info column + description live
  // inside the standard EntityDetailTabs surface. Overview is
  // ALWAYS the tab for a company; when there's no enrichment,
  // CompanyOverview renders just the description full-width
  // without card chrome.
  DetailsTabContent: CompanyOverview,
  toolCallRenderers: [
    {
      actions: ["create"],
      Render: CompanyCreateRenderer as never,
    },
  ],
});
