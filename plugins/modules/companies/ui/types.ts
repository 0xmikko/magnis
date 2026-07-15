import type { AvatarColor, FacetSummary, LinkedEntitySummary, SidebarData } from "@magnis/host/base";

export interface CompanyListItem {
  readonly id: string;
  readonly name: string;
  readonly website: string | null;
  readonly industry: string | null;
  readonly size: string | null;
  readonly location: string | null;
  readonly avatar_color: string;
  readonly initials: string;
  readonly created_at: string;
}

export interface CompanyDetailView extends CompanyListItem {
  readonly canonical: Record<string, unknown>;
  readonly facets: readonly FacetSummary[];
  readonly linked_entities: readonly LinkedEntitySummary[];
}

export interface CompanyProfile {
  readonly id: string;
  readonly name: string;
  readonly initials: string;
  readonly website: string;
  readonly industry: string;
  readonly size: string;
  readonly location: string;
  readonly members: readonly string[];
  readonly preview: string;
  readonly time: string;
  readonly color: AvatarColor;
}

export interface CompanyActivityItem {
  readonly icon: "message" | "calendar" | "file";
  readonly title: string;
  readonly subtitle: string;
}

export interface CompanyDetailData {
  readonly activities: readonly CompanyActivityItem[];
}

export interface CompaniesModuleData {
  readonly listTitle: string;
  readonly searchPlaceholder: string;
  readonly sidebarTitle: string;
  readonly fieldLabels: {
    readonly website: string;
    readonly industry: string;
    readonly size: string;
    readonly teamMembers: string;
  };
  readonly tabs: readonly string[];
  readonly companies: readonly CompanyProfile[];
  readonly detailById: Readonly<Record<string, CompanyDetailData>>;
  readonly sidebar: SidebarData;
}
