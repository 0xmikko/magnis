import { type ComponentType, type JSX } from "react";
import type { IconName } from "../../components/ui/Icon";
import type { AppRuntime } from "../../runtime/contracts/runtime";
export interface ListPaneHeaderActionsProps {
    readonly runtime: AppRuntime;
    /** Icon for the primary action button (typically "plus"). When set
     *  alongside `onAction`, renders the standard one-button affordance
     *  used across every module's list pane header. */
    readonly icon?: IconName;
    /** Click handler. Receives the runtime and an `onCreated(id)` callback
     *  so the caller can pre-select the new entity. */
    readonly onAction?: (runtime: AppRuntime, onCreated: (id: string) => void) => void | Promise<void>;
    /** Invoked with the created entity's id (passed through to `onAction`). */
    readonly onCreated?: (id: string) => void;
    /** Query keys to invalidate after `onAction` resolves so the new entity
     *  shows up in the list immediately. */
    readonly invalidateKeys?: readonly unknown[];
    /** Module-specific override. When provided, renders this component
     *  instead of the default button (used by modules with multi-action
     *  headers — e.g. a [+] alongside a filter dropdown). */
    readonly CustomComponent?: ComponentType<{
        readonly runtime: AppRuntime;
        readonly onCreated?: (id: string) => void;
    }>;
}
/**
 * Shared "plus button" used in every module's list-pane header.
 *
 * Extracted from `BaseModuleComponent` so `MeetingsModule` (and any
 * future custom-layout modules) can render the same affordance without
 * duplicating the click + invalidate + concurrent-guard logic.
 *
 * Returns `null` when there's nothing to render (no icon, no
 * `CustomComponent`) so callers can mount it unconditionally inside a
 * `headerActions` slot.
 */
export declare function ListPaneHeaderActions({ runtime, icon, onAction, onCreated, invalidateKeys, CustomComponent, }: ListPaneHeaderActionsProps): JSX.Element | null;
