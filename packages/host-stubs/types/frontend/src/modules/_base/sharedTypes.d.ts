export interface FacetSummary {
    readonly id: string;
    readonly schema_id: string;
    readonly source: string;
    readonly observed_at: string;
    readonly data: unknown;
}
export interface LinkedEntitySummary {
    readonly id: string;
    readonly name: string | null;
    readonly schema_id: string;
    readonly link_kind: string;
    readonly data?: Readonly<Record<string, unknown>>;
}
export type AvatarColor = "orange" | "blue" | "green" | "red" | "purple" | "pink" | "gray";
export declare const AVATAR_COLOR_CLASSES: Readonly<Record<AvatarColor, string>>;
export type SidebarIcon = "mail" | "send" | "calendar" | "phone" | "file";
export interface SidebarItem {
    readonly icon: SidebarIcon;
    readonly title: string;
    readonly subtitles: readonly string[];
    readonly actionLabel?: string;
    readonly tone: "default" | "highlight" | "muted";
}
export interface SidebarSection {
    readonly title: string;
    readonly pill?: string;
    readonly items: readonly SidebarItem[];
}
export interface SidebarData {
    readonly panelTitle: string;
    readonly sections: readonly SidebarSection[];
}
