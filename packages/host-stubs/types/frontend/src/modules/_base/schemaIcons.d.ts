/**
 * Schema visual registry — populated by defineModule().
 *
 * No hardcoded data. Each module registers its entity types
 * with icon/label via defineModule({ entityLabels: { ... } }).
 * moduleId is derived from schema prefix (before first dot).
 */
import type { IconName } from "../../components/ui/Icon";
export interface SchemaVisual {
    readonly icon: IconName;
    readonly label: string;
    readonly tabLabel?: string;
    readonly moduleId: string;
    readonly themeColor?: string;
}
interface SchemaEntry {
    readonly icon: IconName;
    readonly label: string;
    readonly tabLabel?: string;
    readonly themeColor?: string;
}
/** Register schema visuals. Called by defineModule(). */
export declare function registerSchemaVisuals(entries: readonly {
    schemaId: string;
    entry: SchemaEntry;
}[]): void;
export declare function schemaIcon(schemaId: string): IconName;
export declare function schemaLabel(schemaId: string): string;
export declare function schemaTabLabel(schemaId: string): string;
export declare function schemaVisual(schemaId: string): SchemaVisual;
/** All registered schema entries — for mention popup categories */
export declare function allSchemaEntries(): readonly {
    readonly icon: IconName;
    readonly label: string;
    readonly schemaId: string;
}[];
export {};
