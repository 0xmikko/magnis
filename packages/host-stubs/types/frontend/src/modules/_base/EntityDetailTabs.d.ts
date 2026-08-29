/**
 * Shared entity detail tabs component.
 * Renders Description, Memory, and dynamic linked-entity tabs.
 *
 * Used by contacts, companies, and projects detail views.
 * Each module can wrap this with module-specific header content.
 */
import type { JSX } from "react";
import type { LinkedEntitySummary } from "./sharedTypes";
export interface EntityDetailTabsProps {
    readonly entityId: string;
    readonly linkedEntities: readonly LinkedEntitySummary[];
    /** Max visible tabs before overflow "..." (default 7) */
    readonly maxVisibleTabs?: number;
    /** Enable search mode in tabs */
    readonly searchable?: boolean;
    /** Content to render above the tabs (e.g., InfoCard for companies) */
    readonly headerContent?: React.ReactNode;
    /** When provided, a "Details" tab is prepended (before Description /
     *  Memory / dynamic) and becomes the default active tab. Contacts
     *  use this for the Google-Contacts-style contact-info column. */
    readonly detailsContent?: React.ReactNode;
}
export declare function EntityDetailTabs({ entityId, linkedEntities, maxVisibleTabs, searchable, headerContent, detailsContent, }: EntityDetailTabsProps): JSX.Element;
