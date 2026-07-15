/**
 * Shared entity detail tabs component.
 * Renders Description, Memory, and dynamic linked-entity tabs.
 *
 * Used by contacts, companies, and projects detail views.
 * Each module can wrap this with module-specific header content.
 */
import type { JSX } from "react";
import type { LinkedEntitySummary, FacetSummary } from "./sharedTypes";
export interface EntityDetailTabsProps {
    readonly entityId: string;
    readonly linkedEntities: readonly LinkedEntitySummary[];
    readonly facets: readonly FacetSummary[];
    /** Facet schema ID for description (e.g. "contacts.person.description") */
    readonly descriptionSchemaId: string;
    /** Facet schema ID for memory (e.g. "contacts.person.memory") */
    readonly memorySchemaId: string;
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
export declare function EntityDetailTabs({ entityId, linkedEntities, facets: _facets, descriptionSchemaId, memorySchemaId, maxVisibleTabs, searchable, headerContent, detailsContent, }: EntityDetailTabsProps): JSX.Element;
