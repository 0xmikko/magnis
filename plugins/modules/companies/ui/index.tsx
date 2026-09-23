import { toolNamesEquivalent } from "@magnis/host/agent";
import type { AgentHistoryRendererRegistration } from "@magnis/host/runtime";
import { Icon } from "@magnis/host/ui";
import { defineModule } from "@magnis/host/base";
import { CompanyCard, companyHasMore } from "./EntityCards";
import { CompanyOverview } from "./CompanyOverview";
import { CompanyCreateRenderer } from "./CompanyCreateRenderer";

const moduleDefinition = defineModule({
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
  toolCallRenderers: [{ entity: "companies.company", actions: ["create", "update"], Render: CompanyCreateRenderer as never }],
  extractAllowlistTarget: (call) => {
    const binding = call.toolBinding;
    if (binding?.entity !== "companies.company" || !["create", "update"].includes(binding.operation)) return null;
    const action = `${binding.entity}.${binding.operation}`;
    return { action, targetType: "tool_action", targetId: action, targetLabel: `${binding.operation === "create" ? "Create" : binding.operation === "merge" ? "Merge" : "Update"} company` };
  },});

const legacyRenderers: readonly AgentHistoryRendererRegistration[] = [
  { id: "companies-legacy-create", moduleId: "companies", match: (block) => typeof block.toolName === "string" && (toolNamesEquivalent(block.toolName, "companies.create") || toolNamesEquivalent(block.toolName, "company.create")), Render: CompanyCreateRenderer as never },
  { id: "companies-legacy-update", moduleId: "companies", match: (block) => typeof block.toolName === "string" && (toolNamesEquivalent(block.toolName, "companies.update") || toolNamesEquivalent(block.toolName, "company.update")), Render: CompanyCreateRenderer as never },
];

if (!moduleDefinition.agent?.historyRenderers) throw new Error("companies tool renderers missing");

export const CompaniesModule = {
  ...moduleDefinition,
  agent: { ...moduleDefinition.agent, historyRenderers: [...moduleDefinition.agent.historyRenderers, ...legacyRenderers] },
};
