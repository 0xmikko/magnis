/**
 * Tab computation utility for entity detail pages.
 *
 * Groups linked entities by schema id and maps them to tab definitions
 * using the shared schemaVisual() registry.
 */
import type { LinkedEntitySummary } from "@magnis/sdk";
import type { IconName } from "../../components/ui/Icon";
/** What an entity card renders for a linked entity or a search hit: its
 * identity and, when the answer carries one, its card dictionary. */
export declare function entityCardData(entity: Pick<LinkedEntitySummary, "id" | "name" | "data">): Readonly<Record<string, unknown>>;
/** A group of entities of the same type within a module tab */
export interface EntityTypeGroup {
    readonly schemaId: string;
    /** Subheading label, e.g. "Chats", "Messages", "Triggers" */
    readonly label: string;
    readonly icon: IconName;
    readonly entityIds: readonly string[];
}
export interface DynamicTab {
    readonly id: string;
    /** Tab label = module title (e.g. "Telegram") */
    readonly label: string;
    readonly icon: IconName;
    readonly count: number;
    readonly entityIds: readonly string[];
    /** Entity type groups within this tab (e.g. Chats, Messages) */
    readonly groups: readonly EntityTypeGroup[];
}
export interface FixedTab {
    readonly id: string;
    readonly label: string;
}
export declare const FIXED_TABS: readonly FixedTab[];
/**
 * Compute dynamic tabs from linked entities.
 * Groups by MODULE (schema id prefix before dot), tab label = module title from registry.
 *
 * @param moduleTitles — map of moduleId → title from runtime.modules (e.g. { telegram: "Telegram" })
 */
export declare function computeDynamicTabs(linkedEntities: readonly LinkedEntitySummary[], moduleTitles: Readonly<Record<string, string>>): readonly DynamicTab[];
/**
 * Build the full tab list: fixed tabs first, then dynamic tabs.
 */
export declare function buildAllTabs(dynamicTabs: readonly DynamicTab[]): readonly {
    readonly id: string;
    readonly label: string;
}[];
