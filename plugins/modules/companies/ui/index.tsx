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
      actions: ["create", "update"],
      Render: CompanyCreateRenderer as never,
    },
  ],
  extractAllowlistTarget: (toolCall) => {
    const aliases: Readonly<Record<string, "companies.create" | "companies.update">> = {
      "companies.create": "companies.create",
      companies_create: "companies.create",
      "company.create": "companies.create",
      company_create: "companies.create",
      "companies.update": "companies.update",
      companies_update: "companies.update",
      "company.update": "companies.update",
      company_update: "companies.update",
    };
    const action = aliases[toolCall.name];
    if (!action) return null;
    const isUpdate = action === "companies.update";
    return {
      action,
      targetType: "tool_action",
      targetId: action,
      targetLabel: isUpdate ? "Update company" : "Create company",
    };
  },
});
