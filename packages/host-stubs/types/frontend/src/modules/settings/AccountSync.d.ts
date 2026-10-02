import type { JSX } from "react";
import type { AccountSyncState } from "@magnis/sdk";
import type { Badge, Tone } from "../../api/sourceStatus";
export declare const TONE_TEXT: Readonly<Record<Tone, string>>;
export declare const TONE_DOT: Readonly<Record<Tone, string>>;
/** The surface's status line — the stage or the hold with its estimate,
 * next check or countdown — re-rendered once a second only while a
 * `retryAt` is on screen. The panel's blocks and the StatusBar print it. */
export declare function useStatusLine(sync: AccountSyncState | null): Badge;
/**
 * A collapsed account row's right-hand side: the surface's status in its own
 * colour and nothing else — what the row used to spend on a flat "Connected".
 * The counts belong to the expanded block (owner, 2026-09-20).
 */
export declare function AccountRowSync({ sync }: {
    sync: AccountSyncState | null;
}): JSX.Element;
/**
 * One surface's sync, printed from its state alone: the status line and one
 * line per entity schema in the module's declared order; an interrupted
 * hold prints its message on the expanded row.
 *
 * @tested-by: tst_fe_unit_accountsync_001..006
 */
export declare function AccountSync({ sync, expanded, showStatus }: {
    sync: AccountSyncState | null;
    expanded?: boolean;
    showStatus?: boolean;
}): JSX.Element;
