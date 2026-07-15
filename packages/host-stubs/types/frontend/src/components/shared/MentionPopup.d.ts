/**
 * MentionPopup — dropdown for @-mention entity search.
 *
 * Two placement strategies:
 *   - anchor-bottom: absolute-positioned above its parent (agent composer,
 *     command bar). Default.
 *   - caret-rect: portaled to document.body with fixed positioning anchored
 *     to a live caret rect (notes editor).
 */
import type { JSX } from "react";
import type { EntitySearchResult } from "../../modules/episodes/types";
export type MentionPopupPlacement = {
    readonly mode: "anchor-bottom";
} | {
    readonly mode: "caret-rect";
    readonly rect: DOMRect;
};
export interface MentionPopupProps {
    readonly results: readonly EntitySearchResult[];
    readonly isLoading: boolean;
    readonly selectedIndex: number;
    readonly hasQuery: boolean;
    readonly activeCategory: string | null;
    readonly onSelect: (item: EntitySearchResult) => void;
    readonly onCategorySelect: (schemaId: string) => void;
    readonly onCategoryBack: () => void;
    /** Defaults to `{ mode: "anchor-bottom" }` for back-compat with existing call sites. */
    readonly placement?: MentionPopupPlacement;
}
export declare function MentionPopup(props: MentionPopupProps): JSX.Element;
/** Total number of selectable items in combo view (recent items + categories). */
export declare function comboItemCount(recentCount: number): number;
/** Number of entity categories available. */
export declare function categoryCount(): number;
