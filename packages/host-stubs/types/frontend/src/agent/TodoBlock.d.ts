/**
 * TodoBlock — live session todo list of the builtin agent
 * (plan agent-todo-context-panel §A.1; visual reference: PlanCard in
 * AgentDetailView, assembled from existing agent design tokens).
 *
 * Visibility (owner decision 2026-07-23): renders nothing only for an EMPTY
 * list. A fully finished plan STAYS visible so the user sees it is complete —
 * it just collapses by default (header + count) and expands on click, the same
 * chevron affordance the entity cards use (ExpandableEntityCard). An active
 * plan (any in_progress/pending row) is expanded by default.
 */
import { type JSX } from "react";
import type { TodoItem } from "@magnis/client-core";
export declare function TodoBlock({ items }: {
    readonly items: readonly TodoItem[];
}): JSX.Element | null;
