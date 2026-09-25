import type { CompanyDetailData, CompanyListItem, CompanyProfile } from "./types";
import { toAvatarColor } from "@magnis/host/utils";

export function mapCompany(c: CompanyListItem): CompanyProfile {
  return {
    id: c.id,
    name: c.name,
    initials: c.initials,
    website: c.website ?? "",
    industry: c.industry ?? "",
    size: c.size ?? "",
    location: c.location ?? "",
    members: [],
    preview: [c.industry, c.location].filter(Boolean).join(" · "),
    time: new Date(c.created_at).toLocaleDateString(),
    color: toAvatarColor(c.avatar_color),
  };
}

export function getCompany(
  companies: readonly CompanyProfile[],
  id: string,
): CompanyProfile | undefined {
  if (companies.length === 0) return undefined;
  const companyMap = new Map(companies.map((company) => [company.id, company]));
  return companyMap.get(id) ?? companies[0];
}

export function getCompanyDetail(
  detailById: Readonly<Record<string, CompanyDetailData>>,
  id: string,
): CompanyDetailData | undefined {
  return detailById[id];
}
