import type { JSX } from "react";
/**
 * Renders an optional bold verb prefix before an entity card's title.
 * Used by chat-surface decoration — when an `ExpandableEntityCard`
 * carries `action="Send"` etc, the registered card sticks this helper
 * inline before its existing title text.
 *
 * Returns null for undefined/empty action — zero visual change in
 * surfaces (inbox, Context panel) that don't decorate.
 *
 * @example
 *   <span className="truncate text-[12px] font-medium text-content">
 *     <ActionPrefix action={action} />
 *     {subject ?? "(no subject)"}
 *   </span>
 */
export declare function ActionPrefix({ action }: {
    readonly action?: string;
}): JSX.Element | null;
