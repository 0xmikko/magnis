import type { AvatarColor, SidebarData } from "@magnis/host/base";
export type { CompanyDetailView, CompanyListItem } from "../types";

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
