/**
 * One collapsible region of the context panel.
 *
 * Plan: docs/plans/episode-agent-parity.md S9; layout in
 * docs/backend/episodes.md ("[Target] The context panel").
 *
 * The panel has three regions below the entities — todo, hypotheses, memory —
 * and they are the same shape: a header with a count, a chevron, and rows that
 * scroll inside without taking the header with them. This is that shape,
 * lifted out of `TodoBlock` where it already existed, so the three cannot
 * drift apart.
 *
 * A collapsed region keeps its header and its count, so the panel always says
 * how much it is hiding.
 */
import { type JSX, type ReactNode } from "react";
import type { IconName } from "../components/ui/Icon";
export interface PanelRegionProps {
    readonly title: string;
    readonly iconName: IconName;
    /** Shown beside the title — `1/3` for the todo, a bare count for the rest. */
    readonly count: string;
    /** Where the region sits when the user has not touched it. Todo follows its
     *  own rule (expanded while anything is unfinished); hypotheses and memory
     *  start collapsed. */
    readonly defaultCollapsed: boolean;
    /** Colour the count as done. */
    readonly complete?: boolean;
    readonly testId: string;
    readonly children: ReactNode;
}
export declare function PanelRegion({ title, iconName, count, defaultCollapsed, complete, testId, children, }: PanelRegionProps): JSX.Element;
