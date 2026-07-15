/**
 * BaseToolCallCard — shared wrapper for all tool call renderers.
 *
 * Handles the complete state machine (draft → in-flight → done/denied/failed + superseded),
 * status badge, action buttons, allowlist toggle, and overlays.
 *
 * Modules provide only the card content via children prop.
 *
 * Invariants enforced:
 * - INV-1: Always shows status badge
 * - INV-2: Failed result → "Failed" (red), never "Applied"
 * - INV-3: Superseded = opacity-50, no action buttons
 * - INV-4: Done = green badge, no action buttons
 * - INV-5: Denied = red badge, no action buttons
 * - INV-6: Draft = action buttons visible
 */
import { type ReactNode } from "react";
import type { JSX } from "react";
import type { IconName } from "../../components/ui/Icon";
export type ToolCallState = "draft" | "in-flight" | "done" | "failed" | "denied" | "superseded";
export declare function resolveToolCallState(status: "pending" | "approved" | "denied", superseded: boolean, inFlight: boolean, toolResult?: {
    result: unknown;
}): ToolCallState;
export interface BaseToolCallCardProps {
    /** Icon for the card header */
    readonly icon: IconName;
    /** Title text (e.g. "New Note", "Telegram to Chat") */
    readonly title: string;
    /** Color variant */
    readonly variant: "amber" | "sky" | "rose" | "teal" | "purple";
    /** Tool call status from payload */
    readonly status: "pending" | "approved" | "denied";
    /** Tool result from payload (checked for errors) */
    readonly toolResult?: {
        readonly id: string;
        readonly result: unknown;
    };
    /** Whether this card was superseded by a newer tool call */
    readonly superseded?: boolean;
    /** Whether this action is in the allowlist */
    readonly isAllowlisted?: boolean;
    /** Module-specific content */
    readonly children: ReactNode;
    /** Extra content rendered in the header row (between title and badge) */
    readonly headerExtra?: ReactNode;
    /** Primary action button label (default: "Apply") */
    readonly primaryLabel?: string;
    /** Primary action button icon (default: "check") */
    readonly primaryIcon?: IconName;
    /** Label when done (default: "Applied") */
    readonly doneLabel?: string;
    /** Callbacks */
    readonly onApprove: () => Promise<void> | void;
    readonly onDeny?: () => Promise<void> | void;
    readonly onEdit?: () => void;
    readonly onAllowlistToggle?: () => void;
    /** Navigation after apply (clickable done state) */
    readonly onNavigate?: () => void;
    /** When provided, completely replaces the default action bar in pending state */
    readonly customActions?: ReactNode;
}
export declare function BaseToolCallCard({ icon, title, variant, status, toolResult, superseded, isAllowlisted, children, headerExtra, primaryLabel, primaryIcon, doneLabel, onApprove, onDeny, onEdit, onAllowlistToggle, onNavigate, customActions, }: BaseToolCallCardProps): JSX.Element;
