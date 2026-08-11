/**
 * ContextStatsLine — compact "N tokens · P% used · $X spent" line
 * (plan agent-todo-context-panel §A.1, OpenCode Context block analog).
 *
 * INV-8 / CON-3: each segment renders only when its datum exists; the line
 * disappears entirely when none do. No placeholder values, ever.
 */
import type { JSX } from "react";
export declare function ContextStatsLine({ tokens, percent, costMicros, }: {
    readonly tokens: number | null;
    readonly percent: number | null;
    readonly costMicros: number | null;
}): JSX.Element | null;
