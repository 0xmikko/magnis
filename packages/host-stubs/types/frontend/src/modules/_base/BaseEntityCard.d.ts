import { type ReactNode, type JSX } from "react";
import type { EntityRendererProps } from "../../runtime/contracts/agent";
/**
 * Standard entity card shell — ALL entity cards MUST use this.
 *
 * Provides:
 *   - <a href> navigation to /{module}/{type}/{id}
 *   - Module icon in module themeColor (left side)
 *   - children slot for custom content (right side)
 *
 * If no children, renders entity name.
 */
export declare function BaseEntityCard({ schemaId, data, runtime, action, children, }: EntityRendererProps & {
    readonly children?: ReactNode;
}): JSX.Element;
