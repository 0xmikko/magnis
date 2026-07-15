import type { JSX } from "react";
import type { EntityRendererProps } from "../../runtime/contracts/agent";
/**
 * Renders a `kind:"updated"` envelope inside the standard BaseEntityCard
 * shell (icon + clickable entity link), with a `field: before → after`
 * table. Empty `changed` (no-op update) renders a "no changes" line so the
 * static attachment never collapses to nothing.
 */
export declare function UpdatedDiffCard(props: EntityRendererProps): JSX.Element;
